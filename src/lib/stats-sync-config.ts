/**
 * Remote stats sync (user_streak / user_wrong_answers / get_daily_stats_range)
 * depends on Supabase migration 013_stats_sync.sql.
 *
 * Keep this opt-in so environments without the migration do not issue 404 calls.
 */
const REMOTE_STATS_SYNC_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REMOTE_STATS_SYNC === 'true';

export function isRemoteStatsSyncEnabled(): boolean {
  return REMOTE_STATS_SYNC_ENABLED;
}
