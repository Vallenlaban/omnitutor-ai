---
doc: scope
status: approved
---

# OmniTutor AI

OmniTutor AI helps STEM students turn lecture videos, PDFs, and slide decks into source-grounded explanations and quick practice.

## The Unique Kernel
Unlike a generic chatbot, OmniTutor ingests a student's own course materials and ties tutoring to them with exact, clickable citations—video timestamps, PDF pages, and slide numbers—then lets the student check understanding with a quiz.

## Who It's For
An undergraduate STEM student, such as a computer science or engineering student, preparing for a midterm or final. They are overwhelmed by lecture recordings, textbook chapters, and slides, and get stuck on a concept; generic AI answers may not match their professor’s curriculum.

## The Core Loop
The student opens a prepared course module or adds their own lecture video, textbook PDF, or slide deck; OmniTutor transcribes or extracts addressable source text; the student asks about a difficult concept, checks the answer against its cited source material, and takes a short quiz to test understanding.

## Inspiration & Identity
No specific product or aesthetic inspiration established. The experience should feel focused and responsive, and make course-source verification clear.

## Why This Matters to the Learner
The learner wants to understand how to build reliable source-grounded citation pipelines—including prompt design and response parsing—while keeping the app fast, responsive, and robust. Their primary goal is a complete end-to-end working proof of concept.

## What "Working" Looks Like
In a one-minute demo, a student can open a prepared STEM module or add course materials. A video upload is transcribed into timestamped segments; PDF textbook pages and PowerPoint or PDF slide decks are parsed into addressable excerpts. The student asks a conceptual question and sees a bilingual-capable explanation with a rendered formula and exact citation badges that open matching evidence. They answer a three-question multiple-choice quiz generated for that topic and its sources, receive immediate grading and source-grounded feedback, and can switch languages and hear the explanation through an in-browser speaker control. Prepared sample modules remain ready on first open so the demo can show the end-to-end tutoring and quiz flow immediately without requiring an upload.

## The POC Boundary
- A responsive web app with a curated, pre-loaded STEM sample module, topic presets, pasted notes, and direct ingestion of course video, PDF documents, and slide decks.
- Support video files in MP4, WebM, and MOV formats; extract audio in the browser and transcribe it into timestamped segments. Parse textbook/notes PDFs and PDF slide handouts client-side. Parse PowerPoint `.pptx` slide text client-side; use ZIP parsing only to read the internal OpenXML structure of valid `.pptx` files.
- Reject arbitrary `.zip` archives with a clear unsupported-format message. Do not treat a ZIP file as a valid upload just because it can be opened.
- Tutoring grounded in the active prepared or learner-supplied materials, with exact, clickable source citations for timestamped transcript segments, PDF page excerpts, and slides.
- English and Indonesian text responses, rendered STEM formulas, and a three-question multiple-choice practice quiz generated from the queried topic and cited material, with immediate grading and source-grounded feedback tailored to each answer.
- In-browser text-to-speech for explanations in English or Indonesian.
- Prepared sample modules remain available immediately, whether or not a learner uploads files.

## Later
- Real-time quiz branching that changes later question difficulty based on earlier answers.

## Explicitly Cut
- Native mobile apps for iOS or Android.
- Automatic LMS gradebook synchronization.
- Multi-user live audio.
- Arbitrary ZIP archives, which are not supported study materials; `.pptx` is the only ZIP-based format accepted, and its contents are parsed as a slide deck.
