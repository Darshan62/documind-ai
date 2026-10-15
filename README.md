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

## Gemini AI answers (free-tier option)

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey). Select a project with access to the Gemini API free tier. Availability and limits depend on your account, region, and chosen model; this app does not guarantee unlimited or free usage. Check your project's tier and quotas in AI Studio before enabling billing.
2. Create a file named `.env` beside `package.json`. You can copy `.env.example` and rename the copy to `.env`. On Windows, ensure it is not accidentally named `.env.txt`.
3. Add your key to that local file:

   ```env
   GEMINI_API_KEY=your_actual_gemini_key_here
   GEMINI_MODEL=gemini-2.5-flash-lite
   PORT=3000
   ```

4. Stop the running server with Ctrl+C and run `npm run dev` again. Refresh the browser. **Gemini configured** means the server detected a key; upload a document and ask a question to verify that it works.

The default model is `gemini-2.5-flash-lite`. If it is unavailable for your account, set `GEMINI_MODEL` to an available text model with free-tier access listed in [Google's model documentation](https://ai.google.dev/gemini-api/docs/models), then restart. For a quota/rate-limit error, wait and retry or check the project's limits in AI Studio. The app does not automatically switch to a paid model or another provider when Gemini fails.

If you downloaded an earlier GitHub ZIP, stop the server and download the updated ZIP into a **new folder**. Open that folder in your IDE, create `.env` there, run `npm ci`, and then `npm run dev`. Keep the old folder until you have verified the update. To retain uploaded documents, copy its `.data` folder into the new folder before starting the new app. Do not copy the old `node_modules` folder.

Keep keys private. `.env` is ignored by Git. Keys are used only on the server, never bundled into the browser. In Codex cloud settings, bind `GEMINI_API_KEY` securely and allow HTTPS to `generativelanguage.googleapis.com`.

With no key, the application returns direct source passages. With a Gemini key, it sends your question and up to four relevant excerpts to Google for a cited answer. Before using private documents, review [Google's Gemini API terms](https://ai.google.dev/gemini-api/terms), including data use for unpaid services. Each question is independent; the chat display is not conversational memory. Generated answers still need human verification.

Existing OpenAI users can keep `DOCUMIND_API_KEY` and optional `DOCUMIND_MODEL` (default `gpt-4.1-mini`). Gemini takes priority if both providers' keys are set. OpenAI requests go to `api.openai.com`.

## Storage and limits

- Parsed document text and metadata persist in `.data/documents.json`, excluded from Git. Override the storage directory with `DOCUMIND_DATA_DIR`.
- Files must be PDF, UTF-8 TXT, or Markdown, at most 10 MB and 2 million extracted characters. The workspace accepts up to 100 documents. Scanned PDFs require OCR elsewhere first.
- Retrieval uses word overlap, not embeddings or semantic search. It works best with specific terms present in the document. Only matching passages are passed to the optional AI.
- Chats remain in browser memory until reload. Deleting a document clears the current chat. Original upload files are never modified or retained; extracted text is stored locally.
- This is a single-user local application. It has no login, tenant separation, or public hosting configuration. Keep it bound to loopback. Persistent storage assumes one server process per data directory.
- Fonts are bundled locally; local mode does not make external AI or font requests.

## Cloud setup

Use the existing checkout at `/workspace/documind-ai`; cloud tasks are already isolated, so a separate Git worktree is unnecessary. In the supplied cloud environment, use `npm ci --cache /workspace/.npm-cache` to keep the package cache writable. Re-run tests and build after code changes. Live server processes need to restart in each task, even when dependencies and built files are restored.
