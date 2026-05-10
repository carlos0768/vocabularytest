/**
 * Remote stats sync (user_activity_logs / user_streak / user_wrong_answers)
 * depends on Supabase migration 013_stats_sync.sql.
 *
 * Stats must be device-independent for authenticated users. Keep an explicit
 * opt-out only for environments where the migration has not been applied yet.
 */
const REMOTE_STATS_SYNC_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REMOTE_STATS_SYNC !== 'false';

export function isRemoteStatsSyncEnabled(): boolean {
  return REMOTE_STATS_SYNC_ENABLED;
}
