import { criarToken, autenticar, jsonResp, erroResp } from '../auth.js';

export async function handleAuth(request, env, cors) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Login
  if (path === '/api/auth/login' && request.method === 'POST') {
    const { senha } = await request.json();
    if (senha !== env.ADMIN_PASSWORD) return erroResp('Senha incorreta', 401);
    const token = await criarToken({ user: 'admin' }, env.JWT_SECRET);
    return new Response(JSON.stringify({ ok: true, token }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`,
        ...cors,
      },
    });
  }

  // Logout
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': 'token=; Path=/; Max-Age=0',
        ...cors,
      },
    });
  }

  // Callbacks OAuth
  if (path === '/api/auth/mercadolivre/callback') {
    const code = url.searchParams.get('code');
    if (!code) return Response.redirect(new URL('/?erro=ml_sem_codigo', url.origin));
    try {
      const res = await fetch('https://api.mercadolibre.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: env.ML_CLIENT_ID,
          client_secret: env.ML_CLIENT_SECRET,
          code,
          redirect_uri: `${url.origin}/api/auth/mercadolivre/callback`,
        }),
      });
      const data = await res.json();
      if (data.access_token) {
        const expires = new Date(Date.now() + data.expires_in * 1000).toISOString();
        await env.DB.prepare(
          `INSERT OR REPLACE INTO integracoes_tokens (plataforma, access_token, refresh_token, expires_at, atualizado_em)
           VALUES ('mercadolivre', ?, ?, ?, datetime('now'))`
        ).bind(data.access_token, data.refresh_token, expires).run();
      }
      return Response.redirect(new URL('/?sucesso=ml_conectado', url.origin));
    } catch {
      return Response.redirect(new URL('/?erro=ml_falha', url.origin));
    }
  }

  return erroResp('Rota não encontrada', 404);
}
