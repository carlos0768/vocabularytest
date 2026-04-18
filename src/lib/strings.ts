// UI string constants for the user-facing "ノート" concept.
//
// The underlying DB table and TypeScript types are still named `projects`
// to avoid a high-risk migration. We only swap the *label* — users always
// read 「ノート」 in the UI, but the code keeps its existing terminology.
//
// Not used for: AI prompts (model behaviour), landing page / marketing
// copy (product positioning), API error strings (client compatibility),
// or legal documents (privacy policy wording).

export const NOTE_LABEL = 'ノート';
export const NOTES_LABEL = 'ノート';
