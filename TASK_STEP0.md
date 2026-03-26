# Step 0: Fix bug - Adding to existing vocab notebook creates a new one

## Branch
Already on `wip/bookshelf-removal-vocab-ui`. Do NOT create a new branch.

## Bug
When a user tries to add scanned words to an existing vocabulary notebook, a new notebook is created instead.

## Key Files
1. `src/app/page.tsx` — Home page. `handleScanButtonClick`, `handleImageSelect`, `isAddingToExisting` state (~line 984)
2. `src/app/project/[id]/page.tsx` — Project page. Sets `scanvocab_existing_project_id` in sessionStorage (~line 261)
3. `src/app/scan/page.tsx` — Scan page. Conditionally sets `scanvocab_existing_project_id` (~line 439)
4. `src/app/scan/confirm/page.tsx` — Confirm page. Reads `scanvocab_existing_project_id` to determine `isAddingToExisting`
5. `src/lib/db/hybrid-repository.ts` — `createProject` and `createWords`

## Flow
"Add to existing" relies on `scanvocab_existing_project_id` in sessionStorage through scan→confirm pipeline.

## What to Do
1. Trace ALL code paths for adding words to existing project
2. Find where `scanvocab_existing_project_id` is set, read, cleared
3. Identify the exact bug
4. Fix with minimal changes
5. Commit on current branch

## Rules
- Do NOT push
- Do NOT modify unrelated files
- Do NOT add npm packages
- Minimal focused changes only
