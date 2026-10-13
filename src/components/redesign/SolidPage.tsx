import Link from 'next/link';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/* ---------- Solid primitives (Tailwind thick-border flavor) ---------- */
const SOLID_INTERACTIVE =
  'transition-all duration-100 active:translate-x-px active:translate-y-px';
const SOLID_BTN_BASE =
  'rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)]';
type SolidButtonBase = {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'inverse' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  iconLeft?: string;
  iconRight?: string;
  /** Provided for legacy compatibility — extra classes applied to the inner content span. */
  faceClassName?: string;
};

type SolidButtonAsButton = SolidButtonBase &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    href?: undefined;
  };

type SolidButtonAsLink = SolidButtonBase &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className' | 'href'> & {
    href: string;
  };

type SolidButtonProps = SolidButtonAsButton | SolidButtonAsLink;

/**
 * Solid button — hard-shadow CTA. Renders either a <button> or a <Link>
 * depending on whether `href` is provided. Uses Tailwind shadow utility,
 * not a plate DOM element.
 */
export const SolidButton = forwardRef<HTMLElement, SolidButtonProps>(function SolidButton(
  {
    children,
    className,
    faceClassName,
    variant = 'default',
    size = 'md',
    iconLeft,
    iconRight,
    ...rest
  },
  ref,
) {
  const wrapperClass = cn(
    'inline-flex items-center justify-center gap-2 font-display font-bold whitespace-nowrap',
    SOLID_BTN_BASE,
    SOLID_INTERACTIVE,
    'disabled:opacity-50 disabled:pointer-events-none',
    size === 'sm' && 'px-3 py-2 text-[13px]',
    size === 'md' && 'px-5 py-3 text-[15px]',
    size === 'lg' && 'px-7 py-4 text-base',
    variant === 'default' && 'bg-[var(--color-surface)] text-[var(--solid-ink)]',
    // 同上。ダークで「白背景に白文字」になるのを防ぐ。
    variant === 'inverse' && 'bg-[var(--solid-ink)] text-[var(--color-surface)]',
    variant === 'accent' && 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-[var(--color-accent-ink)]',
    className,
    faceClassName,
  );

  const inner = (
    <>
      {iconLeft && <Icon name={iconLeft} size={18} />}
      <span className="min-w-0 truncate">{children}</span>
      {iconRight && <Icon name={iconRight} size={18} />}
    </>
  );

  if ('href' in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest as SolidButtonAsLink;
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={wrapperClass}
        {...anchorRest}
      >
        {inner}
      </Link>
    );
  }

  const { type, ...buttonRest } = rest as SolidButtonAsButton;
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={type ?? 'button'}
      className={wrapperClass}
      {...buttonRest}
    >
      {inner}
    </button>
  );
});
/* ---------- Page primitives ---------- */

export function SolidPage({
  children,
  className,
  maxWidth = 'max-w-3xl',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className={cn('min-h-screen pb-28 desktop:pb-10', className)}>
      <main className={cn('mx-auto w-full px-4 py-6 desktop:px-8 desktop:py-10', maxWidth)}>
        {children}
      </main>
    </div>
  );
}

export function SolidHeader({
  eyebrow,
  title,
  description,
  backHref,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  backHref?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 flex items-start justify-between gap-4 desktop:mb-8', className)}>
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              aria-label="戻る"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--solid-ink)] active:bg-[var(--color-surface-secondary)]"
            >
              <Icon name="arrow_back" size={20} />
            </Link>
          )}
          {eyebrow && (
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.08em] text-[var(--color-accent)]">
              {eyebrow}
            </p>
          )}
        </div>
        <h1 className="font-display text-[2rem] font-black leading-[1.05] text-[var(--solid-ink)] desktop:text-[2.75rem]">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}

export function SolidPanel({
  children,
  className,
  faceClassName,
  as: Component = 'section',
}: {
  children: ReactNode;
  className?: string;
  /** Padding/typography for the inner content. */
  faceClassName?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <Component
      className={cn(
        'rounded-[var(--solid-radius)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]',
        className,
      )}
    >
      <div className={cn('p-5', faceClassName)}>{children}</div>
    </Component>
  );
}

export function SolidSectionTitle({
  icon,
  title,
  count,
}: {
  icon?: string;
  title: string;
  count?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 px-1">
      <div className="flex items-center gap-2">
        {icon && <Icon name={icon} size={18} className="text-[var(--color-muted)]" />}
        <h2 className="text-sm font-black text-[var(--solid-ink)]">{title}</h2>
      </div>
      {count !== undefined && (
        <span className="font-mono text-[11px] font-bold text-[var(--color-muted)]">
          {count}
        </span>
      )}
    </div>
  );
}

export function SolidEmpty({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <SolidPanel className={className} faceClassName="p-8 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
        <Icon name={icon} size={30} className="text-[var(--solid-ink)]" />
      </div>
      <h2 className="text-lg font-black text-[var(--solid-ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-muted)]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </SolidPanel>
  );
}
