import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Citation, DocumentInfo } from '../src/types.js';

export interface StoredDocument extends DocumentInfo { text: string }
export class DocumentStore {
  private documents: StoredDocument[];
  private file: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.file = path.join(directory, 'documents.json');
    this.documents = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : [];
  }
  list(): DocumentInfo[] { return this.documents.map(({ text: _, ...info }) => info); }
  all(): StoredDocument[] { return this.documents; }
  add(name: string, size: number, text: string): DocumentInfo {
    const document = { id: randomUUID(), name, size, text, createdAt: new Date().toISOString(), words: text.split(/\s+/).filter(Boolean).length };
    this.persist([document, ...this.documents]);
    const { text: _, ...info } = document;
    return info;
  }
  delete(id: string): boolean {
    if (!this.documents.some(document => document.id === id)) return false;
    this.persist(this.documents.filter(document => document.id !== id));
    return true;
  }
  private persist(documents: StoredDocument[]) {
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(documents), { mode: 0o600 });
    renameSync(temporary, this.file);
    this.documents = documents;
  }
}

const stopwords = new Set('a an the is are was were what which who how why when where does do did can could would should of to in on for and or with about this that it me my please tell document documents say says'.split(' '));
const tokenize = (text: string): string[] => text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

// Give broad questions coverage across a document instead of requiring literal
// matches for words such as "summarize". Keep provider context bounded.
function overview(documents: StoredDocument[]): Citation[] {
  const selected = documents.slice(0, 12);
  return selected.flatMap((document, documentIndex) => {
    const words = document.text.split(/\s+/).filter(Boolean);
    const count = Math.ceil(words.length / 170);
    const budget = Math.floor(12 / selected.length) + (documentIndex < 12 % selected.length ? 1 : 0);
    const take = Math.min(count, budget);
    return Array.from({ length: take }, (_, index) => {
      const chunk = take === count ? index : take === 1 ? 0 : Math.round(index * (count - 1) / (take - 1));
      return { documentId: document.id, name: document.name, passage: words.slice(chunk * 170, (chunk + 1) * 170).join(' ').slice(0, 2000) };
    });
  }).map((citation, index) => ({ ...citation, index: index + 1 }));
}

export function retrieve(documents: StoredDocument[], question: string, allowContextFallback = false): Citation[] {
  const broadQuestion = /\b(summar\w*|overview|key findings|main points)\b|\b(what|whats|what's).{0,35}\b(in|about|contain\w*|say\w*)\b.{0,25}\b(document|resume|résumé|file|cv)\b|\b(document|resume|résumé|file|cv)\b.{0,25}\b(contain\w*|say\w*|about)\b/i.test(question);
  if (broadQuestion) return overview(documents);
  const terms = [...new Set(tokenize(question).filter(term => !stopwords.has(term)))];
  if (!terms.length) return allowContextFallback ? overview(documents) : [];
  const passages = documents.flatMap(document => {
    const words = document.text.split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += 130) {
      const passage = words.slice(i, i + 170).join(' ');
      const tokens = tokenize(passage);
      const score = terms.reduce((sum, term) => sum + (tokens.includes(term) ? 1 + Math.log(1 + tokens.filter(token => token === term).length) : 0), 0);
      chunks.push({ documentId: document.id, name: document.name, passage, score });
    }
    return chunks;
  });
  const matches = passages.filter(passage => passage.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
    .map(({ score: _, ...citation }, index) => ({ ...citation, index: index + 1 }));
  return matches.length || !allowContextFallback ? matches : overview(documents);
}
