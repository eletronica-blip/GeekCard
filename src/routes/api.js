import { Router } from 'express';
import { getDb, run, queryOne } from '../services/db.js';
import { autenticar } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const r = Router();

// AUTH
r.post('/auth/login', (req, res) => {
  const { senha } = req.body;
  if (senha !== process.env.ADMIN_PASSWORD) return res.status(401).json({ erro: 'Senha incorreta' });
  const token = jwt.sign({ user: 'admin' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ ok: true, token });
});

r.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// PEDIDOS
r.get('/pedidos', autenticar, (req, res) => {
  const db = getDb();
  const { status, plataforma, limite = 100 } = req.query;
  let sql = `SELECT p.*, f.nome as fornecedor_nome FROM pedidos p
             LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  if (plataforma) { sql += ' AND p.plataforma = ?'; params.push(plataforma); }
  sql += ` ORDER BY p.criado_em DESC LIMIT ${parseInt(limite)}`;
  res.json(db.prepare(sql).all(params));
});

r.post('/pedidos', autenticar, (req, res) => {
  const { plataforma, produto_nome, produto_id, fornecedor_id, valor_cliente,
          valor_fornecedor, taxa_plataforma, taxa_frete, outras_taxas, observacao } = req.body;
  const result = run(`INSERT INTO pedidos (plataforma, produto_nome, produto_id, fornecedor_id,
    valor_cliente, valor_fornecedor, taxa_plataforma, taxa_frete, outras_taxas, observacao)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [plataforma, produto_nome, produto_id, fornecedor_id, valor_cliente || 0,
     valor_fornecedor || 0, taxa_plataforma || 0, taxa_frete || 0, outras_taxas || 0, observacao]);
  res.json({ id: result.lastInsertRowid });
});

r.patch('/pedidos/:id/status', autenticar, (req, res) => {
  const seq = ['Novo', 'Enviado', 'Despachado', 'Entregue'];
  const p = queryOne('SELECT * FROM pedidos WHERE id = ?', [req.params.id]);
  if (!p) return res.status(404).json({ erro: 'Pedido não encontrado' });
  const novoStatus = req.body.status || seq[Math.min(seq.indexOf(p.status) + 1, 3)];
  run('UPDATE pedidos SET status = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?', [novoStatus, p.id]);
  res.json({ ok: true, status: novoStatus });
});

r.delete('/pedidos/:id', autenticar, (req, res) => {
  run('DELETE FROM pedidos WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// FORNECEDORES
r.get('/fornecedores', autenticar, (req, res) => {
  const db = getDb();
  const lista = db.prepare(`
    SELECT f.*,
      COUNT(p.id) as total_pedidos,
      COALESCE(SUM(p.valor_fornecedor), 0) as total_devido,
      COALESCE((SELECT SUM(valor) FROM repasses WHERE fornecedor_id = f.id AND status = 'pago'), 0) as total_pago
    FROM fornecedores f
    LEFT JOIN pedidos p ON p.fornecedor_id = f.id
    WHERE f.ativo = 1
    GROUP BY f.id ORDER BY f.nome
  `).all();
  res.json(lista);
});

r.post('/fornecedores', autenticar, (req, res) => {
  const { nome, contato, prazo_dias, forma_pagamento, chave_pagamento } = req.body;
  const result = run(`INSERT INTO fornecedores (nome, contato, prazo_dias, forma_pagamento, chave_pagamento)
    VALUES (?, ?, ?, ?, ?)`, [nome, contato, prazo_dias || 3, forma_pagamento || 'Pix', chave_pagamento]);
  res.json({ id: result.lastInsertRowid });
});

r.put('/fornecedores/:id', autenticar, (req, res) => {
  const { nome, contato, prazo_dias, forma_pagamento, chave_pagamento } = req.body;
  run(`UPDATE fornecedores SET nome=?, contato=?, prazo_dias=?, forma_pagamento=?, chave_pagamento=? WHERE id=?`,
    [nome, contato, prazo_dias, forma_pagamento, chave_pagamento, req.params.id]);
  res.json({ ok: true });
});

r.delete('/fornecedores/:id', autenticar, (req, res) => {
  run('UPDATE fornecedores SET ativo = 0 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// PRODUTOS
r.get('/produtos', autenticar, (req, res) => {
  const db = getDb();
  const lista = db.prepare(`
    SELECT pr.*, f.nome as fornecedor_nome,
      COUNT(p.id) as total_vendas,
      COALESCE(SUM(p.lucro), 0) as lucro_total
    FROM produtos pr
    LEFT JOIN fornecedores f ON pr.fornecedor_id = f.id
    LEFT JOIN pedidos p ON p.produto_id = pr.id
    WHERE pr.ativo = 1
    GROUP BY pr.id ORDER BY total_vendas DESC
  `).all();
  res.json(lista);
});

r.post('/produtos', autenticar, (req, res) => {
  const { nome, sku, fornecedor_id, preco_custo, preco_venda } = req.body;
  const result = run(`INSERT INTO produtos (nome, sku, fornecedor_id, preco_custo, preco_venda)
    VALUES (?, ?, ?, ?, ?)`, [nome, sku, fornecedor_id, preco_custo || 0, preco_venda || 0]);
  res.json({ id: result.lastInsertRowid });
});

r.put('/produtos/:id', autenticar, (req, res) => {
  const { nome, sku, fornecedor_id, preco_custo, preco_venda } = req.body;
  run(`UPDATE produtos SET nome=?, sku=?, fornecedor_id=?, preco_custo=?, preco_venda=? WHERE id=?`,
    [nome, sku, fornecedor_id, preco_custo, preco_venda, req.params.id]);
  res.json({ ok: true });
});

// FINANCEIRO - REPASSES
r.get('/repasses', autenticar, (req, res) => {
  const db = getDb();
  const lista = db.prepare(`
    SELECT r.*, f.nome as fornecedor_nome FROM repasses r
    JOIN fornecedores f ON r.fornecedor_id = f.id
    ORDER BY r.criado_em DESC LIMIT 100
  `).all();
  res.json(lista);
});

r.post('/repasses', autenticar, (req, res) => {
  const { fornecedor_id, valor, forma_pagamento, observacao } = req.body;
  const result = run(`INSERT INTO repasses (fornecedor_id, valor, forma_pagamento, status, observacao)
    VALUES (?, ?, ?, 'pago', ?)`, [fornecedor_id, valor, forma_pagamento || 'Pix', observacao]);
  res.json({ id: result.lastInsertRowid });
});

// INTEGRAÇÕES STATUS
r.get('/integracoes', autenticar, (req, res) => {
  const db = getDb();
  const tokens = db.prepare('SELECT plataforma, expires_at, atualizado_em FROM integracoes_tokens').all();
  const status = { mercadolivre: false, shopee: false, tiktok: false };
  for (const t of tokens) {
    if (new Date(t.expires_at) > new Date()) status[t.plataforma] = true;
  }
  res.json(status);
});

// AUTH CALLBACKS
r.get('/auth/mercadolivre/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?erro=ml_sem_codigo');
  try {
    const { trocarCodigo } = await import('../services/mercadolivre.js');
    await trocarCodigo(code);
    res.redirect('/?sucesso=ml_conectado');
  } catch (e) {
    res.redirect('/?erro=ml_falha');
  }
});

r.get('/auth/shopee/callback', async (req, res) => {
  const { code, shop_id } = req.query;
  if (!code) return res.redirect('/?erro=shopee_sem_codigo');
  try {
    const { trocarCodigo } = await import('../services/shopee.js');
    await trocarCodigo(code, shop_id);
    res.redirect('/?sucesso=shopee_conectada');
  } catch (e) {
    res.redirect('/?erro=shopee_falha');
  }
});

export default r;
