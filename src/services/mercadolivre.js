import axios from 'axios';
import { getDb, run, queryOne } from './db.js';

const ML_BASE = 'https://api.mercadolibre.com';
const { ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI } = process.env;

export function getAuthUrl() {
  return `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${ML_CLIENT_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`;
}

export async function trocarCodigo(code) {
  const res = await axios.post(`${ML_BASE}/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
    code,
    redirect_uri: ML_REDIRECT_URI
  });
  salvarToken('mercadolivre', res.data);
  return res.data;
}

export async function refreshToken() {
  const tok = queryOne('SELECT * FROM integracoes_tokens WHERE plataforma = ?', ['mercadolivre']);
  if (!tok) return null;
  const res = await axios.post(`${ML_BASE}/oauth/token`, {
    grant_type: 'refresh_token',
    client_id: ML_CLIENT_ID,
    client_secret: ML_CLIENT_SECRET,
    refresh_token: tok.refresh_token
  });
  salvarToken('mercadolivre', res.data);
  return res.data.access_token;
}

function salvarToken(plataforma, data) {
  const expires = new Date(Date.now() + data.expires_in * 1000).toISOString();
  run(`INSERT OR REPLACE INTO integracoes_tokens (plataforma, access_token, refresh_token, expires_at, atualizado_em)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [plataforma, data.access_token, data.refresh_token, expires]);
}

async function getToken() {
  const tok = queryOne('SELECT * FROM integracoes_tokens WHERE plataforma = ?', ['mercadolivre']);
  if (!tok) return null;
  if (new Date(tok.expires_at) < new Date(Date.now() + 60000)) {
    return await refreshToken();
  }
  return tok.access_token;
}

export async function sincronizarPedidos() {
  const token = await getToken();
  if (!token) return { ok: false, msg: 'Mercado Livre não conectado' };

  try {
    // Pega usuário
    const me = await axios.get(`${ML_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    const userId = me.data.id;

    // Pega pedidos recentes (últimas 24h)
    const ontem = new Date(Date.now() - 86400000).toISOString();
    const res = await axios.get(`${ML_BASE}/orders/search/recent`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { seller: userId, sort: 'date_desc', limit: 50, 'order.date_created.from': ontem }
    });

    const pedidos = res.data.results || [];
    let novos = 0;

    for (const p of pedidos) {
      const existe = queryOne('SELECT id FROM pedidos WHERE id_externo = ?', [`ML-${p.id}`]);
      if (existe) continue;

      const item = p.order_items?.[0];
      if (!item) continue;

      const valorCliente = p.total_amount || 0;
      const taxaML = p.marketplace_fee || (valorCliente * 0.12);

      run(`INSERT INTO pedidos (id_externo, plataforma, produto_nome, valor_cliente, taxa_plataforma, status)
           VALUES (?, 'Mercado Livre', ?, ?, ?, 'Novo')`,
        [`ML-${p.id}`, item.item?.title || 'Produto ML', valorCliente, taxaML]);
      novos++;
    }

    return { ok: true, novos, total: pedidos.length };
  } catch (err) {
    console.error('[ML] Erro na sincronização:', err.message);
    return { ok: false, msg: err.message };
  }
}
