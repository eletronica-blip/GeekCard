import axios from 'axios';

const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, WHATSAPP_NUMBER } = process.env;

export async function enviarWhatsApp(mensagem) {
  if (!ZAPI_INSTANCE_ID || !ZAPI_TOKEN || !WHATSAPP_NUMBER) {
    console.log('[WhatsApp] Não configurado. Mensagem:', mensagem);
    return false;
  }
  try {
    await axios.post(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
      { phone: WHATSAPP_NUMBER, message: mensagem },
      { headers: { 'Client-Token': ZAPI_CLIENT_TOKEN } }
    );
    console.log('[WhatsApp] Mensagem enviada com sucesso');
    return true;
  } catch (err) {
    console.error('[WhatsApp] Erro ao enviar:', err.message);
    return false;
  }
}

export function gerarResumoTexto(dados) {
  const { hoje, pedidosPendentes, repassesPendentes, fornecedores } = dados;
  const emoji = hoje.lucro >= 0 ? '✅' : '⚠️';

  let msg = `🃏 *GeekCard - Resumo do dia ${new Date().toLocaleDateString('pt-BR')}*\n\n`;
  msg += `📦 *Pedidos hoje:* ${hoje.totalPedidos}\n`;
  msg += `💰 *Recebido:* R$ ${hoje.totalVendas.toFixed(2)}\n`;
  msg += `🏭 *Repassado fornec.:* R$ ${hoje.totalRepasse.toFixed(2)}\n`;
  msg += `📊 *Taxas:* R$ ${hoje.totalTaxas.toFixed(2)}\n`;
  msg += `${emoji} *Lucro líquido:* R$ ${hoje.lucro.toFixed(2)}\n\n`;

  if (pedidosPendentes > 0) {
    msg += `🔴 *${pedidosPendentes} pedido(s) aguardando envio ao fornecedor*\n`;
  }
  if (repassesPendentes > 0) {
    msg += `💸 *${repassesPendentes} repasse(s) pendente(s) para fornecedores*\n`;
  }

  msg += `\n_Abra o GeekCard para ver detalhes completos._`;
  return msg;
}
