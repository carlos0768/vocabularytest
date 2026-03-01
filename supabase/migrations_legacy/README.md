# Legacy migrations (not executed by Supabase CLI)

These files were moved out of `supabase/migrations` because they reuse
already-claimed migration versions (`002`, `003`, `004`) and cause
`supabase db push` to fail with:

- "Found local migration files to be inserted before the last migration on remote database."

Keep them only as historical references. Do not move them back into
`supabase/migrations` unless you also rename them to unique versions and
repair migration history accordingly.

`002_harden_subscriptions_and_webhooks.sql` is canonicalized as
`supabase/migrations/019_harden_subscriptions_and_webhooks.sql`.
