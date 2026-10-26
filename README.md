# OmniTutor AI

A study companion that helps undergraduate STEM students learn from their own lecture videos, PDFs, PowerPoint slides, and notes—with explanations linked to course-material evidence.

> **Project status:** Proof of concept in progress.

## The Problem

Students often have to study from disconnected lecture recordings, textbooks, and slide decks. Generic AI answers may not match the materials used in their course, and can be difficult to verify.

## The Project

OmniTutor AI is designed to bring those materials into one study workspace. Students can ask questions about searchable course content, open the cited evidence, and test their understanding with a short practice quiz.

## Planned POC Features

- Add MP4, WebM, and MOV videos; PDF documents; PowerPoint (`.pptx`) slides; and pasted notes.
- Transcribe video into timestamped text and extract searchable text from PDFs and slides.
- Ask questions in English or Indonesian and receive explanations grounded in selected materials.
- Open citations to the matching video timestamp, PDF page, slide, or notes section.
- Generate a three-question multiple-choice quiz with answer-specific feedback.
- Render STEM formulas and provide browser-based speech playback when supported.

The POC does not include OCR for image-only documents or quizzes that dynamically change difficulty based on earlier answers.

## Source-Grounded Answers

OmniTutor is designed to check that each citation refers to a registered source segment and an exact quoted passage before displaying its source location. This helps students inspect the evidence behind an answer; it does not guarantee that every generated explanation is factually correct.

## Project Plan

The public repository includes the planning documents required for the Build With AI: Basics hackathon:

- [Project scope](./devpost/scope.md)
- [Product requirements](./devpost/prd.md)
- [Technical specification](./devpost/spec.md)

## Demo

Demo video: **[https://youtu.be/mUdQSNlBG5w?si=NAv3W22M75RxdK53]**

## Running Locally

Requires Node.js `^20.19.0` or `>=22.12.0`.

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Copy `.env.example` to `.env` and replace the placeholder with your Groq API key. The `.env` file is ignored by Git; never commit a real API key.
   ```powershell
   Copy-Item .env.example .env
   ```
3. Start the development server:
   ```powershell
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).

To run the production build locally, use `npm run build` followed by `npm start`.

## Built With

cloudrun, css3, edtech, google-cloud, groq, html5, javascript, katex, node.js, pdf.js, restapi, vite, whisper, aistudio

## 5. AI Tools Disclosure

- **Google AI Studio / Build Assistant:** Used for project scaffolding, directory structuring, CSS design assistance, and API proxy routing configuration.
- **Groq Cloud API:** Integrated at runtime to power multimodal document analysis, Socratic tutor responses, and adaptive quiz generation.

All system architecture, prompt engineering, integration logic, and testing were directed and verified by the team.

## What I Learned

**Replace this with your own reflection** about building the project—for example, what you learned about checking source citations or testing AI-generated responses.