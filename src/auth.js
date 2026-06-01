// JWT simples para Cloudflare Workers (sem bibliotecas externas)

export async function criarToken(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ ...payload, exp: Date.now() + 30 * 24 * 3600 * 1000 }));
  const signature = await assinar(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export async function verificarToken(token, secret) {
  try {
    const [header, body, signature] = token.split('.');
    const esperado = await assinar(`${header}.${body}`, secret);
    if (signature !== esperado) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function assinar(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function autenticar(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const cookie = request.headers.get('Cookie') || '';
  const tokenHeader = auth.replace('Bearer ', '');
  const tokenCookie = cookie.match(/token=([^;]+)/)?.[1] || '';
  const token = tokenHeader || tokenCookie;
  if (!token) return null;
  return verificarToken(token, env.JWT_SECRET);
}

export function jsonResp(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}

export function erroResp(msg, status = 400) {
  return jsonResp({ erro: msg }, status);
}
