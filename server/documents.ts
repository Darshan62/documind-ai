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

export function retrieve(documents: StoredDocument[], question: string): Citation[] {
  const terms = [...new Set(tokenize(question).filter(term => !stopwords.has(term)))];
  if (!terms.length) return [];
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
  return passages.filter(passage => passage.score > 0).sort((a, b) => b.score - a.score).slice(0, 4)
    .map(({ score: _, ...citation }, index) => ({ ...citation, index: index + 1 }));
}
