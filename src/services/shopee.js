import axios from 'axios';
import crypto from 'crypto';
import { run, queryOne } from './db.js';

const SHOPEE_BASE = 'https://partner.shopeemobile.com';
const { SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_SHOP_ID } = process.env;

function gerarAssinatura(path, timestamp, accessToken = '') {
  const base = `${SHOPEE_PARTNER_ID}${path}${timestamp}${accessToken}${SHOPEE_SHOP_ID || ''}`;
  return crypto.createHmac('sha256', SHOPEE_PARTNER_KEY).update(base).digest('hex');
}

async function getToken() {
  const tok = queryOne('SELECT * FROM integracoes_tokens WHERE plataforma = ?', ['shopee']);
  return tok?.access_token || null;
}

export function getAuthUrl() {
  const ts = Math.floor(Date.now() / 1000);
  const path = '/api/v2/shop/auth_partner';
  const sign = gerarAssinatura(path, ts);
  const redirect = encodeURIComponent(process.env.SHOPEE_REDIRECT_URI || '');
  return `${SHOPEE_BASE}${path}?partner_id=${SHOPEE_PARTNER_ID}&timestamp=${ts}&sign=${sign}&redirect=${redirect}`;
}

export async function trocarCodigo(code, shopId) {
  const ts = Math.floor(Date.now() / 1000);
  const path = '/api/v2/auth/token/get';
  const sign = gerarAssinatura(path, ts);

  const res = await axios.post(`${SHOPEE_BASE}${path}`, {
    code, shop_id: parseInt(shopId), partner_id: parseInt(SHOPEE_PARTNER_ID)
  }, { params: { partner_id: SHOPEE_PARTNER_ID, timestamp: ts, sign } });

  if (res.data.access_token) {
    const expires = new Date(Date.now() + res.data.expire_in * 1000).toISOString();
    run(`INSERT OR REPLACE INTO integracoes_tokens (plataforma, access_token, refresh_token, expires_at, shop_id, atualizado_em)
         VALUES ('shopee', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [res.data.access_token, res.data.refresh_token, expires, shopId]);
  }
  return res.data;
}

export async function sincronizarPedidos() {
  const token = await getToken();
  if (!token) return { ok: false, msg: 'Shopee não conectada' };

  try {
    const ts = Math.floor(Date.now() / 1000);
    const path = '/api/v2/order/get_order_list';
    const sign = gerarAssinatura(path, ts, token);
    const ontem = Math.floor((Date.now() - 86400000) / 1000);

    const res = await axios.get(`${SHOPEE_BASE}${path}`, {
      params: {
        partner_id: SHOPEE_PARTNER_ID, timestamp: ts, sign,
        access_token: token, shop_id: SHOPEE_SHOP_ID,
        time_range_field: 'create_time', time_from: ontem, time_to: ts,
        page_size: 50, order_status: 'ALL'
      }
    });

    const lista = res.data.response?.order_list || [];
    let novos = 0;

    for (const p of lista) {
      const existe = queryOne('SELECT id FROM pedidos WHERE id_externo = ?', [`SP-${p.order_sn}`]);
      if (existe) continue;

      run(`INSERT INTO pedidos (id_externo, plataforma, produto_nome, valor_cliente, taxa_plataforma, status)
           VALUES (?, 'Shopee', ?, ?, ?, 'Novo')`,
        [`SP-${p.order_sn}`, `Pedido Shopee ${p.order_sn}`, p.total_amount || 0, 0]);
      novos++;
    }

    return { ok: true, novos, total: lista.length };
  } catch (err) {
    console.error('[Shopee] Erro:', err.message);
    return { ok: false, msg: err.message };
  }
}
