# Projects/Home Load Manual Check

## Purpose
Verify that Home and Projects pages render quickly from local cache before remote updates complete.

## Preconditions
- A Pro user exists with local IndexedDB data (`projects` and `words`) already synced.
- Browser DevTools is available.

## Steps
1. Open DevTools Network tab and enable `Preserve log`.
2. Throttle network to `Fast 3G` (or slower) to amplify remote delays.
3. Reload `/projects`.
4. Confirm project cards appear quickly without waiting for all remote word requests.
5. Open `/` (Home) and confirm the first project data appears quickly.
6. Open a project detail page (`/project/{id}`) and confirm words appear quickly from local data.
7. Wait a few seconds and confirm remote data can still overwrite/update content if newer.

## Expected
- No project-by-project N+1 `words` fetch storm on initial `/projects` render.
- Visible UI appears from local data before remote sync finishes.
- Detail page does not block on remote call when local data exists.
