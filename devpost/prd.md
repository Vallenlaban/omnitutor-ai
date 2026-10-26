---
doc: prd
status: approved
---

# OmniTutor AI — Product Requirements

OmniTutor AI helps undergraduate STEM students ingest their course materials, get explanations grounded in those materials, and test what they learned.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey

1. The student opens the workspace with the curated “Machine Learning & Optimization Fundamentals” module ready to use, or adds their own video, PDF, PowerPoint slide deck, or notes.
2. OmniTutor validates each file and shows its processing progress. The student can continue using the sample module and existing chat while files are processing.
3. Once a file is processed, its extracted content and size are shown. The student can inspect the source and include it in or exclude it from the active source set.
4. The student asks a question, optionally narrowing it to selected sources or topics. The tutor answers in the current language and embeds citations that open exact evidence.
5. The student starts a three-question quiz grounded in the selected topic and sources, receives immediate cited feedback, and sees a final score and short readiness summary.
6. They return to chat or retake the same quiz; they can also add, remove, or reset sources as their study session changes.

This develops `scope.md > The Core Loop` and demonstrates the path in `scope.md > What "Working" Looks Like`.

## Screens and Layout

The product is one responsive study workspace with coordinated panels.

- **Header:** OmniTutor AI logo and title, “Multimodal Grounded Study Companion” tagline, English/Indonesian toggle, and knowledge-base status.
- **Knowledge Base/source drawer:** Curated sample, uploaded-source cards, upload tiles for supported formats, source selection/filter chips, per-source remove controls, and “Reset to Curated Sample” / “Clear All.”
- **Tutor and practice area:** Conversation, suggested prompt chips, question input, material/topic filters, and a “Start Practice Quiz” action.
- **Evidence Panel:** Beside the chat on wider screens; displays the specific source excerpt selected by a citation. On phones it opens as a bottom sheet while preserving chat position.
- **Quiz:** One question at a time, with four large answer choices, progress indicator, feedback, and a simple completion state.
- **Upload progress:** Processing source cards show the current step and can coexist with the sample and chat; they do not block the rest of the workspace.

## Look and Feel

- A clean, focused academic workspace inspired by Notion and Linear, with Clean Slate background (`#F8FAFC`) and Indigo/Violet active accents (`#4F46E5`).
- Readable sans-serif typography, clear bilingual text, and crisp STEM formula rendering.
- Structured cards, soft borders, 12–16px rounded corners, and clear active tabs.
- High-contrast citation colors: Ruby/Red for video, Emerald/Teal for PDF pages, Amber/Orange for slides, and a distinct Notes badge. Highlight the selected evidence briefly.
- Keep messages about unsupported formats and processing failures inline and actionable.

## Features and Behavior

### Study Workspace and Source Ingestion

Implements `scope.md > The POC Boundary`.

- The curated “Machine Learning & Optimization Fundamentals” sample and topic presets are available immediately, even while uploads are processing.
- The student can add multiple files through dedicated tiles/dropzones:
  - Videos: `.mp4`, `.webm`, `.mov`.
  - Textbooks/handouts and PDF slide decks: `.pdf`.
  - PowerPoint presentations: `.pptx`.
  - Notes/syllabi: pasted text.
- Arbitrary `.zip` archives and other unsupported formats are rejected immediately with a clear inline message: “Unsupported format: Please upload a PDF, PowerPoint (.pptx), or video file (.mp4/.webm/.mov).”
- Each accepted file appears as an independent source card with filename, format, file size, and processing status.
- Processing progress is visible by step:
  - Video: extracting audio → transcribing speech with timestamps → indexing lecture segments.
  - PDF: reading pages → extracting text and formulas → indexed, with page count.
  - PPTX: reading slide deck → extracting slide content → indexed, with slide count.
- Processing is non-blocking: students can use the prepared sample or existing chat while new sources process.
- On success, a green Ready indicator and an extracted-volume summary appear. An “Inspect Source” / “View Index” action previews timestamped segments, PDF page excerpts, or slide text.
- New sources are appended to the active knowledge base by default. Source cards can be removed individually; “Reset to Curated Sample” / “Clear All” returns the workspace to a clean sample state.
- Sources with no extractable text are retained for visual inspection, but automatically excluded from AI grounding. Their source card displays `⚠️ Visual Only (No Searchable Text)`:
  - Silent/no-speech video: “Whisper found no speech or audio track in this video. The video is ready to watch, but cannot generate citations or quizzes.”
  - Scanned/image-only PDF: “No selectable text was found on these PDF pages. The document viewer is ready, but text-based tutoring requires OCR/searchable text.”
  - Image-only PPTX: “These slides consist only of embedded images without text objects or notes.”
- The warning panel offers attaching `.vtt`, `.srt`, or `.txt` transcript/subtitle for video; pasting an accompanying summary/notes bound to the source; re-exporting with searchable text or running OCR for image-only documents; or keeping the source as a visual reference.
- Unreadable/corrupt files show a clear error with Retry and Remove actions.

**Acceptance criteria**

- The named video, PDF, PPTX, and pasted-note formats are accepted; arbitrary `.zip` and unsupported files show the unsupported-format message and are not added.
- While a file is processing, its filename and current step are visible, and the student can continue using the sample module/chat.
- A successfully processed file shows Ready, the appropriate count or duration, and an index preview action.
- Empty-extraction sources remain viewable, show their specific warning, and cannot be selected for AI grounding.
- New sources append by default; an individual source can be removed, and the workspace can be reset to the curated sample.

### Source Selection and Grounded Tutoring

Implements `scope.md > The Unique Kernel` and `scope.md > The POC Boundary`.

- All active, searchable sources are selected by default. Source chips above chat and in quiz setup let the student narrow the set; an optional topic selector further narrows it.
- The student can type a question or choose a suggested prompt, such as “Explain how the learning rate affects Gradient Descent with formulas.”
- The tutor answers in the active English or Indonesian language, provides an accessible conceptual explanation, renders STEM formulas, and offers a brief Socratic follow-up.
- Citations are attached to claims and include source identity plus location:
  - Video: `[🎥 Lecture 1 • 12:40]`
  - PDF: `[📄 Textbook • Hal. 45]`
  - Slide: `[📊 Slide Deck • Slide 8]`
  - Notes: `[📝 Notes • Sec. 2]`
- Clicking a citation opens evidence only from the identified source. The card shows the title, exact timestamp/page/slide/section, and highlighted excerpt. Video evidence also queues its local clip at the timestamp when available.
- On desktop, evidence is shown beside the chat. On mobile, it opens in a bottom sheet and closing it restores the prior chat position.
- The already-indexed evidence card and highlight update within 100 ms of a citation click. This does not measure AI response generation or network-dependent media playback.
- If active sources do not support the question, the tutor says so and never invents citations. It offers to add relevant material and displays two or three questions supported by active sources. Optional general context must be visually labeled “General Knowledge (Not Verified Against Your Course Syllabus).”

**Acceptance criteria**

- A student can include/exclude individual searchable sources and topics before tutoring or quiz generation; excluded and visual-only sources are not used.
- Each rendered citation identifies a real active source and opens its matching excerpt/location.
- Unsupported questions display no phantom citation badges and offer in-scope recovery.
- Opening a known evidence citation updates its card/highlight within 100 ms without losing chat position.

### Practice Quiz

Implements `scope.md > The POC Boundary`.

- The student starts a quiz below a tutor response or in the Practice panel. The quiz uses the selected topic and active source filters; new indexed sources are eligible by default.
- The quiz contains three multiple-choice questions, one at a time, with four options (A–D), a “Question N of 3” indicator, and rendered formulas where relevant.
- After answer submission, correct and incorrect options are highlighted distinctly. The student sees immediate feedback grounded in the active sources and a citation action to inspect evidence.
- “Next Question” advances through the quiz. At completion, a simple score (for example, “Score: 2/3 correct”), one-sentence readiness summary, and “Return to Chat” / “Retake Quiz” actions appear.
- “Adaptive” for this proof of concept means questions target the selected topic/materials and feedback responds to the student’s answer. Dynamic difficulty branching is deferred.

**Acceptance criteria**

- The quiz contains exactly three questions, each with four options, grounded only in selected active searchable sources.
- Submitting an answer reveals correctness and source-grounded feedback with a working evidence citation.
- Completion shows the numerical score, short readiness summary, and return/retake actions.

### Language and Spoken Explanations

Implements `scope.md > The POC Boundary`.

- The English/Indonesian toggle immediately changes static interface text without reloading.
- Existing tutor answers remain in their original language; source excerpts keep their original text. New tutor answers, follow-ups, and quiz questions use the selected language.
- The language choice persists across topic/source changes, quiz activity, and browser reloads.
- A speaker control reads tutor explanations aloud using the selected language; if a regional voice is unavailable, use a generic voice for that language or the system default.
- If speech synthesis is unsupported or no usable voice is available, the control is visibly muted/disabled and provides a non-blocking explanation. Interrupted playback returns the control to idle without blocking other interactions.

**Acceptance criteria**

- Language changes update interface labels immediately and are used for new generated content, without rewriting existing responses or sources.
- Speech plays when available; when unavailable, the student can still use text, formulas, citations, and quizzes.

## States and Boundaries

- **First use:** The curated sample is ready even before any upload.
- **Upload processing:** Source card shows progress without blocking chat/sample use.
- **Unsupported upload:** Inline format error; file is not added.
- **Unreadable upload:** Source card explains the issue and offers Retry or Remove.
- **No searchable text:** Source remains available for visual review, is excluded from grounding, and offers relevant recovery options.
- **Tutor failure:** Keep the submitted question visible or restore it to input; show “Unable to generate a source-grounded response. Please check your connection.” Retry repeats the same query; Cancel permits editing.
- **Quiz generation failure:** Inline Practice-panel message says “Could not generate quiz questions from the active sources.” Retry without leaving the view.
- **Quiz answer failure:** Preserve the selected answer and provide Retry Submission.
- **Speech unavailable/interrupted:** Text remains fully usable; unavailable speech is explained, and playback state resets.
- **Session lifetime:** Chat and citation history persist for the open session, including source changes; reload or closing the tab starts clean. Language preference persists.

## Product Decisions

- Uploaded sources append to the active collection by default to support cross-referencing among a lecture, textbook, and slides.
- All searchable sources are selected by default, with source and topic filters for focused tutoring/quizzes.
- Visual-only sources remain viewable but are excluded from AI grounding to prevent unsupported claims.
- Prepared sample content remains ready as an immediate demo fallback while uploads process.
- “Adaptive” quiz behavior means topic-grounded questions and answer-specific feedback; dynamic question difficulty is deferred.
- Chat and old citations remain available within the open session; learner can remove sources or reset to the curated sample.

## What We're Building

- A responsive bilingual study workspace with a curated STEM module, source drawer, and topic/source filtering.
- Client-facing ingestion of MP4/WebM/MOV video, PDF, PPTX, and pasted notes, with visible progress, indexed previews, supported-format validation, and recovery states.
- Grounded tutor responses with formulas, source-identified clickable citations, exact evidence cards, and unsupported-question handling.
- A three-question source-grounded quiz with immediate cited feedback, score, and simple return/retake actions.
- In-browser speech playback with graceful fallback.

## Deferred From the POC

- Dynamic quiz difficulty branching, advanced mastery analytics, badges, XP, streaks, and automated multi-step remediation.
- Native iOS/Android apps, LMS gradebook synchronization, and multi-user live audio.
- Arbitrary ZIP archives; ZIP parsing is permitted only internally to interpret valid `.pptx` presentations.

## Possible Later Enhancements

Dynamic adaptive difficulty and richer remediation can follow the core grounded quiz. OCR workflows and broader media types can be considered later; image-only sources in this POC remain visual references with the stated recovery guidance.

## Non-Goals

- The app will not use a source with no searchable text to generate citations or quiz questions.
- The app will not accept arbitrary ZIP archives.
- The app will not include native mobile apps, automatic LMS gradebook sync, or multi-user live audio.
- The app will not require speech support for core learning.

## Open Questions

None blocking product review. The exact technical upload limits, browser support, and transcription constraints belong in `4-spec`.
