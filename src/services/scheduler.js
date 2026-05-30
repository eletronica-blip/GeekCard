import cron from 'node-cron';
import { sincronizarPedidos as syncML } from './mercadolivre.js';
import { sincronizarPedidos as syncShopee } from './shopee.js';
import { enviarWhatsApp, gerarResumoTexto } from './whatsapp.js';
import { getDb, queryOne } from './db.js';
import { run } from './db.js';

export function iniciarAgendamentos() {
  // Sincroniza pedidos a cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Sincronizando pedidos das plataformas...');
    const mlRes = await syncML().catch(e => ({ ok: false, msg: e.message }));
    const spRes = await syncShopee().catch(e => ({ ok: false, msg: e.message }));

    if (mlRes.novos > 0) {
      run(`INSERT INTO alertas (tipo, mensagem) VALUES ('info', ?)`,
        [`${mlRes.novos} novo(s) pedido(s) do Mercado Livre sincronizado(s)`]);
    }
    if (spRes.novos > 0) {
      run(`INSERT INTO alertas (tipo, mensagem) VALUES ('info', ?)`,
        [`${spRes.novos} novo(s) pedido(s) da Shopee sincronizado(s)`]);
    }
    console.log('[Cron] ML:', mlRes, '| Shopee:', spRes);
  });

  // Resumo diário via WhatsApp (horário configurável, padrão 17h30)
  const horario = process.env.RESUMO_HORARIO || '30 17 * * *';
  cron.schedule(horario, async () => {
    console.log('[Cron] Enviando resumo diário WhatsApp...');
    const dados = calcularResumoDia();
    const msg = gerarResumoTexto(dados);
    await enviarWhatsApp(msg);

    run(`INSERT INTO alertas (tipo, mensagem) VALUES ('info', ?)`,
      ['Resumo diário enviado via WhatsApp']);
  });

  // Alerta de pedidos parados há mais de 24h
  cron.schedule('0 8 * * *', () => {
    const db = getDb();
    const parados = db.prepare(`
      SELECT COUNT(*) as total FROM pedidos
      WHERE status = 'Novo'
      AND datetime(criado_em) < datetime('now', '-24 hours')
    `).get();

    if (parados.total > 0) {
      run(`INSERT INTO alertas (tipo, mensagem) VALUES ('warning', ?)`,
        [`${parados.total} pedido(s) sem ação há mais de 24 horas`]);
    }
  });

  console.log('[Agendamentos] Ativos: sync 30min | resumo diário | alerta 8h');
}

export function calcularResumoDia() {
  const db = getDb();
  const hoje = db.prepare(`
    SELECT
      COUNT(*) as totalPedidos,
      COALESCE(SUM(valor_cliente), 0) as totalVendas,
      COALESCE(SUM(valor_fornecedor), 0) as totalRepasse,
      COALESCE(SUM(taxa_plataforma + taxa_frete + outras_taxas), 0) as totalTaxas,
      COALESCE(SUM(lucro), 0) as lucro
    FROM pedidos
    WHERE date(criado_em) = date('now', 'localtime')
  `).get();

  const pedidosPendentes = db.prepare(`
    SELECT COUNT(*) as total FROM pedidos WHERE status = 'Novo'
  `).get().total;

  const repassesPendentes = db.prepare(`
    SELECT COUNT(*) as total FROM repasses WHERE status = 'pendente'
  `).get().total;

  return { hoje, pedidosPendentes, repassesPendentes };
}
