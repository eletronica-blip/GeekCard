-- GeekCard D1 Schema
-- Execute no painel D1 da Cloudflare

CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  contato TEXT,
  prazo_dias INTEGER DEFAULT 3,
  forma_pagamento TEXT DEFAULT 'Pix',
  chave_pagamento TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  sku TEXT,
  fornecedor_id INTEGER,
  preco_custo REAL DEFAULT 0,
  preco_venda REAL DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  criado_em TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  id_externo TEXT,
  plataforma TEXT NOT NULL,
  produto_id INTEGER,
  produto_nome TEXT NOT NULL,
  fornecedor_id INTEGER,
  valor_cliente REAL DEFAULT 0,
  valor_fornecedor REAL DEFAULT 0,
  taxa_plataforma REAL DEFAULT 0,
  taxa_frete REAL DEFAULT 0,
  outras_taxas REAL DEFAULT 0,
  lucro REAL DEFAULT 0,
  status TEXT DEFAULT 'Novo',
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now')),
  atualizado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repasses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id INTEGER NOT NULL,
  valor REAL NOT NULL,
  forma_pagamento TEXT DEFAULT 'Pix',
  status TEXT DEFAULT 'pago',
  observacao TEXT,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS integracoes_tokens (
  plataforma TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  shop_id TEXT,
  atualizado_em TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lido INTEGER DEFAULT 0,
  criado_em TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_plataforma ON pedidos(plataforma);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado ON pedidos(criado_em);
