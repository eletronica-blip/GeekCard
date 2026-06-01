import { autenticar, jsonResp, erroResp } from '../auth.js';

export async function handleDash(request, env, cors) {
  const user = await autenticar(request, env);
  if (!user) return erroResp('Não autenticado', 401);

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const h = { ...cors };

  // Resumo por período
  if (path === '/api/dash/resumo' && method === 'GET') {
    const periodo = url.searchParams.get('periodo') || 'mes';
    let filtro = "date(criado_em) = date('now')";
    if (periodo === 'semana') filtro = "criado_em >= datetime('now', '-7 days')";
    if (periodo === 'mes') filtro = "strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now')";

    const resumo = await env.DB.prepare(`
      SELECT COUNT(*) as totalPedidos,
        COALESCE(SUM(valor_cliente),0) as totalVendas,
        COALESCE(SUM(valor_fornecedor),0) as totalRepasse,
        COALESCE(SUM(taxa_plataforma+taxa_frete+outras_taxas),0) as totalTaxas,
        COALESCE(SUM(lucro),0) as lucro
      FROM pedidos WHERE ${filtro}
    `).first();

    const { results: porPlataforma } = await env.DB.prepare(`
      SELECT plataforma, COUNT(*) as pedidos,
        SUM(valor_cliente) as total, SUM(lucro) as lucro
      FROM pedidos WHERE ${filtro}
      GROUP BY plataforma ORDER BY total DESC
    `).all();

    const pEnvio = await env.DB.prepare(`SELECT COUNT(*) as t FROM pedidos WHERE status='Novo'`).first();
    const pRepasse = await env.DB.prepare(`SELECT COUNT(*) as t FROM repasses WHERE status='pendente'`).first();

    return jsonResp({ resumo, porPlataforma, pendentesEnvio: pEnvio.t, pendentesRepasse: pRepasse.t }, 200, h);
  }

  // Alertas
  if (path === '/api/dash/alertas' && method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM alertas WHERE lido=0 ORDER BY criado_em DESC LIMIT 20`
    ).all();
    return jsonResp(results, 200, h);
  }

  if (path.match(/^\/api\/dash\/alertas\/\d+\/ler$/) && method === 'POST') {
    const id = path.split('/')[4];
    await env.DB.prepare('UPDATE alertas SET lido=1 WHERE id=?').bind(id).run();
    return jsonResp({ ok: true }, 200, h);
  }

  if (path === '/api/dash/alertas/ler-todos' && method === 'POST') {
    await env.DB.prepare('UPDATE alertas SET lido=1').run();
    return jsonResp({ ok: true }, 200, h);
  }

  // Sincronizar manualmente
  if (path === '/api/dash/sincronizar' && method === 'POST') {
    const mlRes = await sincronizarML(env).catch(e => ({ ok: false, novos: 0, msg: e.message }));
    if (mlRes.novos > 0) {
      await env.DB.prepare(`INSERT INTO alertas (tipo, mensagem) VALUES ('info',?)`)
        .bind(`${mlRes.novos} novo(s) pedido(s) do Mercado Livre`).run();
    }
    return jsonResp({ mercadolivre: mlRes, shopee: { ok: true, novos: 0 } }, 200, h);
  }

  // Boas-vindas
  if (path === '/api/dash/boas-vindas' && method === 'GET') {
    const hoje = await env.DB.prepare(`
      SELECT COUNT(*) as totalPedidos,
        COALESCE(SUM(valor_cliente),0) as totalVendas,
        COALESCE(SUM(lucro),0) as lucro
      FROM pedidos WHERE date(criado_em) = date('now')
    `).first();
    const pEnvio = await env.DB.prepare(`SELECT COUNT(*) as t FROM pedidos WHERE status='Novo'`).first();
    const pRepasse = await env.DB.prepare(`SELECT COUNT(*) as t FROM repasses WHERE status='pendente'`).first();
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Bem-vindo de volta';
    return jsonResp({ saudacao, hoje, pedidosPendentes: pEnvio.t, repassesPendentes: pRepasse.t }, 200, h);
  }

  return erroResp('Rota não encontrada', 404);
}

async function sincronizarML(env) {
  const tok = await env.DB.prepare(
    `SELECT * FROM integracoes_tokens WHERE plataforma='mercadolivre'`
  ).first();
  if (!tok) return { ok: false, novos: 0, msg: 'Mercado Livre não conectado' };

  // Refresh token se necessário
  let token = tok.access_token;
  if (new Date(tok.expires_at) < new Date(Date.now() + 60000)) {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: env.ML_CLIENT_ID,
        client_secret: env.ML_CLIENT_SECRET,
        refresh_token: tok.refresh_token,
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      token = data.access_token;
      await env.DB.prepare(
        `UPDATE integracoes_tokens SET access_token=?,refresh_token=?,expires_at=?,atualizado_em=datetime('now') WHERE plataforma='mercadolivre'`
      ).bind(data.access_token, data.refresh_token, new Date(Date.now() + data.expires_in * 1000).toISOString()).run();
    }
  }

  const me = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());

  const ontem = new Date(Date.now() - 86400000).toISOString();
  const res = await fetch(
    `https://api.mercadolibre.com/orders/search/recent?seller=${me.id}&sort=date_desc&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then(r => r.json());

  let novos = 0;
  for (const p of res.results || []) {
    const existe = await env.DB.prepare('SELECT id FROM pedidos WHERE id_externo=?').bind(`ML-${p.id}`).first();
    if (existe) continue;
    const item = p.order_items?.[0];
    const valorCliente = p.total_amount || 0;
    const taxaML = p.marketplace_fee || (valorCliente * 0.12);
    const lucro = valorCliente - taxaML;
    await env.DB.prepare(
      `INSERT INTO pedidos (id_externo, plataforma, produto_nome, valor_cliente, taxa_plataforma, lucro, status)
       VALUES (?,?,?,?,?,?,'Novo')`
    ).bind(`ML-${p.id}`, 'Mercado Livre', item?.item?.title || 'Produto ML', valorCliente, taxaML, lucro).run();
    novos++;
  }
  return { ok: true, novos };
}
