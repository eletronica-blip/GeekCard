// GeekCard - Cloudflare Worker
// Roda 100% na Cloudflare, sem servidor próprio

import { handleAuth } from './routes/auth.js';
import { handleApi } from './routes/api.js';
import { handleDash } from './routes/dashboard.js';
import { handleScheduled } from './scheduled.js';
import { getHTML } from './frontend.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API routes
      if (path.startsWith('/api/auth')) {
        return handleAuth(request, env, corsHeaders);
      }
      if (path.startsWith('/api/dash')) {
        return handleDash(request, env, corsHeaders);
      }
      if (path.startsWith('/api/')) {
        return handleApi(request, env, corsHeaders);
      }

      // Frontend - serve HTML para todas as outras rotas
      return new Response(getHTML(), {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ erro: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },

  async scheduled(event, env, ctx) {
    await handleScheduled(event, env);
  },
};
