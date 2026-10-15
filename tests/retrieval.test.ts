import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieve, type StoredDocument } from '../server/documents.js';

function document(id: string, text: string): StoredDocument {
  return { id, name: `${id}.txt`, text, words: text.split(/\s+/).length, size: text.length, createdAt: '2026-01-01' };
}
const resume = document('resume', 'Darshan Software engineer. Skills Java Python React. Education Computer Science. Projects Document assistant.');

test('generic document questions and resume summaries return actual source content', () => {
  for (const question of ['tell me whats is in the document', 'Summarize my resume', 'What is this document about?', 'What are the key findings?']) {
    const citations = retrieve([resume], question);
    assert.equal(citations[0].documentId, 'resume');
    assert.match(citations[0].passage, /Python React/);
  }
});
test('AI questions with no literal matches receive context while local factual search stays honest', () => {
  assert.deepEqual(retrieve([resume], 'What are the next steps?'), []);
  assert.equal(retrieve([resume], 'What are the next steps?', true)[0].documentId, 'resume');
  assert.deepEqual(retrieve([], 'Summarize this'), []);
});
test('a 689-word resume summary includes its ending as well as its opening', () => {
  const text = ['Opening', ...Array.from({ length: 687 }, (_, i) => `word${i}`), 'FinalQualification'].join(' ');
  const citations = retrieve([document('long-resume', text)], 'Summarize my resume');
  assert.equal(citations.map(citation => citation.passage).join(' '), text);
  assert.deepEqual(citations.map(citation => citation.index), [1, 2, 3, 4, 5]);
});
test('overview samples across long documents and bounds context size', () => {
  const docs = Array.from({ length: 3 }, (_, i) => document(`doc${i}`, `Start${i} ${'content '.repeat(10000)}End${i}`));
  const citations = retrieve(docs, 'Give me a summary');
  assert.equal(citations.length, 12);
  for (let i = 0; i < 3; i++) {
    const text = citations.filter(citation => citation.documentId === `doc${i}`).map(citation => citation.passage).join(' ');
    assert.ok(text.includes(`Start${i}`));
    assert.ok(text.includes(`End${i}`));
  }
  assert.ok(citations.every(citation => citation.passage.length <= 2000));
});
