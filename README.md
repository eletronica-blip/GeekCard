# 🃏 GeekCard - Sistema de Gestão Dropshipping

Sistema completo para controle de vendas, fornecedores, repasses e lucro.

---

## 🚀 Como instalar no Replit (passo a passo)

### 1. Criar projeto no Replit
1. Acesse https://replit.com e crie uma conta gratuita
2. Clique em **"+ Create Repl"**
3. Escolha **"Import from GitHub"** ou **"Node.js"**
4. Faça upload de todos os arquivos deste projeto

### 2. Instalar dependências
No terminal do Replit, rode:
```bash
npm install
```

### 3. Configurar variáveis de ambiente
1. No Replit, clique em **"Secrets"** (cadeado no menu lateral)
2. Adicione cada variável do arquivo `.env.example`:

| Variável | Valor | Onde pegar |
|---|---|---|
| `JWT_SECRET` | qualquer texto longo aleatório | invente um |
| `ADMIN_PASSWORD` | sua senha de acesso | você define |
| `ZAPI_INSTANCE_ID` | ID da instância | z-api.io |
| `ZAPI_TOKEN` | token da instância | z-api.io |
| `ZAPI_CLIENT_TOKEN` | client token | z-api.io |
| `WHATSAPP_NUMBER` | 5511999990000 | seu número |
| `ML_CLIENT_ID` | ID do app | developers.mercadolivre.com.br |
| `ML_CLIENT_SECRET` | secret do app | developers.mercadolivre.com.br |
| `SHOPEE_PARTNER_ID` | ID do parceiro | open.shopee.com |
| `SHOPEE_PARTNER_KEY` | chave do parceiro | open.shopee.com |

### 4. Iniciar o servidor
```bash
npm start
```

O app abre no navegador automaticamente. Use a senha que você configurou em `ADMIN_PASSWORD`.

---

## 🔗 Configurar integrações

### WhatsApp (Z-API) - GRATUITO
1. Acesse https://z-api.io e crie conta gratuita
2. Crie uma instância, escaneie o QR Code com seu WhatsApp
3. Copie o Instance ID, Token e Client-Token para os Secrets do Replit
4. Configure `WHATSAPP_NUMBER` com seu número: `55` + DDD + número (ex: `5511999990000`)
5. O resumo diário é enviado automaticamente às **17h30** todo dia

### Mercado Livre
1. Acesse https://developers.mercadolivre.com.br
2. Crie um aplicativo
3. Em "URL de redirect", coloque: `https://SEU-REPLIT.repl.co/api/auth/mercadolivre/callback`
4. Copie Client ID e Client Secret para os Secrets
5. No app GeekCard, vá em **Integrações** e clique em **Conectar**

### Shopee
1. Acesse https://open.shopee.com
2. Crie um aplicativo de parceiro
3. Copie Partner ID e Partner Key para os Secrets
4. No app GeekCard, vá em **Integrações** e clique em **Conectar**

---

## 📱 Como usar no dia a dia

### Durante o dia (automático)
- A cada 30 minutos, o sistema sincroniza pedidos do Mercado Livre e Shopee
- Às 17h30, você recebe um resumo no WhatsApp com tudo que aconteceu no dia

### À noite (quando abrir o PC)
- O dashboard mostra automaticamente o banner **"Bem-vindo de volta"** com resumo do dia
- Alertas na barra superior indicam pedidos pendentes e repasses a fazer
- Clique em **🔄 Sincronizar** para puxar os pedidos mais recentes

### Fluxo de trabalho sugerido
1. Abrir GeekCard → ver alertas do dia
2. Ir em **Pedidos → Novos** → registrar custo do fornecedor se necessário
3. Clicar **▶** para avançar status de cada pedido
4. Ir em **Financeiro** → verificar repasses pendentes → registrar pagamentos

---

## 🏗️ Estrutura do projeto

```
geekcard/
├── src/
│   ├── server.js          # Servidor principal
│   ├── routes/
│   │   ├── api.js         # Todas as rotas REST
│   │   └── dashboard.js   # Rotas do dashboard/alertas
│   ├── services/
│   │   ├── db.js          # Banco de dados SQLite
│   │   ├── scheduler.js   # Agendamentos (cron jobs)
│   │   ├── whatsapp.js    # Envio de mensagens Z-API
│   │   ├── mercadolivre.js # Integração ML
│   │   └── shopee.js      # Integração Shopee
│   └── middleware/
│       └── auth.js        # Autenticação JWT
├── public/
│   └── index.html         # Frontend completo (SPA)
├── schema/
│   └── schema.sql         # Estrutura do banco de dados
├── package.json
└── .env.example           # Modelo de configuração
```

---

## 💾 Banco de dados

O sistema usa **SQLite** (arquivo local `geekcard.db`), que:
- É criado automaticamente na primeira execução
- Não precisa de configuração
- No Replit, fica salvo permanentemente no projeto
- Pode ser exportado/copiado facilmente como backup

---

## ⏰ Agendamentos automáticos

| Horário | O que faz |
|---|---|
| A cada 30 min | Sincroniza pedidos ML e Shopee |
| 17h30 todo dia | Envia resumo do dia via WhatsApp |
| 8h todo dia | Verifica pedidos parados há mais de 24h |

---

## 🔒 Segurança

- Login com senha (configurada em `ADMIN_PASSWORD`)
- Sessão válida por 30 dias (JWT)
- Todas as rotas da API requerem autenticação
- Dados nunca saem do seu Replit
