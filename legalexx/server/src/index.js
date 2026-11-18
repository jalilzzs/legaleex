import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import api from './routes/api.js';
import { closeBrowser } from './lib/pdf.js';
import { logSystemInfo } from './lib/system.js';

const app = express();
const PORT = process.env.PORT || 4000;

// CLIENT_ORIGIN (optional, comma-separated) restricts CORS when the frontend is hosted separately.
const origins = process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',').map((s) => s.trim()) : true;

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false }));
app.use('/api', api);

// If the client was built (npm run build), Express serves it too.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// A stray rejected promise must not take the whole server down.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

const server = app.listen(PORT, () => {
  console.log(`LegalExx API listening on port ${PORT}`);
  logSystemInfo('startup'); // prints the active AI model and search engine
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await closeBrowser().catch(() => {});
    server.close(() => process.exit(0));
  });
}
