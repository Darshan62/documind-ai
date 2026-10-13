import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { createServer } from 'vite';
import { createApp } from './app.js';
import { DocumentStore } from './documents.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const app = createApp(new DocumentStore(process.env.DOCUMIND_DATA_DIR || path.resolve('.data')));
if (process.argv.includes('--production')) {
  if (!existsSync('dist/index.html')) throw new Error('Run npm run build before npm start.');
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
const server = app.listen(port, '127.0.0.1', () => console.log(`DocuMind listening on port ${port}`));
server.on('error', error => { console.error(error.message); process.exit(1); });
