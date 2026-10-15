import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ArrowUp, BookOpen, Check, ChevronDown, FileText, FolderOpen, LoaderCircle, MessageSquare, Plus, Search, Sparkles, Trash2, Upload, X } from 'lucide-react';
import type { Answer, DocumentInfo } from './types';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import './styles.css';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Something went wrong. Please try again.');
  }
  return response.status === 204 ? undefined as T : response.json();
}
const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
type Exchange = { question: string; result: Answer };

function Modal({ titleId, onClose, children }: { titleId: string; onClose: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}

function App() {
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'workspace' | 'library'>('workspace');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [provider, setProvider] = useState('AI');
  const [mode, setMode] = useState<'local' | 'ai'>('local');
  const [showInfo, setShowInfo] = useState(false);
  const [deleting, setDeleting] = useState<DocumentInfo | null>(null);
  const [removing, setRemoving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const responseEnd = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const [docs, health] = await Promise.all([api<DocumentInfo[]>('/api/documents'), api<{ mode: 'local' | 'ai'; provider?: string }>('/api/health')]);
      setDocuments(docs); setMode(health.mode); setProvider(health.provider || 'AI');
    } catch (error) { setError((error as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { if (exchanges.length) responseEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [exchanges]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setShowInfo(false); if (!removing) setDeleting(null); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [removing]);

  async function upload(files: FileList | File[]) {
    if (uploading) return;
    setError(''); setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} is larger than 10 MB.`);
        const body = new FormData(); body.append('file', file);
        const document = await api<DocumentInfo>('/api/documents', { method: 'POST', body });
        setDocuments(previous => [document, ...previous]);
      }
    } catch (error) { setError((error as Error).message); }
    finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    if (!question.trim() || asking || !documents.length) return;
    setError(''); setAsking(true);
    const current = question.trim();
    try {
      const result = await api<Answer>('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: current, documentIds: selected }) });
      setExchanges(previous => [...previous, { question: current, result }]); setQuestion('');
    } catch (error) { setError((error as Error).message); }
    finally { setAsking(false); questionInput.current?.focus(); }
  }
  async function remove() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await api(`/api/documents/${deleting.id}`, { method: 'DELETE' });
      setDocuments(previous => previous.filter(document => document.id !== deleting.id));
      setSelected(previous => previous.filter(id => id !== deleting.id));
      setExchanges([]); setDeleting(null);
    } catch (error) { setError((error as Error).message); }
    finally { setRemoving(false); }
  }
  const visibleDocuments = documents.filter(document => document.name.toLowerCase().includes(search.toLowerCase()));
  const prompts = ['What are the key findings?', 'What deadlines are mentioned?', 'What are the next steps?'];

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="DocuMind home"><span className="brand-icon"><BookOpen size={22} /></span>DocuMind<span className="brand-dot">.</span></a>
      <div className="workspace-label"><span className="workspace-avatar">P</span><span>Personal workspace<small>Your space to think</small></span></div>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button className={view === 'workspace' ? 'nav-item active' : 'nav-item'} onClick={() => setView('workspace')}><MessageSquare size={18} /> Ask your documents <span className="nav-dot" /></button>
        <button className={view === 'library' ? 'nav-item active' : 'nav-item'} onClick={() => setView('library')}><FolderOpen size={18} /> Document library <span className="count">{documents.length}</span></button>
      </nav>
      <div className="sidebar-note"><div className="note-icon"><Sparkles size={18} /></div><strong>Less searching.<br />More understanding.</strong><p>Bring your knowledge together.<br />Find the answers that matter.</p><button onClick={() => setShowInfo(true)}>How it works <ArrowRight size={14} /></button></div>
      <div className="profile"><span className="profile-avatar">Y</span><div>Your workspace<small>Local · Single user</small></div><span className="online-dot" /></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div>Workspace <span>/</span> <strong>{view === 'workspace' ? 'Ask your documents' : 'Document library'}</strong></div><button className="mode-badge" onClick={() => setShowInfo(true)}><span className="online-dot" /> {mode === 'ai' ? `${provider} configured` : 'Local search'} <ChevronDown size={13} /></button></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span /> A LITTLE CLARITY GOES A LONG WAY</div><h1>{view === 'workspace' ? 'Your documents, understood.' : 'A home for your knowledge.'}</h1><p>{view === 'workspace' ? 'Turn the things you read into the answers you need.' : 'Keep your source material together, ready for your next question.'}</p></div><button className="primary upload-top" onClick={() => fileInput.current?.click()} disabled={uploading}><Plus size={17} /> Upload documents</button></div>
        <input ref={fileInput} type="file" accept=".pdf,.txt,.md" multiple hidden aria-label="Upload documents" onChange={event => event.target.files && void upload(event.target.files)} />
        {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        <div className={`content-grid ${view === 'library' ? 'library-view' : ''}`}>
          <section className="documents-panel panel" aria-labelledby="documents-heading">
            <div className="panel-heading"><h2 id="documents-heading"><FolderOpen size={18} />Your documents <span className="count">{documents.length}</span></h2></div>
            <p className="panel-description">Add a little context. Unlock a lot of insight.</p>
            <button className={`dropzone ${dragging ? 'dragging' : ''}`} disabled={uploading} onClick={() => fileInput.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void upload(event.dataTransfer.files); }}>
              <span className="upload-icon">{uploading ? <LoaderCircle className="spin" size={23} /> : <Upload size={23} />}</span><strong>{uploading ? 'Reading your documents…' : 'Drop your documents here'}</strong><span>or <b>browse files</b> to upload</span><small>PDF, TXT, Markdown · Up to 10 MB each</small>
            </button>
            <label className="search-box"><Search size={16} /><input aria-label="Search documents" placeholder="Find a document…" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <div className="list-heading"><span>{search ? 'SEARCH RESULTS' : 'ALL DOCUMENTS'}</span>{selected.length > 0 && <button onClick={() => setSelected([])}>Clear selection</button>}</div>
            <div className="document-list" aria-live="polite">
              {loading ? <div className="empty-library"><LoaderCircle className="spin" size={24} /><p>Loading your library…</p></div> : visibleDocuments.length === 0 ? <div className="empty-library"><div className="empty-file"><FileText size={26} /></div><strong>{search ? 'No matching documents' : 'Room for your next big idea'}</strong><p>{search ? 'Try a different file name.' : 'Your uploaded documents will appear here.'}</p></div> : visibleDocuments.map(document => <div className={`document-row ${selected.includes(document.id) ? 'selected' : ''}`} key={document.id}><label><input type="checkbox" checked={selected.includes(document.id)} onChange={() => setSelected(previous => previous.includes(document.id) ? previous.filter(id => id !== document.id) : [...previous, document.id])} /><span className="file-icon"><FileText size={20} /></span><span className="file-description"><strong title={document.name}>{document.name}</strong><small>{formatSize(document.size)}<span>·</span>{document.words.toLocaleString()} words</small></span></label><button className="delete-button" aria-label={`Delete ${document.name}`} onClick={() => setDeleting(document)}><Trash2 size={15} /></button></div>)}
            </div>
            <div className="document-footnote"><Check size={14} /><span>Saved locally in your workspace</span></div>
          </section>

          {view === 'workspace' && <section className="conversation-panel panel" aria-labelledby="conversation-heading">
            <div className="conversation-heading"><h2 id="conversation-heading"><Sparkles size={18} />Ask anything</h2><button className="text-button" disabled={exchanges.length === 0 || asking} onClick={() => setExchanges([])}><Plus size={14} /> New chat</button></div>
            <div className="conversation-content" aria-live="polite" aria-busy={asking}>
              {exchanges.length === 0 ? <div className="welcome"><div className="sparkle-orbit"><span className="orbit-small"><Sparkles size={12} /></span><Sparkles size={32} strokeWidth={1.5} /></div><div className="welcome-eyebrow">MEET YOUR SECOND BRAIN</div><h3>Good questions.<br /><span>Grounded answers.</span></h3><p>Upload a document, ask a question, and<br className="desktop-break" /> find the answer—with the source to back it up.</p><div className="prompt-list">{prompts.map(prompt => <button key={prompt} onClick={() => { setQuestion(prompt); questionInput.current?.focus(); }}>{prompt}<ArrowRight size={15} /></button>)}</div><div className="welcome-hint"><BookOpen size={13} /> A little knowledge is a great place to start.</div></div> : <div className="exchange-list">{exchanges.map((exchange, index) => <article className="exchange" key={index}><div className="question-bubble">{exchange.question}</div><div className="answer-title"><span className="mini-brand"><Sparkles size={14} /></span> DocuMind <span>{exchange.result.mode === 'ai' ? 'AI answer' : 'Matching passages'}</span></div><p className="answer-text">{exchange.result.answer}</p>{exchange.result.citations.map(citation => <details className="citation" key={`${citation.documentId}-${citation.index}`} open={exchange.result.mode === 'local'}><summary><span className="citation-number">{citation.index}</span><FileText size={13} /><span>{citation.name}</span><ChevronDown size={14} /></summary><blockquote>{citation.passage}</blockquote></details>)}</article>)}</div>}
              {asking && <div className="thinking"><LoaderCircle size={15} className="spin" /> {mode === 'ai' ? 'Reading your sources and thinking…' : 'Finding matching passages…'}</div>}
              <div ref={responseEnd} />
            </div>
            <div className="composer-area"><div className="scope-label"><span className="online-dot" /> {selected.length ? `${selected.length} selected document${selected.length === 1 ? '' : 's'}` : documents.length ? `Searching all ${documents.length} document${documents.length === 1 ? '' : 's'}` : 'Upload a document to get started'}</div><form className="composer" onSubmit={event => void ask(event)}><textarea ref={questionInput} rows={2} maxLength={2000} aria-label="Ask a question about your documents" placeholder="What would you like to understand?" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(event); } }} /><div className="composer-bottom"><span><Sparkles size={13} /> {mode === 'ai' ? 'Answers grounded in your documents' : 'Source passages · No API key needed'}</span><button type="submit" className="send-button" disabled={!question.trim() || !documents.length || asking || loading} aria-label="Send question">{asking ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={19} />}</button></div></form><p className="composer-note">{mode === 'ai' ? 'AI can make mistakes. Always check the original source.' : 'Local search finds matching words. Connect an AI key for generated answers.'}</p></div>
          </section>}
        </div>
        <footer className="page-footer"><span>Built for curious minds.</span><span>Your knowledge. A clearer perspective.</span></footer>
      </main>
    </div>
    {showInfo && <Modal titleId="info-title" onClose={() => setShowInfo(false)}><div className="modal-card"><button className="modal-close" aria-label="Close" autoFocus onClick={() => setShowInfo(false)}><X size={20} /></button><span className="brand-icon"><BookOpen size={24} /></span><h2 id="info-title">From documents to understanding.</h2><ol><li><strong>Bring your sources.</strong> Upload text-based PDFs, plain text, or Markdown.</li><li><strong>Ask a focused question.</strong> Select documents to narrow your search, or explore your whole library.</li><li><strong>Follow the evidence.</strong> Open citations to read the matching passages.</li></ol><p>{mode === 'ai' ? `${provider} is configured. Your question and relevant excerpts are sent to ${provider} to generate an answer. Ask a question to verify that your key and quota work.` : 'Local mode is active. Search returns excerpts using matching words, without sending documents to an AI provider.'}</p><p>Documents persist on this machine. Chats last until you reload the page. This workspace is designed for one user.</p><button className="primary" onClick={() => setShowInfo(false)}>Let’s get started <ArrowRight size={16} /></button></div></Modal>}
    {deleting && <Modal titleId="delete-title" onClose={() => { if (!removing) setDeleting(null); }}><div className="modal-card"><h2 id="delete-title">Remove this document?</h2><p><strong>{deleting.name}</strong> will be removed from this workspace. The current chat will also be cleared. Your original file will not be changed.</p><div className="modal-actions"><button className="secondary" autoFocus disabled={removing} onClick={() => setDeleting(null)}>Keep document</button><button className="danger" disabled={removing} onClick={() => void remove()}>{removing ? 'Removing…' : 'Remove document'}</button></div></div></Modal>}
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
