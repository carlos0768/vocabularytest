import Link from 'next/link';
import { splitProfileBio } from '@/lib/profile/bio';

/**
 * プロフィールの自己紹介。改行はそのまま表示し、`@account_id` はその人のプロフィールへリンクする。
 * テキストは React のテキストノードとして描画する(HTML としては解釈しない)。
 */
export function ProfileBio({ bio, className, style }: {
  bio: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!bio) return null;

  return (
    <p
      className={className}
      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', ...style }}
    >
      {splitProfileBio(bio).map((segment, index) =>
        segment.type === 'mention' ? (
          <Link
            key={index}
            href={`/profile/${encodeURIComponent(segment.accountId)}`}
            className="font-bold text-[var(--color-accent)]"
          >
            {segment.text}
          </Link>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
