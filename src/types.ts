export interface DocumentInfo {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  words: number;
}
export interface Citation { documentId: string; name: string; passage: string; index: number }
export interface Answer { answer: string; citations: Citation[]; mode: 'local' | 'ai' }
