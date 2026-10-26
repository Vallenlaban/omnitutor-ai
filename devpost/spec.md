---
doc: spec
status: approved
---

# OmniTutor AI — Technical Specification

## How This Works, In Plain Language

OmniTutor runs as one local Node.js application on port 3000. Express is the web server: it serves the React app and receives its `/api/*` requests. During development, Vite runs inside that same Express process, so the browser and API share one address.

The browser handles the interface and document reading. PDF.js extracts text one page at a time. JSZip is opened only for a file already identified as `.pptx`; it reads the presentation’s slide text and embedded images, but does not run or accept arbitrary ZIP archives. The browser sends extracted page/slide text to Express, which divides it into stable source segments and keeps the text and location in a temporary in-memory registry.

For a video, the browser uploads the original file to `/api/transcribe-video`. Express temporarily stores it, sends supported small MP4/WebM files directly to Groq Whisper, or uses the bundled FFmpeg binary to extract compressed audio when needed. Whisper returns timestamped transcript segments. Express gives those segments stable IDs, adds them to the same registry, and removes temporary files.

When the student asks a question or starts a quiz, the browser sends the workspace ID and the IDs of the selected segments—not replacement source text. Express retrieves the matching text, asks Groq for a structured response, and checks every citation. The model can refer only to segment IDs it was given. Express verifies each exact quoted passage, looks up its trusted page, slide, or timestamp, calculates highlight offsets, and only then returns clickable citations to the browser. The browser renders formulas with KaTeX and speaks explanations with the built-in Web Speech API.

This keeps API keys and citation-location decisions on the server while avoiding a database and account system. The tradeoff is that uploaded-source indexes and chat are temporary for the current workspace; a reload starts a fresh workspace with the curated sample. The language preference is kept separately in the browser.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

```text
Browser: React/Vite              Express :3000                 Groq
       |                               |                         |
       | load sample or parse PDF/PPTX |                         |
       |------ POST /api/sources/index>| segment + register      |
       |<----- stable segment IDs -----|                         |
       |                               |                         |
       | upload video ---------------->| validate/temp file      |
       |                               |-- Whisper transcription>|
       |                               |<-- timestamped text -----|
       |                               | register stable segments|
       |<------ transcript/index -------|                         |
       |                               |                         |
       | question + selected IDs ------>| retrieve exact segments|
       |                               |-- structured prompt ---->|
       |                               |<-- JSON with segment IDs-|
       |                               | verify quotes + offsets  |
       |<------ validated answer/cites-|                         |
       | click citation: show local evidence card (<100 ms)       |
       |                               |                         |
       | quiz generate/submit -------->| fetch selected segments  |
       |                               |-- structured quiz ------>|
       |                               |<-- schema-checked JSON ---|
       |<------ quiz / graded feedback-|                         |
```

1. Express serves the curated sample and client application. The sample is registered in the same source index as user materials.
2. For PDFs and PPTX files, the browser extracts text and unit locations. It registers the extracted units through `/api/sources/index`; Express returns server-generated segment IDs and stores the source.
3. For videos, the browser posts the original file to `/api/transcribe-video`. Express validates the format and size, transcribes with Groq Whisper, registers timestamped transcript segments, and deletes all temporary files.
4. The student chooses active source segments. `/api/tutor` and `/api/quiz` accept their IDs and workspace ID; Express loads the text from the registry and does not trust client-supplied source text.
5. Express sends all selected segments when they fit the small-context threshold; for larger selections, it ranks only those segments locally and sends the best-matching set plus nearby context. Groq receives no source locations, only IDs and text.
6. Groq returns schema-constrained JSON. Express validates each segment ID and exact quote, resolves the quote to character offsets, and attaches source metadata from the registry. Invalid citations are stripped; if any substantive answer block has no verified citation, the response is converted to an unsupported response.
7. The client displays the tutor answer, quiz, and evidence. Selecting an already-indexed citation changes the evidence card/highlight within the PRD’s 100 ms target.

## Stack

| Area | Choice | Reason and tradeoff |
|---|---|---|
| Language/runtime | TypeScript on Node.js LTS | Matches the learner’s experience; shared request/response types reduce client/server contract drift. |
| Frontend | React 19 + Vite | Learner-approved. A responsive single-page study workspace with fast local development. |
| Styling/icons | Tailwind CSS + `lucide-react` | Learner-approved; quick implementation of the agreed academic workspace and clear source indicators. |
| Math | KaTeX | Renders model-provided LaTeX in tutor and quiz blocks. Invalid formulas fall back to visible source text instead of breaking the response. |
| PDF | `pdfjs-dist` (Mozilla PDF.js) | Browser-side text extraction by page and visual PDF preview. Image-only PDFs remain viewable but are not searchable without OCR. |
| PowerPoint | `jszip` + browser `DOMParser` | Used only after `.pptx` extension and OpenXML structure checks. Reads slide XML, relationships, and embedded media; does not render pixel-perfect slides. |
| Retrieval | Local deterministic BM25-style keyword ranking | No embedding service or vector database; trades some semantic recall (especially cross-language phrasing) for low setup, cost, and latency. |
| Server | Express 5 + Vite middleware mode | Learner-approved Express architecture. One process serves APIs and the app on port 3000 in development; production Express serves the Vite build. |
| Groq | `groq-sdk` | Server-side client for chat completions and audio transcriptions. API key never enters the browser bundle. |
| Uploads | Multer, disk-backed temporary storage | Enforces the 50 MB POC upload ceiling without holding whole videos in Node memory. Temporary files are removed in `finally`. |
| Audio extraction | `ffmpeg-static` + Node `child_process.spawn` | Uses the bundled FFmpeg binary without an unmaintained fluent wrapper or OS-level FFmpeg installation. Arguments are fixed, not assembled into a shell command. |
| TypeScript server runner | `tsx` | Runs the Express TypeScript entry point in development and the local production preview without a separate server compilation pipeline. |
| Speech | Browser Web Speech API | No extra service or API key for English/Indonesian speech playback; voice availability depends on the device/browser. |
| Source/quiz storage | `ISourceRegistry` and quiz registry backed by in-memory `Map`s | Suitable for the local single-user POC. No database setup; contents expire with the server/workspace and are not a durable record. |

Use the package manager lockfile to pin exact dependency versions during build. Groq’s current model catalog/rate-limit documentation lists the requested chat models and documents structured-output support. Its speech-to-text documentation lists both Whisper Large v3 models, `verbose_json` segment timestamps, and plan-dependent file-size limits. Recheck model availability, schema support, upload limits, and account pricing when setting up the Groq account; these can change.

### Groq Models and Failover

- **Primary chat model:** `openai/gpt-oss-20b`.
- **Fallback sequence:** `openai/gpt-oss-120b`, then `qwen/qwen3.8-27b`.
- **Transcription:** `whisper-large-v3`, selected for multilingual accuracy; `whisper-large-v3-turbo` is a documented lower-cost/faster alternative but is not the chosen model.
- **Failover:** Try models in the listed order. For transient network errors, rate limits (respecting `Retry-After` within a bounded request deadline), and provider 5xx errors, make at most one attempt per configured key/model pair. Do not retry malformed client payloads or silently mask configuration/model-ID errors. If all configured attempts fail, return an explicit retryable API error.
- **Key rotation:** Read `GROQ_API_KEY` and optional `GROQ_API_KEY_2`, `GROQ_API_KEY_3` from server environment only. Never send keys to the client or log them. Rotate keys on authentication/rate-limit/provider-specific failures; avoid unbounded retries.
- **Structured output:** Use Groq Chat Completions `response_format: { type: "json_schema", ... }` with strict schemas for tutoring and quiz generation. The server still validates returned JSON and all references before use; model schema compliance alone does not establish citation validity.

## Where It Runs and How Someone Tries It

- **Run target:** Local Windows development machine with Node.js LTS and npm. No deployment platform has been selected; a local app is sufficient for recording the demo. Deployment is optional and does not replace the required short demo video and public GitHub repository.
- **Address:** `http://localhost:3000`.
- **Development server:** `server.ts` creates Express, registers `/api/*` routes, starts Vite with `server.middlewareMode: true`, mounts the Vite middleware, and listens on port 3000. API routes are registered before the Vite fallback.
- **Production preview:** Vite builds the client to `dist/`; Express serves that directory and the same API routes on port 3000.
- **Commands:** `npm install`, create local `.env` from `.env.example`, then `npm run dev` (`tsx watch server.ts`). For a production-like check, run `npm run build` (`vite build`) followed by `npm start` (`tsx server.ts`).
- **Environment:** `GROQ_API_KEY` is required; optional additional Groq key variables are server-only. `PORT` defaults to `3000`. `.env` remains ignored by `.gitignore`; `.env.example` contains names/placeholders only.
- **File-size limit:** Videos, PDFs, and PPTX files are each limited to 50 MB. Reject oversized PDFs/PPTX files in the browser before PDF.js/JSZip parsing, with a friendly localized message such as “File exceeds the 50 MB limit.” / “El archivo supera el límite de 50 MB.” Enforce the video limit on both client and server, and bound the `/api/sources/index` JSON body as well.
- **Exposure:** The POC server is intended for local use. Do not expose it publicly without adding appropriate API rate limiting and abuse controls; the absence of learner accounts is intentional and does not protect a publicly reachable Groq proxy.
- **Demo path:** Open the sample module, register/check its sources, add or choose a video/PDF/PPTX, inspect processing and source evidence, ask a grounded question, click its citation, then generate and complete a three-question quiz. Record this local flow in the required demo video.

## Look and Feel

Implements `prd.md > Look and Feel`.

- Apply Clean Slate `#F8FAFC` surfaces, Indigo/Violet `#4F46E5` focus states, soft borders, and 12–16 px rounded cards.
- Use readable sans-serif typography, spacious but compact enough to show source cards, chat, and evidence together.
- Use Ruby/Red, Emerald/Teal, and Amber/Orange citation styles by video, PDF, and slide type; use a distinct Notes style.
- Desktop uses a study/source area, tutor, and evidence panel; mobile keeps chat full-width and opens evidence in a bottom sheet.
- Keep processing and error states visible without blocking chat; animate evidence highlight briefly.

## Components

### Express and Vite Application Server

`server.ts` creates the Express app, middleware, API routes, Vite development middleware, and production static-file serving. Keep the frontend and API same-origin on port 3000. API handlers and the API error handler run before the client fallback.

Implements `prd.md > Screens and Layout` and `prd.md > States and Boundaries`.

### Shared TypeScript Contracts

`shared/types.ts` defines:

- `SourceItem`: `sourceId`, `workspaceId`, `sourceType`, `filename`, status, selected flag, unit count, and metadata.
- `SourceSegment`: stable `segmentId`, `sourceId`, type, original text, unit number, optional video start/end milliseconds, and server-calculated offsets.
- `EvidenceCitation`: segment/source identity, exact verified quote, trusted source location, and `[start_char, end_char)` highlight range.
- `TutorMessage` and `TutorBlock`: message language/status, text/math blocks, validated citations, follow-up, and out-of-scope suggestions.
- `QuizQuestion`: question/prompt blocks, four options, progress identity, and public feedback fields; the correct answer key is not sent to the client before submission.
- Typed API request/response and error envelopes for all routes.

Implements `prd.md > Source Selection and Grounded Tutoring`, `prd.md > Practice Quiz`, and `prd.md > Study Workspace and Source Ingestion`.

The public `EvidenceCitation` includes `sourceId`, `segmentId`, source type/title, trusted location, exact verified quote, the source segment excerpt needed for local display, and `highlight: { start_char, end_char }`. Location is a discriminated union: video `{ start_ms, end_ms }`, PDF `{ page_number }`, PPTX `{ slide_number }`, or notes `{ section_number }`. The client can therefore open evidence immediately from its response/cache without a network round trip on citation click.

### Source Registry and Segmenter

`server/source-registry.ts` implements `ISourceRegistry` with an in-memory `Map<workspaceId, Map<segmentId, SegmentData>>`. Controllers depend on the interface, not the `Map`, so storage can later change without rewriting route logic.

- `/api/sources/index` validates source metadata and units, normalizes text, splits long units into deterministic logical chunks, and binds each chunk to its source type and unit location.
- Segment IDs follow `seg_${source_id}_u${unit_number}_${chunk_idx}`, with a zero-padded chunk index (for example, `seg_src_lecture_slide_01_u1_001`).
- Re-indexing the same source replaces its old segments within the workspace. Removing a source removes its segments; reset clears the workspace and reloads the curated sample.
- The server stores source text and location metadata only in memory for the current workspace. Expire inactive workspaces after 30 minutes and clear associated quiz state to bound local process memory.

Implements `prd.md > Study Workspace and Source Ingestion` and `prd.md > Product Decisions`.

### Local Source Retrieval

`server/retriever.ts` receives only active segment IDs already resolved by `ISourceRegistry`.

- If the combined active text is below 40,000 characters, pass all active segments to the model.
- Above that threshold, lowercase and tokenize the query and segment text, remove common English/Indonesian stop words, and rank locally with a deterministic BM25-style score. Send the top 20 segments, plus immediately adjacent segments when they fit the same context budget.
- If every score is zero, send a small opening/overview subset and tell the model the query has no matched evidence; the model must answer out of scope unless that context supports it.
- Model citations are validated against only the segments actually sent in that request, not every segment in the workspace.

This avoids a vector database or embedding API for the POC. Lexical ranking can miss semantically related or differently worded material, especially across English/Indonesian; source filters and curated topic presets provide a manual way to narrow the search.

Implements `prd.md > Source Selection and Grounded Tutoring` and `prd.md > Practice Quiz`.

### PDF Parser and Viewer

`src/lib/pdf-ingest.ts` uses `pdfjs-dist` in the browser to extract text per page and preserve page numbers. Before parsing, reject files larger than 50 MB and show the localized size-limit warning. It sends `{ unit_number, raw_text }` entries to `/api/sources/index`, whose JSON body is also size-limited. The PDF viewer uses the original browser `File`/object URL and supports navigation to cited pages. If no selectable text is found, keep the PDF view available and flag it as visual-only; OCR is not included.

Implements `prd.md > Study Workspace and Source Ingestion` and `prd.md > Source Selection and Grounded Tutoring`.

### PPTX Parser and Slide Evidence

`src/lib/pptx-ingest.ts` accepts only `.pptx`. Before parsing with JSZip, reject files larger than 50 MB with the localized size-limit warning, then validate the extension and required OpenXML entries such as `[Content_Types].xml`, `ppt/presentation.xml`, and slide XML under `ppt/slides/`. Reject `.zip` and archives without the PowerPoint structure.

- Parse the presentation relationships to retain slide order; do not assume filename sort order equals presentation order.
- Extract each slide’s text runs, title/bullets where available, and embedded media referenced by that slide’s relationship file.
- Register slide text as units through `/api/sources/index`, preserving the slide number as location metadata.
- Evidence cards show the slide number, extracted title/text/bullets, and associated extracted images. Provide an “Open / Download Original PPTX” action. Do not promise pixel-perfect slide rendering.
- If no text is extracted, mark it visual-only, display available media, and do not include it in tutor/quiz context.

Implements `prd.md > Study Workspace and Source Ingestion` and `prd.md > Source Selection and Grounded Tutoring`.

### Video Upload and Transcription Route

`server/routes/transcribe-video.ts` exposes `POST /api/transcribe-video`; Multer stores one file in a random temporary path and enforces a 50 MB POC ceiling. Validate extension, MIME type, and media probing before processing. Do not use the client filename as a filesystem path.

1. MP4/WebM files within the conservative 24 MB direct-pass-through limit can be sent to the transcription endpoint. The app's incoming video cap is 50 MB; the Groq account may permit 25 MB or 100 MB depending on plan.
2. MOV files and files above the direct-pass-through limit are normalized with the `ffmpeg-static` binary, invoked via `spawn` with a fixed argument array, for example: `-i input -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 64k output.mp3 -y`.
3. If normalized audio is larger than the conservative provider payload limit, split it into 10-minute chunks, transcribe each chunk, and add its starting offset to every returned timestamp before combining the transcript.
4. Apply a 60-second FFmpeg process timeout, capture bounded stderr for diagnostics, and stop/clean up on timeout or error.
5. Call Groq `audio.transcriptions.create` with `model: "whisper-large-v3"`, `response_format: "verbose_json"`, and `timestamp_granularities: ["segment"]`. Convert Whisper seconds to integer milliseconds; Express creates and registers stable video segment IDs.
6. In a `finally` block, delete the uploaded video, normalized audio, and chunk files regardless of success/failure. The browser retains its own file for local preview during the active session.

Whisper accepts plan-dependent maximum file sizes (currently documented as 25 MB on the free tier and 100 MB on the Developer tier); do not assume the 50 MB app limit is the Groq limit. The server uses 24 MB as a conservative payload ceiling, so it does not need to infer the account plan. Transcription/transcoding duration depends on file, CPU, network, and account limits; show step progress rather than promising sub-second processing.

Implements `prd.md > Study Workspace and Source Ingestion` and `prd.md > States and Boundaries`.

### Tutor Route and Citation Verification

`server/routes/tutor.ts` exposes `POST /api/tutor`. The request contains `workspace_id`, `query`, `language`, optional bounded conversation history, topic scope, and `active_segment_ids`. It does not accept raw source text. The handler resolves IDs from `ISourceRegistry`, rejects unknown IDs, and sends only selected segments to the model.

**Model response schema (server-side):**

```json
{
  "status": "grounded",
  "blocks": [
    {
      "type": "text",
      "text": "Gradient descent updates parameters opposite the gradient.",
      "citations": [
        {
          "segment_id": "seg_src_lecture_01_u12_001",
          "verbatim_quote": "The parameters are updated in the opposite direction of the gradient."
        }
      ]
    },
    {
      "type": "math",
      "latex": "\\theta_{t+1}=\\theta_t-\\eta\\nabla J(\\theta_t)",
      "display_mode": true,
      "citations": [
        {
          "segment_id": "seg_src_textbook_p14_003",
          "verbatim_quote": "The learning rate controls the size of each step."
        }
      ]
    }
  ],
  "follow_up": "What might happen if the learning rate is too large?",
  "suggested_questions": [],
  "general_context": null
}
```

For out-of-scope requests, return `status: "out_of_scope"`, a clear notice, two or three supported suggestions if available, and zero citations. Optional general context must be separately labeled unverified. The model schema forbids raw page numbers, slide numbers, timestamps, or location metadata in citation markers.

**Tutor model output contract**

- `status`: `"grounded"` or `"out_of_scope"`.
- `blocks`: text or math blocks. Each substantive block includes citations containing only `{ segment_id, verbatim_quote }`; a quote is one or two sentences at most.
- `follow_up`: a short question or `null`.
- `suggested_questions`: zero to three questions from active segments.
- `general_context`: `null` or a separate object with the fixed unverified label and context text.

**Quiz model output contract**

```json
{
  "questions": [
    {
      "question_id": "q1",
      "prompt": "Which direction minimizes the objective locally?",
      "options": [
        { "option_id": "A", "text": "Along the positive gradient" },
        { "option_id": "B", "text": "Opposite the gradient" },
        { "option_id": "C", "text": "Perpendicular to the gradient" },
        { "option_id": "D", "text": "Always at random" }
      ],
      "correct_option_id": "B",
      "feedback_by_option": [
        {
          "option_id": "B",
          "text": "The update moves opposite the gradient.",
          "citations": [
            {
              "segment_id": "seg_src_lecture_slide_01_u1_001",
              "verbatim_quote": "Gradient descent updates parameters in the opposite direction of the gradient."
            }
          ]
        }
      ]
    }
  ]
}
```

The actual schema requires exactly three questions, exactly four unique option IDs per question, one feedback entry per option, and verified source citations for feedback. The server stores `correct_option_id` and all feedback privately, then returns only the question/options. After a student answers, it returns that option's verified feedback and correctness. As with tutor output, model-supplied source IDs are checked and locations/offsets are server-enriched.

**Citation verification and offsets**

- Validate each `segment_id` against the current workspace and selected active context.
- Find `verbatim_quote` in the registered segment using whitespace/punctuation-normalized matching. Keep an index map from normalized characters back to original JavaScript string positions so the returned offsets point into original text.
- Return 0-based, end-exclusive UTF-16 code-unit offsets `[start_char, end_char)` relative to the segment’s original text, plus trusted source location from the registry.
- Reject/strip citations with unknown IDs or unmatched quotes. Never render a guessed citation. If any substantive answer block loses all of its citations, or a supposedly grounded answer has no valid evidence citations, convert the response to the safe out-of-scope response. An out-of-scope response always has zero citations.
- These checks guarantee citations resolve to registered source text and locations; they reduce phantom/misleading citations but cannot mathematically guarantee every generated explanation is factually correct.

Implements `prd.md > Source Selection and Grounded Tutoring`.

### Quiz Route and Quiz Registry

`server/routes/quiz.ts` exposes `POST /api/quiz` for both `action: "generate"` and `action: "answer"`. Generation accepts `workspace_id`, selected segment IDs, topic/query context, and language; the server resolves text from the source registry.

- Generation uses strict JSON Schema and requires exactly three questions, four unique option IDs per question, and source-backed feedback for each option.
- The model’s private `correct_option_id` and per-option feedback are held in an in-memory quiz registry. The generation response omits the answer key.
- Answer submission sends `quiz_id`, `question_id`, and selected `option_id`. The server returns correctness, tailored feedback, and verified evidence citations. Repeated submission of the same answer is idempotent.
- Clear/expire quiz records with the workspace. A refresh starts a clean practice session.

Implements `prd.md > Practice Quiz` and `prd.md > States and Boundaries`.

### Evidence Inspector, Tutor UI, and Math

`src/components/` contains the study workspace, source drawer/cards, upload progress, tutor conversation, quiz, evidence panel, and mobile evidence bottom sheet. Citation components receive only validated `EvidenceCitation` values; they never parse location strings from model prose. On click, select the segment by ID, navigate to the correct PDF page/slide/video time, and highlight the supplied offsets. PPTX cards use extracted text and media plus the original-file action, not a full renderer.

Render model math blocks through KaTeX with `throwOnError: false`; keep malformed TeX visible as text. Do not insert untrusted model HTML into the DOM.

Implements `prd.md > Screens and Layout`, `prd.md > Source Selection and Grounded Tutoring`, and `prd.md > Look and Feel`.

### Language and Text-to-Speech

`src/lib/i18n.ts` holds English/Indonesian UI labels. Store `omnitutor_lang` in `localStorage`; generated messages preserve their original language. `src/lib/speech.ts` uses `speechSynthesis`, checks available voices, selects the best `en-*` or `id-*` match, falls back to a generic/system voice, and resets playback UI on `end`/`error`.

Implements `prd.md > Language and Spoken Explanations`.

## API Contracts

All endpoints return JSON except the video request body. JSON errors use `{ "error": { "code": "...", "message": "...", "retryable": false } }`. Validate request shape, string lengths, active IDs, and allowed actions before calling Groq.

### `POST /api/sources/index`

Registers browser-extracted PDF/PPTX/notes units or sample content.

```json
{
  "workspace_id": "ws_default_123",
  "source_id": "src_lecture_slide_01",
  "source_type": "pptx",
  "metadata": { "filename": "Lecture01_Optimization.pptx", "total_units": 24 },
  "units": [
    {
      "unit_number": 1,
      "raw_text": "Gradient Descent is a first-order iterative optimization algorithm..."
    }
  ]
}
```

Response includes `workspace_id`, `source_id`, and `indexed_segments` with `segment_id`, `unit_number`, location, short preview, and `char_count`. `source_type` is one of `pdf`, `pptx`, `notes`, `video`. Long units are split deterministically on the server.

Related lifecycle routes are `DELETE /api/sources/:workspace_id/:source_id` to remove one source and `DELETE /api/workspaces/:workspace_id` to clear the workspace. They return the updated source summary; clearing/restarting registers the curated sample again.

### `POST /api/transcribe-video`

`multipart/form-data` with `file`, `workspace_id`, and `source_id`; optional language hint. One supported video up to 50 MB. Response includes a ready `SourceItem` and indexed transcript segments (`segment_id`, text preview, `start_ms`, `end_ms`). No temporary path or provider response internals are returned.

### `POST /api/tutor`

Request:

```json
{
  "workspace_id": "ws_default_123",
  "query": "Jelaskan cara kerja learning rate pada Gradient Descent",
  "language": "id",
  "active_segment_ids": ["seg_src_lecture_slide_01_u1_001"]
}
```

The client may include only a small bounded recent conversation history; source text is always loaded by the server. Response contains `status`, validated content blocks, trusted citation metadata/offsets, follow-up, and supported questions when out of scope.

### `POST /api/quiz`

Generation request: `{ "action": "generate", "workspace_id": "...", "active_segment_ids": ["..."], "topic": "...", "language": "en" }`.

Answer request: `{ "action": "answer", "workspace_id": "...", "quiz_id": "...", "question_id": "...", "option_id": "B" }`.

Generation returns a quiz ID and three public questions with four options each, excluding correct answers. Answer returns the correctness result and validated feedback citations.

## Data Model and Data Flow

| Data | Where it lives | Updates and lifetime |
|---|---|---|
| Original selected PDF/PPTX/video | Browser `File` object and temporary object URL | Active page session only; revoke object URL when removed/unmounted. Server stores video temporarily only during transcription. |
| Extracted PDF/PPTX text units | Browser until `POST /api/sources/index`; then server registry | Browser sends extracted units once. Server splits and assigns stable IDs; memory only. |
| Video transcript | Server `ISourceRegistry` after transcription | Whisper timestamp segments become server-owned `SourceSegment`s; memory only. |
| Source cards and selected IDs | React app state | Append/remove/filter during workspace; refresh resets to sample. |
| Chat messages and active quiz UI | React app state | Current page/session only; refresh starts clean as required by PRD. |
| Quiz answer key and feedback | Server in-memory quiz registry | Created on quiz generation; removed with workspace/expiry. |
| Language preference | Browser `localStorage` key `omnitutor_lang` | Persists across reloads and topic/source changes. |
| API keys | Server environment | Never returned to client, committed, or logged. |

On client boot, generate a fresh workspace ID and register the curated sample. Workspace/source registries are process-memory only and should have bounded expiry/cleanup. There is no durable database, cloud file store, cross-device history, or account.

## File Structure

The application files below are planned; the current workspace has curriculum files but no app implementation yet.

```text
OmniTutor/
├── devpost/
│   ├── learner-profile.md
│   ├── scope.md
│   ├── prd.md
│   └── spec.md
├── public/
├── index.html                       # Vite application entry page
├── src/
│   ├── components/
│   │   ├── AppShell.tsx             # Header, responsive workspace layout
│   │   ├── SourceDrawer.tsx         # File tiles, pasted notes, cards, filters, reset/remove
│   │   ├── UploadStatusCard.tsx     # Format validation and progress/error UI
│   │   ├── TutorPanel.tsx           # Chat, question input, citations, TTS control
│   │   ├── QuizPanel.tsx            # Three-question practice and score state
│   │   ├── EvidenceInspector.tsx    # PDF/video/PPTX/notes citation evidence
│   │   ├── MathBlock.tsx            # Safe KaTeX renderer
│   │   └── CitationBadge.tsx        # Validated source-linked citation
│   ├── data/
│   │   └── sampleModule.ts          # Clearly labeled curated sample units
│   ├── lib/
│   │   ├── api.ts                   # Typed fetch clients for Express routes
│   │   ├── pdf-ingest.ts            # PDF.js text extraction and viewer helpers
│   │   ├── pptx-ingest.ts           # JSZip/OpenXML extraction and media mapping
│   │   ├── speech.ts                # Native Web Speech API
│   │   └── i18n.ts                  # English/Indonesian UI strings
│   ├── styles/
│   │   └── index.css                # Tailwind entry and theme tokens
│   ├── App.tsx
│   └── main.tsx
├── server/
│   ├── routes/
│   │   ├── sources.ts               # POST /api/sources/index, remove/reset
│   │   ├── transcribe-video.ts      # Multer, FFmpeg and Whisper pipeline
│   │   ├── tutor.ts                 # Grounded answer and citation checks
│   │   └── quiz.ts                  # Generate/answer actions
│   ├── source-registry.ts           # ISourceRegistry + Map implementation
│   ├── quiz-registry.ts             # Private answer keys/feedback in memory
│   ├── groq-handler.ts              # Groq SDK, model/key fallback
│   ├── retriever.ts                 # All-selected or local top-K context selection
│   ├── citation-verifier.ts         # ID/quote checks and offsets
│   ├── ffmpeg.ts                    # spawn wrapper, timeout, stderr, cleanup
│   ├── validation.ts                # Request/file validation
│   └── errors.ts                    # Typed API errors
├── shared/
│   └── types.ts                     # Shared source, citation, tutor, quiz contracts
├── server.ts                        # Express + Vite middleware, port 3000
├── vite.config.ts                   # React and Tailwind Vite plugins
├── tsconfig.json
├── package.json
├── package-lock.json
├── .env.example
└── .gitignore
```

## External Services and Dependencies

| Dependency/service | Use | Documentation |
|---|---|---|
| React | Responsive client components | [React documentation](https://react.dev/learn) |
| TypeScript | Shared frontend/server contracts | [TypeScript handbook](https://www.typescriptlang.org/docs/) |
| Groq TypeScript SDK | Server-side model and audio requests (`groq-sdk`) | [Groq TypeScript SDK](https://github.com/groq/groq-typescript) |
| Groq Chat Completions | `POST https://api.groq.com/openai/v1/chat/completions`; the SDK authenticates from the server environment key; JSON Schema response format for tutor and quiz | [Text generation](https://console.groq.com/docs/text-chat), [Structured Outputs](https://console.groq.com/docs/structured-outputs), [API reference](https://console.groq.com/docs/api-reference) |
| Groq speech-to-text | `POST https://api.groq.com/openai/v1/audio/transcriptions`; the SDK authenticates from the server environment key; `whisper-large-v3`, `verbose_json`, `timestamp_granularities: ["segment"]` | [Speech-to-text](https://console.groq.com/docs/speech-to-text), [Models](https://console.groq.com/docs/models), [Rate limits](https://console.groq.com/docs/rate-limits) |
| `pdfjs-dist` | Browser PDF text extraction and rendering | [Mozilla PDF.js](https://mozilla.github.io/pdf.js/) |
| `jszip` | Read only validated `.pptx` OpenXML entries in browser | [JSZip documentation](https://stuk.github.io/jszip/) |
| Express | Local server routes and static app | [Express routing](https://expressjs.com/en/guide/routing.html), [Express middleware](https://expressjs.com/en/guide/using-middleware.html) |
| Vite | React dev server middleware and production client build | [Vite backend integration](https://vite.dev/guide/backend-integration.html), [Vite server options](https://vite.dev/config/server-options) |
| Multer | Limited multipart video upload | [Multer](https://github.com/expressjs/multer) |
| `ffmpeg-static` | Bundled FFmpeg binary for normalized audio extraction | [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) |
| Node child process | Run the fixed FFmpeg argument list without a shell | [Node.js `child_process`](https://nodejs.org/api/child_process.html) |
| `tsx` | Run the TypeScript Express entry point | [tsx](https://tsx.is/) |
| KaTeX | STEM formula rendering | [KaTeX API](https://katex.org/docs/api.html) |
| Tailwind CSS | Utility styling via Vite plugin | [Tailwind + Vite](https://tailwindcss.com/docs/installation/using-vite) |
| Lucide React | Tree-shakable interface icons | [Lucide React](https://lucide.dev/guide/react) |
| Web Speech API | Local text-to-speech; device voices vary | [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) |

Groq calls require an account/API key. At the time of research, Groq documents `whisper-large-v3` at $0.111 per audio hour and `whisper-large-v3-turbo` at $0.04 per audio hour; the selected full model favors transcription quality. Prices and request/audio limits can change and depend on the account plan, so check the Groq console before the demo. There is no separate database, hosting, or document-conversion service.

## Important Failure Modes

- **Unsupported, corrupt, or oversized upload** → Reject before parsing or provider calls; PDFs/PPTX over 50 MB are rejected in the browser, and video limits are checked client- and server-side. Show a specific message and leave other sources/chat usable.
- **FFmpeg timeout or invalid media** → Stop the process after 60 seconds, capture bounded stderr, delete every temporary file, and offer retry/subtitle attachment. Never leave partial temporary files.
- **Groq rate limit, timeout, or provider failure** → Try the configured model/key fallback policy within bounded limits; then return an explicit retryable error and preserve the user’s query/answer selection.
- **Malformed structured output, invalid segment ID, or unverified quote** → Parse and validate server-side; strip invalid citations. If no verified citations remain, return an out-of-scope response rather than a success-shaped uncited answer.
- **Image-only PDF/PPTX or silent video** → Keep a visual reference where supported, mark visual-only, exclude from retrieval, and show the PRD recovery actions.
- **Missing speech voice or invalid TeX** → Preserve readable text; use a muted TTS state or visible formula text.

## What Was Simplified and Why

- **Temporary in-memory registries** instead of a database — a single-user local demo needs only workspace-scoped source and quiz state; there are no accounts or durable history.
- **Browser-side PDF/PPTX extraction** instead of a document-processing service — avoids server OCR and keeps the server focused on indexing, citations, and Groq calls.
- **Extracted PPTX cards/media** instead of a pixel-perfect presentation renderer — preserves inspectable text and images without a full slide rendering engine.
- **Selected source segments** instead of sending every source on every request — reduces context size and prevents inactive/visual-only material from entering grounding.
- **FFmpeg static binary + `spawn`** instead of `fluent-ffmpeg` — the wrapper’s own repository marks it deprecated and unmaintained; the small fixed command avoids that dependency while retaining server-side format support.
- **Groq-hosted inference** instead of local model hosting — matches the learner’s selected provider and avoids GPU/model setup; depends on network access, account limits, and usage charges.

## Decisions and Open Issues

### Agreed Decisions

- Use Vite + React 19 + TypeScript, Tailwind, Lucide React, KaTeX, PDF.js, JSZip, Express, `groq-sdk`, Multer, and `ffmpeg-static`.
- Serve the development and production application with Express on port 3000; use Vite middleware in development to keep one origin.
- Use Groq `openai/gpt-oss-20b`, then `openai/gpt-oss-120b`, then `qwen/qwen3.8-27b` for chat/quiz; use `whisper-large-v3` for transcription.
- Keep Groq calls and keys server-side; rotate optional environment-configured keys and fail over models only within bounded retry rules.
- Use server-owned segment IDs and locations. The model returns IDs plus exact quotes only; server validates them and calculates offsets before the UI receives a citation.
- Register extracted document/sample units through `/api/sources/index`; use an in-memory `ISourceRegistry` for the local proof of concept.
- For video, use direct Groq transcription when supported and within the account limit; otherwise normalize with `ffmpeg-static` + `spawn`, 16 kHz mono MP3, bounded timeout, and guaranteed cleanup.
- Keep citation-click evidence changes within 100 ms; do not promise fixed end-to-end model or transcription latency.
- Limit video, PDF, and PPTX files to 50 MB each; reject oversized PDFs/PPTX in the browser before parsing and enforce upload/body limits at the relevant server boundary.
- Run locally for the demo; deployment remains optional.

### One Technical Unknown Clarified

`AudioContext.decodeAudioData()` does not directly demux arbitrary MP4/WebM/MOV containers. The learner agreed to server-side video processing through `/api/transcribe-video`, using direct provider pass-through when possible and FFmpeg extraction otherwise. The learner also accepted `ffmpeg-static` + `child_process.spawn` instead of the deprecated `fluent-ffmpeg` wrapper. The 60-second FFmpeg timeout is a guard, not a guarantee that every supported video will finish within that time.

### Checks During the Build

- Confirm the selected Groq models and strict JSON Schema support are enabled for the learner’s account, and verify the current provider upload limits/price. The official docs currently list the chosen chat model IDs and schema support; organization/account limits vary.
- Verify the installed `ffmpeg-static` binary includes MP3 encoding (`libmp3lame`) and supports the Windows development machine; fail clearly if the bundled binary is unavailable.
- Test PDF.js worker setup, PPTX relationship/media extraction, and behavior on a real text PDF, an image-only PDF, a text PPTX, and an image-only PPTX.
- Measure the 100 ms citation-panel interaction locally; measure but do not promise model/transcription times.
- Verify that PDFs/PPTX over 50 MB are rejected before parsing, and that video and `/api/sources/index` enforce their server-side size limits.

No product decisions remain open from `prd.md > Open Questions`. Exact deployment hosting is intentionally left optional for `6-ship`.
