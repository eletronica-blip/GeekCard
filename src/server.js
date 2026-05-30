import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getDb } from './services/db.js';
import { iniciarAgendamentos } from './services/scheduler.js';
import apiRoutes from './routes/api.js';
import dashboardRoutes from './routes/dashboard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(join(__dirname, '../public')));

app.use('/api', apiRoutes);
app.use('/api/dash', dashboardRoutes);

// Todas as rotas retornam o app (SPA)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../public/index.html'));
});

// Inicializa banco e agendamentos
getDb();
iniciarAgendamentos();

app.listen(PORT, () => {
  console.log(`\n🃏 GeekCard rodando em http://localhost:${PORT}`);
  console.log('📦 Banco de dados inicializado');
  console.log('⏰ Agendamentos ativos\n');
});
