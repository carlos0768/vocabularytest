import type { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getFriendSchemaIssue } from '@/lib/friends/server';
import { normalizeProfileBio } from '@/lib/profile/bio';
import { parseStoredCertifications, type ProfileCertification } from '@/lib/profile/certifications';

type Admin = ReturnType<typeof getSupabaseAdmin>;

/**
 * プロフィールの「後から足した項目」(自己紹介 `bio` / 資格 `certifications`)。
 *
 * これらの列はプロフィール本体の取得とは別のクエリで読み書きする ——
 * migration より先にコードがデプロイされても、名前・アイコンの取得まで
 * 巻き込んで落とさないため(列が無ければ「未設定」として扱う)。
 * 列ごとにも別クエリにしているので、片方だけ適用されたDBでももう片方は動く。
 */
export type ProfileExtras = {
  bio: string | null;
  certifications: ProfileCertification[];
};

const EXTRA_COLUMNS = {
  bio: 'profiles_bio',
  certifications: 'profiles_certifications',
} as const;

async function fetchColumn<K extends keyof typeof EXTRA_COLUMNS>(
  admin: Admin,
  userId: string,
  column: K,
): Promise<unknown> {
  const { data, error } = await admin
    .from('profiles')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle<Record<K, unknown>>();

  if (error) {
    if (getFriendSchemaIssue(error) === EXTRA_COLUMNS[column]) return null;
    throw new Error(error.message || `profile_${column}_lookup_failed`);
  }
  return data?.[column] ?? null;
}

export async function fetchProfileExtras(admin: Admin, userId: string): Promise<ProfileExtras> {
  const [bio, certifications] = await Promise.all([
    fetchColumn(admin, userId, 'bio'),
    fetchColumn(admin, userId, 'certifications'),
  ]);
  return {
    bio: normalizeProfileBio(typeof bio === 'string' ? bio : null),
    certifications: parseStoredCertifications(certifications),
  };
}

export type SaveProfileExtrasResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'failed'; field: keyof ProfileExtras };

/**
 * 指定された項目だけを保存する(プロフィール行は呼び出し側で作成済みであること)。
 * 列ごとに別の update にして、未適用の列があればその項目だけ unavailable を返す。
 */
export async function saveProfileExtras(
  admin: Admin,
  userId: string,
  patch: { bio?: string | null; certifications?: ProfileCertification[] },
): Promise<SaveProfileExtrasResult> {
  for (const field of ['bio', 'certifications'] as const) {
    if (patch[field] === undefined) continue;
    const value = field === 'certifications'
      // 空配列は「未登録」として NULL に戻す
      ? (patch.certifications && patch.certifications.length > 0 ? patch.certifications : null)
      : patch.bio;

    const { error } = await admin
      .from('profiles')
      .update({ [field]: value })
      .eq('user_id', userId)
      .select(field)
      .maybeSingle();

    if (error) {
      if (getFriendSchemaIssue(error) === EXTRA_COLUMNS[field]) {
        return { ok: false, reason: 'unavailable', field };
      }
      console.error(`Failed to update profile ${field}:`, error);
      return { ok: false, reason: 'failed', field };
    }
  }
  return { ok: true };
}
