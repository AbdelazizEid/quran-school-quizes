# AI Quiz Draft Conversation

## Problem Statement

Teachers currently need to create every Question in a Quiz manually. Preparing a useful Arabic Quiz from curriculum documents is slow, and a one-shot AI generator would create unacceptable risk because Quranic content requires Teacher verification. The Teacher needs a conversational workspace that can use an instruction and temporary source material while keeping the Teacher in control of the final Quiz.

## Solution

Add a private, resumable AI Quiz Draft Conversation to the Teacher Dashboard. A Teacher can provide one or more documents, pasted text, and an instruction; choose how the AI uses sources; receive an Arabic-only draft; request targeted revisions; edit Questions directly; inspect Source Evidence; and explicitly save the approved draft as a normal Quiz.

The AI is a drafting assistant, not the publisher of a Quiz. The application owns the conversation and draft state. GLM is only the server-side model provider.

## User Stories

1. As a Teacher, I want to start a private AI Quiz Draft Conversation, so that I can prepare a Quiz without exposing unfinished work to other Teachers.
2. As a Teacher, I want to resume an unfinished conversation, so that leaving the page does not lose my work.
3. As a Teacher, I want to upload one or more PDF documents, so that the AI can use my curriculum material when I choose that Source Policy.
4. As a Teacher, I want to upload DOCX documents, so that common school documents can be used as source material.
5. As a Teacher, I want to provide TXT or Markdown source material, so that simple text does not require a document editor.
6. As a Teacher, I want to paste source text directly, so that I can use a short excerpt without creating a file.
7. As a Teacher, I want to add multiple sources to one conversation, so that a Quiz can cover related curriculum material.
8. As a Teacher, I want to remove a source from a conversation, so that the next generation does not use material I no longer want included.
9. As a Teacher, I want to choose General knowledge only, Uploaded sources only, or Uploaded sources plus general knowledge, so that I control what the AI is allowed to use.
10. As a Teacher, I want General knowledge only to be the default, so that a prompt-only request works without requiring a document.
11. As a Teacher, I want the active Source Policy to be visible, so that I know whether a Question came from a source or general knowledge.
12. As a Teacher, I want to provide an instruction in natural language, so that I can describe the topic and desired learning outcome without completing a long form.
13. As a Teacher, I want to set the number of Questions, so that the draft fits my class session.
14. As a Teacher, I want to set difficulty and Student level in the instruction or controls, so that the Questions match my learners.
15. As a Teacher, I want MCQ and TRUE_FALSE Questions by default, so that the generated Quiz works for both Tracks.
16. As a Teacher, I want to request INPUT Questions when needed, so that I can create richer Practice material.
17. As a Teacher, I want INPUT Questions clearly marked Practice-only, so that I do not accidentally use them in a Competition.
18. As a Teacher, I want the AI to ask a concise clarifying Question when the request is underspecified, so that it does not guess the intended scope.
19. As a Teacher, I want the AI to return a structured draft of Questions, so that I can review the actual Quiz content rather than a prose description.
20. As a Teacher, I want every generated Question to be in Arabic, so that the Quiz matches the product language and school audience.
21. As a Teacher, I want each source-based Question to show its supporting excerpt and reference, so that I can verify Quranic content quickly.
22. As a Teacher, I want general-knowledge Questions labeled as supplemental, so that I can distinguish them from Questions grounded in my materials.
23. As a Teacher, I want the AI to say when the available material does not support a request, so that it does not invent a citation or pretend unsupported content is sourced.
24. As a Teacher, I want to request a targeted change in natural language, so that I can revise several Questions without editing each field manually.
25. As a Teacher, I want an AI Revision preview before it changes the draft, so that I can reject an unwanted change.
26. As a Teacher, I want unchanged Questions preserved during a targeted revision, so that a small request does not destroy good content.
27. As a Teacher, I want to generate a new set intentionally, so that full replacement remains possible without being the default revision behavior.
28. As a Teacher, I want to edit Question text, options, correct answers, kinds, and order directly, so that I can make final corrections quickly.
29. As a Teacher, I want my direct edits treated as authoritative, so that a later AI Revision does not silently undo them.
30. As a Teacher, I want to discard a proposed AI Revision, so that the current draft remains unchanged.
31. As a Teacher, I want to save the reviewed draft as a Quiz explicitly, so that AI output is never published without my approval.
32. As a Teacher, I want the saved Quiz to retain compact Source Evidence, so that I can verify Questions later even though the original source file is temporary.
33. As a Teacher, I want source files deleted when I save or discard the draft, so that curriculum files are not retained unnecessarily.
34. As a Teacher, I want the conversation deleted when I save or discard the draft, so that temporary drafting material does not become a permanent archive.
35. As a Teacher, I want later AI changes to start a new conversation from the saved Quiz, so that the saved Quiz remains the durable content record.
36. As a Teacher, I want clear progress and failure states while the AI is working, so that I know whether I should wait, retry, or change the request.
37. As a Teacher, I want the AI service to enforce usage limits fairly, so that another Teacher cannot consume the school’s whole allowance.
38. As a Student, I want to see only the final Quiz content, so that Source Evidence and drafting conversation details do not appear during answering.
39. As a Teacher, I want the existing Quiz launch and Practice flows to continue working after saving, so that AI-created content behaves like manually created content.
40. As a Teacher, I want Quiz Copies to retain useful Source Evidence while remaining detached, so that copied content remains verifiable without sharing the original conversation.

## Implementation Decisions

- The highest seam is one server-side AI Quiz Draft Conversation service. It owns draft state, source policy, conversation turns, AI Revisions, direct-edit application, cleanup, and final-save preparation.
- Authenticated Next route handlers provide the Teacher boundary and delegate to that service. Every read and write is scoped to the current Teacher, following the existing ownership pattern.
- A provider adapter hides GLM’s model-specific endpoint and response format. The application does not expose provider credentials or model selection to the browser.
- The application owns conversation state. GLM is a stateless model provider for this feature, not the source of truth for drafts or messages.
- One GLM model is selected after an Arabic/Quran evaluation and configured through the server environment. The model must be replaceable without changing the Teacher UI.
- The API key is server-only. Extracted source text and Teacher instructions may be sent to the configured provider; original source files stay on the school VPS until draft cleanup.
- Source Policy has exactly three choices: General knowledge only (default), Uploaded sources only, and Uploaded sources plus general knowledge.
- Generated content is Arabic-only, regardless of the language of the interface input or source document.
- The initial generation controls default to 10 Questions, medium difficulty, and `MCQ` plus `TRUE_FALSE`. The allowed Question count is 1–30. `INPUT` is opt-in and Practice-only.
- The AI may ask a clarifying Question only when required to avoid guessing scope. Otherwise it returns a complete structured draft rather than partial streamed Questions.
- The AI response must distinguish clarification, initial draft, targeted AI Revision, unsupported request, and provider failure. The UI must not treat prose that lacks a valid structured draft as saved Quiz content.
- Each AI Revision is proposed against the current draft, identifies the requested changes, and requires explicit application. A revision does not silently replace the current draft.
- Direct Teacher edits are applied to the current draft and become authoritative. A later AI Revision must use the current draft as input and preserve unrelated direct edits.
- The draft model must represent title, description, ordered Questions, Question kinds, options, correct answers, time limits, and compact Source Evidence or supplemental status.
- Source Evidence includes a supporting excerpt and document page or section when available. It is visible to Teachers and excluded from Student-facing Quiz responses.
- Saved Questions retain compact Source Evidence but not the original source file. Source files and the conversation are deleted when the Teacher saves or discards the draft.
- A saved Quiz is created only through an explicit Teacher action. The existing Quiz ownership, launch, Practice, Competition, and Quiz Copy rules remain authoritative after save.
- Server-side validation is mandatory before saving. The AI output is untrusted and cannot bypass existing Question constraints: MCQ has at most four options and exactly one correct option, TRUE_FALSE uses the existing two options, and INPUT has no options and cannot be used in a Competition.
- Drafts, source metadata, and conversations are private to the creating Teacher. Other Teachers cannot access them before save.
- The service applies per-Teacher rate limits, maximum document and extracted-text sizes, a maximum of 30 Questions per generation, a limit on concurrent generations, and a cross-source cap on total source text sent to the provider. Defaults: 30 generations per hour, 2 concurrent generations per Teacher, 5 MB per file, 60,000 extracted characters per source, 120,000 total source characters; all configurable through server environment variables, and limit responses explain in Arabic whether the Teacher should wait, retry, reduce the request, or change the Source Policy.
- The desktop UI uses a conversation panel beside a live editable draft preview. Mobile uses Conversation and Draft tabs. Actions are Apply Revision, Discard Revision, direct edit, and Save as Quiz.
- PDF, DOCX, TXT, and Markdown are supported in v1. Scanned PDFs and images are out of scope until OCR is deliberately added.
- Document extraction should use the smallest compatible set of existing or standard dependencies. Large source material must be bounded or reduced to relevant extracted text before a provider request.
- The service should use a structured response contract validated at the server boundary. The contract must support a clarification response without Questions and a draft/revision response with complete valid Question data.

## Testing Decisions

- Tests must exercise externally visible behavior through route handlers and the Teacher-facing UI; they should not assert private helper structure or provider SDK internals.
- Add route-level tests for draft ownership, Source Policy handling, source add/remove, clarification responses, initial generation, targeted revisions, direct edits, apply/discard, save, and cleanup.
- Add validation tests proving malformed AI output cannot save a Quiz: missing title, empty Question text, invalid kinds, too many options, zero or multiple MCQ correct answers, and INPUT options.
- Add provider-boundary tests with a deterministic fake provider so normal tests do not spend GLM allowance or depend on network availability.
- Add tests that verify the server sends extracted text and instructions only when the selected Source Policy allows it, and never sends the original file object to the provider adapter.
- Add tests for general-knowledge labeling, source evidence retention, missing-source handling, and unsupported requests.
- Add tests for source-file and conversation deletion on save and discard, including failure handling that does not leave a saved Quiz without its expected final state.
- Add tests proving a Teacher cannot read or mutate another Teacher’s draft, source metadata, or conversation.
- Add tests proving `INPUT` Questions are flagged as Practice-only and cannot be launched in a Competition.
- Add Playwright coverage for the main Teacher flow: start conversation, add source or prompt, choose Source Policy, generate, apply a targeted revision, directly edit, and Save as Quiz.
- Extend existing Quiz CRUD and launch coverage to prove an AI-created Quiz behaves like a manually created Quiz in Practice and Competition flows.
- Use representative Arabic/Quran fixtures for structured-output tests, including source excerpts, page references, and unsupported requests.
- Before selecting the production model, run a small evaluation outside the normal test suite against representative Arabic/Quran prompts and inspect Question accuracy, source grounding, and structured-output reliability.

## Out of Scope

- Automatic publication or automatic approval of AI output.
- A general AI tutor or open-ended source-material chat.
- Student access to the AI Quiz Draft Conversation.
- Teacher-selectable models or provider configuration in the UI.
- Permanent retention of original source files or full conversation history after save or discard.
- OCR for scanned PDFs, images, handwriting, or audio/video source material.
- Automatic grading of INPUT answers; the existing Teacher review behavior remains unchanged.
- AI-generated explanations shown to Students during a Quiz.
- Multi-model voting, automatic fact-checking by a second model, or ensemble generation.
- Billing, subscription management, or a per-Teacher GLM account.
- Streaming partial Questions into the draft preview.

## Further Notes

- GLM exposes different API endpoint formats depending on the selected model. The provider adapter must be chosen after the Arabic/Quran model evaluation rather than assuming one universal endpoint.
- General knowledge only is intentionally the default. The active Source Policy and supplemental labels must be prominent because this is less restrictive than source-only generation.
- Source Evidence remains after the original file is deleted, so it is provenance for review rather than a guarantee that the original document can be reopened.
- The existing Quiz API currently accepts Question data without complete semantic validation. The new save boundary must close that gap for AI-created content and should be reusable by manual Quiz creation where practical.
- The first implementation slice should establish the provider contract and draft state seam with a fake provider before adding document extraction or polishing the full interface.
