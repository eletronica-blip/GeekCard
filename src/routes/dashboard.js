import { Router } from 'express';
import { getDb, run } from '../services/db.js';
import { calcularResumoDia } from '../services/scheduler.js';
import { sincronizarPedidos as syncML } from '../services/mercadolivre.js';
import { sincronizarPedidos as syncShopee } from '../services/shopee.js';
import { autenticar } from '../middleware/auth.js';

const r = Router();

r.get('/resumo', autenticar, (req, res) => {
  const db = getDb();
  const periodo = req.query.periodo || 'mes';

  let filtro = "date(criado_em) = date('now', 'localtime')";
  if (periodo === 'semana') filtro = "criado_em >= datetime('now', '-7 days')";
  if (periodo === 'mes') filtro = "strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now')";

  const resumo = db.prepare(`
    SELECT
      COUNT(*) as totalPedidos,
      COALESCE(SUM(valor_cliente), 0) as totalVendas,
      COALESCE(SUM(valor_fornecedor), 0) as totalRepasse,
      COALESCE(SUM(taxa_plataforma + taxa_frete + outras_taxas), 0) as totalTaxas,
      COALESCE(SUM(lucro), 0) as lucro
    FROM pedidos WHERE ${filtro}
  `).get();

  const porPlataforma = db.prepare(`
    SELECT plataforma, COUNT(*) as pedidos, SUM(valor_cliente) as total, SUM(lucro) as lucro
    FROM pedidos WHERE ${filtro}
    GROUP BY plataforma ORDER BY total DESC
  `).all();

  const pendentesEnvio = db.prepare(`SELECT COUNT(*) as t FROM pedidos WHERE status = 'Novo'`).get().t;
  const pendentesRepasse = db.prepare(`SELECT COUNT(*) as t FROM repasses WHERE status = 'pendente'`).get().t;

  res.json({ resumo, porPlataforma, pendentesEnvio, pendentesRepasse });
});

r.get('/alertas', autenticar, (req, res) => {
  const db = getDb();
  const alertas = db.prepare(`SELECT * FROM alertas WHERE lido = 0 ORDER BY criado_em DESC LIMIT 20`).all();
  res.json(alertas);
});

r.post('/alertas/:id/ler', autenticar, (req, res) => {
  run('UPDATE alertas SET lido = 1 WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

r.post('/alertas/ler-todos', autenticar, (req, res) => {
  run('UPDATE alertas SET lido = 1');
  res.json({ ok: true });
});

r.post('/sincronizar', autenticar, async (req, res) => {
  const [ml, sp] = await Promise.allSettled([syncML(), syncShopee()]);
  res.json({
    mercadolivre: ml.status === 'fulfilled' ? ml.value : { ok: false, msg: ml.reason?.message },
    shopee: sp.status === 'fulfilled' ? sp.value : { ok: false, msg: sp.reason?.message }
  });
});

r.get('/boas-vindas', autenticar, (req, res) => {
  const dados = calcularResumoDia();
  const hora = new Date().getHours();
  let saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Bem-vindo de volta';
  res.json({ saudacao, ...dados });
});

export default r;
