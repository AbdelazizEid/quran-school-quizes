# Conversational AI Quiz Drafts

Teachers create Questions through a private, resumable AI Quiz Draft chat rather than publishing AI output directly. The Teacher converses with the assistant in a single chat thread: requests Questions, requests changes in natural language, and saves explicitly by confirming in chat. Questions render as read-only cards inside the thread; every change request applies directly to the draft. A Quiz is created only when the Teacher explicitly confirms the save in chat, and source files plus the conversation are temporary, while compact Source Evidence remains on saved Questions.

## Considered Options

- One-shot generation with automatic Quiz creation was rejected because AI output requires Teacher verification.
- A general AI tutor was rejected for v1 because the conversation is specifically for building and editing a Quiz.
- Permanent source-file retention was rejected because source material is only needed during drafting.
- The earlier two-panel layout (conversation beside a live editable draft with revision preview and apply/discard) was replaced by a single chat column with read-only question cards: Teachers edit through chat, the thread is the change record, and the explicit save confirmation remains the only approval gate.

## Chat Save Confirmation

- The provider response contract includes `confirm_save`: the assistant may return it only when the Teacher explicitly asks to save the draft as a Quiz and the current draft contains complete Questions.
- On `confirm_save` the client calls the existing save route, whose server-side validation remains the final gate. The conversation is deleted on save, so the saved-Quiz confirmation message with the link to `/quizzes/{id}` is client-local.
- Ambiguous or premature save requests produce a clarification; nothing is saved without explicit confirmation.
- AI Revisions apply directly to the draft questions when proposed; the chat thread history preserves what changed. No revision is ever published as a Quiz without the explicit save confirmation.
