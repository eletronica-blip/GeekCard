-- GeekCard - Schema do banco de dados SQLite
-- Executado automaticamente na primeira inicialização

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  contato TEXT,
  prazo_dias INTEGER DEFAULT 3,
  forma_pagamento TEXT DEFAULT 'Pix',
  chave_pagamento TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  sku TEXT,
  fornecedor_id INTEGER,
  preco_custo REAL DEFAULT 0,
  preco_venda REAL DEFAULT 0,
  ativo INTEGER DEFAULT 1,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
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
  lucro REAL GENERATED ALWAYS AS (valor_cliente - valor_fornecedor - taxa_plataforma - taxa_frete - outras_taxas) STORED,
  status TEXT DEFAULT 'Novo',
  observacao TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (produto_id) REFERENCES produtos(id),
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
);

CREATE TABLE IF NOT EXISTS repasses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id INTEGER NOT NULL,
  valor REAL NOT NULL,
  forma_pagamento TEXT DEFAULT 'Pix',
  status TEXT DEFAULT 'pendente',
  observacao TEXT,
  pago_em DATETIME,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
);

CREATE TABLE IF NOT EXISTS integracoes_tokens (
  plataforma TEXT PRIMARY KEY,
  access_token TEXT,
  refresh_token TEXT,
  expires_at DATETIME,
  shop_id TEXT,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alertas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  lido INTEGER DEFAULT 0,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_plataforma ON pedidos(plataforma);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado ON pedidos(criado_em);
CREATE INDEX IF NOT EXISTS idx_repasses_fornecedor ON repasses(fornecedor_id);
