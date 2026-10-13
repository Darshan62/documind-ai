# DocuMind AI

A local document workspace for uploading PDF, TXT, and Markdown files, asking questions, and reading source citations. Built with React, TypeScript, Vite, and Express.

## Start developing

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

The server listens on the loopback interface on port 3000. It serves both the API and the development frontend. Use `PORT` to change the port. Upload a text-based document, then ask a question using words from the source. Select documents to narrow the search. No credentials are needed for local passage search.

```sh
npm test          # Integration tests, including real PDF extraction
npm run build    # Type check and production frontend build
npm start        # Serve the production build on port 3000
```

## Optional AI answers

Set `DOCUMIND_API_KEY` on the server to an OpenAI API key, then restart. You can copy `.env.example` to the ignored `.env` file for local development. Never commit credentials. In a Codex cloud environment, configure the key securely in environment settings and allow HTTPS access to `api.openai.com`; use the variable name `DOCUMIND_API_KEY`. The default model is `gpt-4.1-mini`; override it with `DOCUMIND_MODEL`.

With no key, the application clearly labels its results as direct source passages. With a key, it sends the question and up to four relevant excerpts to OpenAI for a cited answer. It does not silently substitute local results when an AI request fails. Each question is independent; the chat display is not conversational memory. Generated answers still need human verification.

## Storage and limits

- Parsed document text and metadata persist in `.data/documents.json`, excluded from Git. Override the storage directory with `DOCUMIND_DATA_DIR`.
- Files must be PDF, UTF-8 TXT, or Markdown, at most 10 MB and 2 million extracted characters. The workspace accepts up to 100 documents. Scanned PDFs require OCR elsewhere first.
- Retrieval uses word overlap, not embeddings or semantic search. It works best with specific terms present in the document. Only matching passages are passed to the optional AI.
- Chats remain in browser memory until reload. Deleting a document clears the current chat. Original upload files are never modified or retained; extracted text is stored locally.
- This is a single-user local application. It has no login, tenant separation, or public hosting configuration. Keep it bound to loopback. Persistent storage assumes one server process per data directory.
- Fonts are bundled locally; local mode does not make external AI or font requests.

## Cloud setup

Use the existing checkout at `/workspace/documind-ai`; cloud tasks are already isolated, so a separate Git worktree is unnecessary. In the supplied cloud environment, use `npm ci --cache /workspace/.npm-cache` to keep the package cache writable. Re-run tests and build after code changes. Live server processes need to restart in each task, even when dependencies and built files are restored.
