import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createApp } from '../server/app.js';
import { DocumentStore } from '../server/documents.js';
import type { Answer, DocumentInfo } from '../src/types.js';

const directory = mkdtempSync(path.join(tmpdir(), 'documind-test-'));
const store = new DocumentStore(directory);
let server: Server;
let base: string;
let document: DocumentInfo;
const originalKey = process.env.DOCUMIND_API_KEY;

before(async () => {
  delete process.env.DOCUMIND_API_KEY;
  server = createApp(store).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test server');
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  rmSync(directory, { recursive: true, force: true });
  if (originalKey !== undefined) process.env.DOCUMIND_API_KEY = originalKey;
});
async function upload(name: string, text: string, type = 'text/plain') {
  const form = new FormData(); form.append('file', new Blob([text], { type }), name);
  return fetch(`${base}/api/documents`, { method: 'POST', body: form });
}
async function ask(question: string, documentIds?: string[]) {
  return fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, documentIds }) });
}

test('health reports local mode and empty questions require a document', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'local' });
  assert.equal((await ask('What is the budget?')).status, 400);
});
test('uploads a document and persists it without exposing its full text', async () => {
  const response = await upload('project-notes.md', '# Project notes\nThe launch budget is 42000 dollars. The deadline is November 12. Maya owns the launch plan.');
  assert.equal(response.status, 201);
  document = await response.json() as DocumentInfo;
  assert.equal(document.name, 'project-notes.md');
  assert.ok(document.words > 10);
  assert.equal('text' in document, false);
  assert.equal(new DocumentStore(directory).all()[0].text.includes('42000'), true);
  assert.equal((await (await fetch(`${base}/api/documents`)).json()).length, 1);
});
test('retrieves actual source evidence with stable citations', async () => {
  const response = await ask('What is the launch budget?');
  assert.equal(response.status, 200);
  const result = await response.json() as Answer;
  assert.equal(result.mode, 'local');
  assert.equal(result.citations[0].documentId, document.id);
  assert.match(result.citations[0].passage, /42000/);
  assert.match(result.answer, /not an AI-generated answer/);
});
test('does not invent answers to unmatched questions', async () => {
  const result = await (await ask('quasars astrophysics')).json() as Answer;
  assert.equal(result.citations.length, 0);
  assert.match(result.answer, /couldn’t find/);
});
test('respects document selection', async () => {
  const second = await (await upload('other.txt', 'This separate document describes the benefits of planting apple trees.')).json() as DocumentInfo;
  const result = await (await ask('launch budget', [second.id])).json() as Answer;
  assert.equal(result.citations.length, 0);
});
test('rejects unsupported, empty, invalid PDF, and oversized uploads', async () => {
  assert.equal((await upload('script.html', '<html>This is not a supported document.</html>')).status, 400);
  assert.equal((await upload('empty.txt', '')).status, 422);
  assert.equal((await upload('broken.pdf', 'Not a real PDF', 'application/pdf')).status, 422);
  assert.equal((await upload('huge.txt', 'x'.repeat(10 * 1024 * 1024 + 1))).status, 400);
});
test('extracts a real text PDF', async () => {
  const stream = 'BT /F1 12 Tf 50 750 Td (The research budget is 88000 dollars for the lunar mission.) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const response = await upload('research.pdf', pdf, 'application/pdf');
  assert.equal(response.status, 201);
  const info = await response.json() as DocumentInfo;
  const result = await (await ask('lunar mission budget', [info.id])).json() as Answer;
  assert.match(result.citations[0].passage, /88000/);
});
test('validates question payloads and rejects cross-origin writes', async () => {
  assert.equal((await ask('')).status, 400);
  assert.equal((await ask('a'.repeat(2001))).status, 400);
  const invalid = await fetch(`${base}/api/ask`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'budget', documentIds: 'invalid' }) });
  assert.equal(invalid.status, 400);
  const response = await fetch(`${base}/api/documents/${document.id}`, { method: 'DELETE', headers: { Origin: 'https://unrelated.example' } });
  assert.equal(response.status, 403);
});
test('deletes documents from persistent storage', async () => {
  assert.equal((await fetch(`${base}/api/documents/${document.id}`, { method: 'DELETE' })).status, 204);
  assert.equal(new DocumentStore(directory).list().some(item => item.id === document.id), false);
  assert.equal((await fetch(`${base}/api/documents/${document.id}`, { method: 'DELETE' })).status, 404);
});
