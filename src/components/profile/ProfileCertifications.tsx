import { Icon } from '@/components/ui/Icon';
import {
  certificationKey,
  formatCertification,
  type ProfileCertification,
} from '@/lib/profile/certifications';

/** プロフィールに並べる資格バッジ(例: 「英検 準1級」「TOEIC L&R 850」)。 */
export function ProfileCertifications({ certifications, className, style }: {
  certifications: ProfileCertification[] | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (!certifications || certifications.length === 0) return null;

  return (
    <ul
      aria-label="資格"
      className={className}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6, listStyle: 'none', padding: 0, ...style }}
    >
      {certifications.map((cert) => {
        const { label, detail } = formatCertification(cert);
        return (
          <li
            key={certificationKey(cert)}
            className="inline-flex items-center gap-1 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-[3px] text-[var(--solid-ink)]"
          >
            <Icon name="workspace_premium" size={13} className="text-[var(--color-accent)]" />
            <span className="font-mono text-[10px] font-bold tracking-[0.03em] text-[var(--color-muted)]">{label}</span>
            <span className="font-display text-[12px] font-extrabold">{detail}</span>
          </li>
        );
      })}
    </ul>
  );
}
