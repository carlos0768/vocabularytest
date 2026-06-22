import Link from 'next/link';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';

/* ---------- Solid primitives (Tailwind hard-shadow flavor) ---------- */
/**
 * Surface that renders the Merken Solid hard-shadow look using
 * Tailwind utility classes — no `.solid-plate` DOM. Cleaner appearance
 * than the canonical plate stack while still emitting the
 * 1.5px ink border + 3/4px offset shadow the design system expects.
 */
const SOLID_BASE =
  'rounded-[var(--solid-radius)] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[3px_4px_0_var(--solid-ink)]';
const SOLID_INTERACTIVE =
  'transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-ink)]';
const SOLID_BTN_BASE =
  'rounded-[var(--solid-radius-sm)] border-[1.5px] border-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)]';

export function Solid({
  children,
  className,
  interactive,
  variant,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  variant?: 'sm' | 'tile' | 'inverse' | 'accent';
  as?: 'div' | 'article' | 'section' | 'li';
}) {
  return (
    <Component
      className={cn(
        SOLID_BASE,
        interactive && SOLID_INTERACTIVE,
        variant === 'sm' && '!rounded-[var(--solid-radius-sm)] shadow-[2px_3px_0_var(--solid-ink)]',
        variant === 'tile' && '!rounded-[var(--solid-radius-tile)] shadow-[2px_3px_0_var(--solid-ink)] aspect-[3/4] overflow-hidden',
        variant === 'inverse' && 'bg-[var(--solid-ink)] text-white',
        variant === 'accent' && 'bg-[var(--color-accent)] text-white border-[var(--color-accent-ink)]',
        className,
      )}
    >
      {children}
    </Component>
  );
}

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
    variant === 'inverse' && 'bg-[var(--solid-ink)] text-white',
    variant === 'accent' && 'bg-[var(--color-accent)] text-white border-[var(--color-accent-ink)]',
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

/**
 * Tile — square-ish 3:4 surface (used for bookshelf thumbnails).
 */
export function SolidTile({
  children,
  className,
  href,
  onClick,
  interactive = true,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
  interactive?: boolean;
}) {
  const wrapperClass = cn(
    'block aspect-[3/4] overflow-hidden rounded-[var(--solid-radius-tile)] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-ink)]',
    interactive && SOLID_INTERACTIVE,
    className,
  );
  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {children}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(wrapperClass, 'w-full text-left')}>
        {children}
      </button>
    );
  }
  return <div className={wrapperClass}>{children}</div>;
}

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
    <div className={cn('min-h-screen pb-28 lg:pb-10', className)}>
      <main className={cn('mx-auto w-full px-4 py-6 lg:px-8 lg:py-10', maxWidth)}>
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
    <header className={cn('mb-6 flex items-start justify-between gap-4 lg:mb-8', className)}>
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
        <h1 className="font-display text-[2rem] font-black leading-[1.05] text-[var(--solid-ink)] lg:text-[2.75rem]">
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
        'rounded-[var(--solid-radius)] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[3px_4px_0_var(--solid-ink)]',
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

export function SolidStatCard({
  icon,
  label,
  value,
  suffix,
  tone = 'default',
}: {
  icon: string;
  label: string;
  value: ReactNode;
  suffix?: string;
  tone?: 'default' | 'success' | 'warning' | 'accent';
}) {
  const toneClass = {
    default: 'bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]',
    success: 'bg-[var(--color-success-light)] text-[var(--color-success)]',
    warning: 'bg-[var(--color-warning-light)] text-[var(--color-warning)]',
    accent: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]',
  }[tone];

  return (
    <SolidPanel faceClassName="p-4">
      <div className={cn('mb-4 flex h-11 w-11 items-center justify-center rounded-[16px] border-[1.5px] border-[var(--solid-ink)]', toneClass)}>
        <Icon name={icon} size={22} />
      </div>
      <p className="text-xs font-bold text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-3xl font-black leading-none text-[var(--solid-ink)]">
        {value}
        {suffix && <span className="ml-1 text-base font-black">{suffix}</span>}
      </p>
    </SolidPanel>
  );
}

export function SolidRow({
  icon,
  title,
  detail,
  children,
  href,
  danger,
  onClick,
}: {
  icon?: string;
  title: string;
  detail?: ReactNode;
  children?: ReactNode;
  href?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      {icon && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[rgba(26,26,26,0.05)]">
          <Icon name={icon} size={16} className={danger ? 'text-[var(--color-error)]' : 'text-[var(--solid-ink)]'} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-bold', danger ? 'text-[var(--color-error)]' : 'text-[var(--solid-ink)]')}>
          {title}
        </span>
        {detail && <span className="mt-0.5 block text-xs leading-5 text-[var(--color-muted)]">{detail}</span>}
      </span>
      {children}
      {(href || onClick) && <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />}
    </>
  );
  const className = 'flex w-full items-center gap-3 border-b border-[var(--color-border-light)] px-5 py-4 text-left last:border-b-0 transition-colors active:bg-[var(--color-surface-secondary)]';

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function SolidEmpty({
  icon,
  title,
  description,
  action,
  className,
  noShadow,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  noShadow?: boolean;
}) {
  return (
    <SolidPanel className={cn(noShadow && '!shadow-none', className)} faceClassName="p-8 text-center">
      <div className={cn("mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]", noShadow ? '' : 'shadow-[3px_4px_0_var(--solid-ink)]')}>
        <Icon name={icon} size={30} className="text-[var(--solid-ink)]" />
      </div>
      <h2 className="text-lg font-black text-[var(--solid-ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--color-muted)]">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </SolidPanel>
  );
}
