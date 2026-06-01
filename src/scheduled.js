// Agendamentos automáticos - executados pelo Cloudflare Cron Triggers

export async function handleScheduled(event, env) {
  const cron = event.cron;
  console.log('[Cron] Executando:', cron);

  // A cada 30 minutos — sincroniza pedidos
  if (cron === '*/30 * * * *') {
    await sincronizarPedidos(env);
  }

  // 17h30 todo dia — resumo WhatsApp
  if (cron === '30 17 * * *') {
    await enviarResumoWhatsApp(env);
  }

  // 8h todo dia — alerta de pedidos parados
  if (cron === '0 8 * * *') {
    await verificarPedidosParados(env);
  }
}

async function sincronizarPedidos(env) {
  if (!env.ML_CLIENT_ID) return;
  try {
    const tok = await env.DB.prepare(
      `SELECT * FROM integracoes_tokens WHERE plataforma='mercadolivre'`
    ).first();
    if (!tok) return;

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
      await env.DB.prepare(
        `INSERT INTO pedidos (id_externo, plataforma, produto_nome, valor_cliente, taxa_plataforma, lucro, status)
         VALUES (?,?,?,?,?,?,'Novo')`
      ).bind(`ML-${p.id}`, 'Mercado Livre', item?.item?.title || 'Produto ML', valorCliente, taxaML, valorCliente - taxaML).run();
      novos++;
    }

    if (novos > 0) {
      await env.DB.prepare(`INSERT INTO alertas (tipo, mensagem) VALUES ('info',?)`)
        .bind(`${novos} novo(s) pedido(s) do Mercado Livre`).run();
    }
    console.log(`[Sync ML] ${novos} novos pedidos`);
  } catch (e) {
    console.error('[Sync ML] Erro:', e.message);
  }
}

async function enviarResumoWhatsApp(env) {
  if (!env.ZAPI_INSTANCE_ID || !env.WHATSAPP_NUMBER) return;
  try {
    const hoje = await env.DB.prepare(`
      SELECT COUNT(*) as totalPedidos,
        COALESCE(SUM(valor_cliente),0) as totalVendas,
        COALESCE(SUM(valor_fornecedor),0) as totalRepasse,
        COALESCE(SUM(taxa_plataforma+taxa_frete+outras_taxas),0) as totalTaxas,
        COALESCE(SUM(lucro),0) as lucro
      FROM pedidos WHERE date(criado_em) = date('now')
    `).first();

    const pEnvio = await env.DB.prepare(`SELECT COUNT(*) as t FROM pedidos WHERE status='Novo'`).first();
    const pRepasse = await env.DB.prepare(`SELECT COUNT(*) as t FROM repasses WHERE status='pendente'`).first();

    const fmt = v => `R$ ${Number(v||0).toFixed(2).replace('.', ',')}`;
    const data = new Date().toLocaleDateString('pt-BR');
    const emoji = hoje.lucro >= 0 ? '✅' : '⚠️';

    let msg = `🃏 *GeekCard - Resumo ${data}*\n\n`;
    msg += `📦 *Pedidos hoje:* ${hoje.totalPedidos}\n`;
    msg += `💰 *Recebido:* ${fmt(hoje.totalVendas)}\n`;
    msg += `🏭 *Repassado fornec.:* ${fmt(hoje.totalRepasse)}\n`;
    msg += `📊 *Taxas:* ${fmt(hoje.totalTaxas)}\n`;
    msg += `${emoji} *Lucro líquido:* ${fmt(hoje.lucro)}\n\n`;
    if (pEnvio.t > 0) msg += `🔴 *${pEnvio.t} pedido(s) aguardando envio ao fornecedor*\n`;
    if (pRepasse.t > 0) msg += `💸 *${pRepasse.t} repasse(s) pendente(s)*\n`;
    msg += `\n_Acesse geekcard.pages.dev para detalhes._`;

    await fetch(
      `https://api.z-api.io/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}/send-text`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Client-Token': env.ZAPI_CLIENT_TOKEN },
        body: JSON.stringify({ phone: env.WHATSAPP_NUMBER, message: msg }),
      }
    );
    console.log('[WhatsApp] Resumo enviado');
  } catch (e) {
    console.error('[WhatsApp] Erro:', e.message);
  }
}

async function verificarPedidosParados(env) {
  try {
    const parados = await env.DB.prepare(`
      SELECT COUNT(*) as total FROM pedidos
      WHERE status='Novo' AND datetime(criado_em) < datetime('now', '-24 hours')
    `).first();
    if (parados.total > 0) {
      await env.DB.prepare(`INSERT INTO alertas (tipo, mensagem) VALUES ('warning',?)`)
        .bind(`${parados.total} pedido(s) sem ação há mais de 24 horas`).run();
    }
  } catch (e) {
    console.error('[Alerta] Erro:', e.message);
  }
}
