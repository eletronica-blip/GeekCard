import { autenticar, jsonResp, erroResp } from '../auth.js';

export async function handleApi(request, env, cors) {
  const user = await autenticar(request, env);
  if (!user) return erroResp('Não autenticado', 401);

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const h = { ...cors };

  // ── PEDIDOS ──────────────────────────────────────────
  if (path === '/api/pedidos' && method === 'GET') {
    const status = url.searchParams.get('status') || '';
    const plat = url.searchParams.get('plataforma') || '';
    const limite = parseInt(url.searchParams.get('limite') || '100');
    let sql = `SELECT p.*, f.nome as fornecedor_nome FROM pedidos p
               LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND p.status = ?'; params.push(status); }
    if (plat) { sql += ' AND p.plataforma = ?'; params.push(plat); }
    sql += ` ORDER BY p.criado_em DESC LIMIT ${limite}`;
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return jsonResp(results, 200, h);
  }

  if (path === '/api/pedidos' && method === 'POST') {
    const b = await request.json();
    const lucro = (b.valor_cliente||0) - (b.valor_fornecedor||0) - (b.taxa_plataforma||0) - (b.taxa_frete||0) - (b.outras_taxas||0);
    const r = await env.DB.prepare(
      `INSERT INTO pedidos (plataforma, produto_nome, produto_id, fornecedor_id,
       valor_cliente, valor_fornecedor, taxa_plataforma, taxa_frete, outras_taxas, lucro, observacao)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(b.plataforma, b.produto_nome, b.produto_id||null, b.fornecedor_id||null,
      b.valor_cliente||0, b.valor_fornecedor||0, b.taxa_plataforma||0,
      b.taxa_frete||0, b.outras_taxas||0, lucro, b.observacao||'').run();
    return jsonResp({ id: r.meta.last_row_id }, 200, h);
  }

  if (path.match(/^\/api\/pedidos\/\d+\/status$/) && method === 'PATCH') {
    const id = path.split('/')[3];
    const seq = ['Novo','Enviado','Despachado','Entregue'];
    const pedido = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
    if (!pedido) return erroResp('Pedido não encontrado', 404);
    const b = await request.json().catch(() => ({}));
    const novoStatus = b.status || seq[Math.min(seq.indexOf(pedido.status)+1, 3)];
    await env.DB.prepare(`UPDATE pedidos SET status=?, atualizado_em=datetime('now') WHERE id=?`).bind(novoStatus, id).run();
    return jsonResp({ ok: true, status: novoStatus }, 200, h);
  }

  if (path.match(/^\/api\/pedidos\/\d+$/) && method === 'DELETE') {
    const id = path.split('/')[3];
    await env.DB.prepare('DELETE FROM pedidos WHERE id = ?').bind(id).run();
    return jsonResp({ ok: true }, 200, h);
  }

  // ── FORNECEDORES ──────────────────────────────────────
  if (path === '/api/fornecedores' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT f.*,
        COUNT(p.id) as total_pedidos,
        COALESCE(SUM(p.valor_fornecedor),0) as total_devido,
        COALESCE((SELECT SUM(valor) FROM repasses WHERE fornecedor_id=f.id AND status='pago'),0) as total_pago
      FROM fornecedores f
      LEFT JOIN pedidos p ON p.fornecedor_id = f.id
      WHERE f.ativo = 1
      GROUP BY f.id ORDER BY f.nome
    `).all();
    return jsonResp(results, 200, h);
  }

  if (path === '/api/fornecedores' && method === 'POST') {
    const b = await request.json();
    const r = await env.DB.prepare(
      `INSERT INTO fornecedores (nome, contato, prazo_dias, forma_pagamento, chave_pagamento)
       VALUES (?,?,?,?,?)`
    ).bind(b.nome, b.contato||'', b.prazo_dias||3, b.forma_pagamento||'Pix', b.chave_pagamento||'').run();
    return jsonResp({ id: r.meta.last_row_id }, 200, h);
  }

  if (path.match(/^\/api\/fornecedores\/\d+$/) && method === 'PUT') {
    const id = path.split('/')[3];
    const b = await request.json();
    await env.DB.prepare(
      `UPDATE fornecedores SET nome=?,contato=?,prazo_dias=?,forma_pagamento=?,chave_pagamento=? WHERE id=?`
    ).bind(b.nome, b.contato, b.prazo_dias, b.forma_pagamento, b.chave_pagamento, id).run();
    return jsonResp({ ok: true }, 200, h);
  }

  if (path.match(/^\/api\/fornecedores\/\d+$/) && method === 'DELETE') {
    const id = path.split('/')[3];
    await env.DB.prepare('UPDATE fornecedores SET ativo=0 WHERE id=?').bind(id).run();
    return jsonResp({ ok: true }, 200, h);
  }

  // ── PRODUTOS ──────────────────────────────────────────
  if (path === '/api/produtos' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT pr.*, f.nome as fornecedor_nome,
        COUNT(p.id) as total_vendas,
        COALESCE(SUM(p.lucro),0) as lucro_total
      FROM produtos pr
      LEFT JOIN fornecedores f ON pr.fornecedor_id = f.id
      LEFT JOIN pedidos p ON p.produto_id = pr.id
      WHERE pr.ativo = 1
      GROUP BY pr.id ORDER BY total_vendas DESC
    `).all();
    return jsonResp(results, 200, h);
  }

  if (path === '/api/produtos' && method === 'POST') {
    const b = await request.json();
    const r = await env.DB.prepare(
      `INSERT INTO produtos (nome, sku, fornecedor_id, preco_custo, preco_venda) VALUES (?,?,?,?,?)`
    ).bind(b.nome, b.sku||'', b.fornecedor_id||null, b.preco_custo||0, b.preco_venda||0).run();
    return jsonResp({ id: r.meta.last_row_id }, 200, h);
  }

  if (path.match(/^\/api\/produtos\/\d+$/) && method === 'PUT') {
    const id = path.split('/')[3];
    const b = await request.json();
    await env.DB.prepare(
      `UPDATE produtos SET nome=?,sku=?,fornecedor_id=?,preco_custo=?,preco_venda=? WHERE id=?`
    ).bind(b.nome, b.sku, b.fornecedor_id, b.preco_custo, b.preco_venda, id).run();
    return jsonResp({ ok: true }, 200, h);
  }

  // ── REPASSES ──────────────────────────────────────────
  if (path === '/api/repasses' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT r.*, f.nome as fornecedor_nome FROM repasses r
      JOIN fornecedores f ON r.fornecedor_id = f.id
      ORDER BY r.criado_em DESC LIMIT 100
    `).all();
    return jsonResp(results, 200, h);
  }

  if (path === '/api/repasses' && method === 'POST') {
    const b = await request.json();
    const r = await env.DB.prepare(
      `INSERT INTO repasses (fornecedor_id, valor, forma_pagamento, status, observacao)
       VALUES (?,?,?,'pago',?)`
    ).bind(b.fornecedor_id, b.valor, b.forma_pagamento||'Pix', b.observacao||'').run();
    return jsonResp({ id: r.meta.last_row_id }, 200, h);
  }

  // ── INTEGRAÇÕES ───────────────────────────────────────
  if (path === '/api/integracoes' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT plataforma, expires_at FROM integracoes_tokens').all();
    const status = { mercadolivre: false, shopee: false, tiktok: false };
    for (const t of results) {
      if (new Date(t.expires_at) > new Date()) status[t.plataforma] = true;
    }
    // Adiciona URL de auth do ML
    const mlUrl = env.ML_CLIENT_ID
      ? `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${env.ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(new URL(request.url).origin + '/api/auth/mercadolivre/callback')}`
      : null;
    return jsonResp({ ...status, ml_auth_url: mlUrl }, 200, h);
  }

  return erroResp('Rota não encontrada', 404);
}
