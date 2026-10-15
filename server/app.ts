import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { DocumentStore, retrieve } from './documents.js';
import { AIError, generateAnswer, getAIConfig } from './ai.js';

export function createApp(store: DocumentStore) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
        res.status(403).json({ error: 'Requests must come from this application.' });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
  app.get('/api/health', (_req, res) => {
    const config = getAIConfig();
    res.json({ status: 'ok', mode: config ? 'ai' : 'local', ...(config ? { provider: config.provider } : {}) });
  });
  app.get('/api/documents', (_req, res) => res.json(store.list()));
  app.post('/api/documents', upload.single('file'), async (req, res) => {
    if (!req.file) { res.status(400).json({ error: 'Choose a PDF, TXT, or Markdown file.' }); return; }
    const extension = path.extname(req.file.originalname).toLowerCase();
    if (!['.pdf', '.txt', '.md'].includes(extension)) { res.status(400).json({ error: 'Supported formats are PDF, TXT, and Markdown.' }); return; }
    if (store.list().length >= 100) { res.status(400).json({ error: 'Your workspace holds up to 100 documents. Remove a document before adding another.' }); return; }
    let text: string;
    if (extension === '.pdf') {
      let parser: PDFParse | undefined;
      try {
        parser = new PDFParse({ data: req.file.buffer });
        text = (await parser.getText()).text;
      } catch {
        res.status(422).json({ error: 'This PDF could not be read. Try an unlocked PDF with selectable text.' }); return;
      } finally { await parser?.destroy(); }
    } else {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(req.file.buffer); }
      catch { res.status(422).json({ error: 'Save your text document with UTF-8 encoding and try again.' }); return; }
    }
    text = text.replace(/\u0000/g, '').trim();
    if (text.length < 20) { res.status(422).json({ error: 'There is not enough readable text. Scanned PDFs need OCR before upload.' }); return; }
    if (text.length > 2_000_000) { res.status(413).json({ error: 'This document contains too much text. Split it into smaller files.' }); return; }
    const name = req.file.originalname.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'Untitled document';
    res.status(201).json(store.add(name, req.file.size, text));
  });
  app.delete('/api/documents/:id', (req, res) => {
    if (!store.delete(req.params.id)) { res.status(404).json({ error: 'Document not found.' }); return; }
    res.status(204).end();
  });
  app.post('/api/ask', async (req, res) => {
    const { question, documentIds } = req.body ?? {};
    if (typeof question !== 'string' || !question.trim() || question.length > 2000) { res.status(400).json({ error: 'Enter a question between 1 and 2,000 characters.' }); return; }
    if (documentIds !== undefined && (!Array.isArray(documentIds) || !documentIds.every(id => typeof id === 'string'))) { res.status(400).json({ error: 'Invalid document selection.' }); return; }
    const documents = store.all().filter(document => !documentIds?.length || documentIds.includes(document.id));
    if (!documents.length) { res.status(400).json({ error: 'Upload a document before asking a question.' }); return; }
    const citations = retrieve(documents, question);
    if (!citations.length) {
      res.json({ answer: 'I couldn’t find a matching passage in the selected documents. Try using a specific name, topic, or phrase from your document.', citations: [], mode: 'local' }); return;
    }
    const config = getAIConfig();
    if (!config) {
      res.json({ answer: 'Here are the passages that match your question. These are direct excerpts from your documents, not an AI-generated answer.', citations, mode: 'local' }); return;
    }
    try {
      const answer = await generateAnswer(config, question, citations);
      res.json({ answer, citations, mode: 'ai' });
    } catch (error) {
      res.status(error instanceof AIError ? error.status : 502).json({ error: error instanceof AIError ? error.message : 'The AI provider could not answer. Please try again.' });
    }
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found.' }); });
  app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof multer.MulterError) { res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Files must be 10 MB or smaller.' : 'Upload one file at a time.' }); return; }
    if (error instanceof SyntaxError || error.status === 413) { res.status(error.status === 413 ? 413 : 400).json({ error: 'Invalid or oversized request.' }); return; }
    console.error('Request failed:', error.name);
    res.status(500).json({ error: 'The request could not be completed. Please try again.' });
  });
  return app;
}
