'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsGroupProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  return (
    <section className={className}>
      <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 px-1">
        {title}
      </h2>
      <div className="card overflow-hidden divide-y divide-[var(--color-border)]">
        {children}
      </div>
    </section>
  );
}

interface SettingsItemProps {
  icon?: React.ReactNode;
  label: string;
  value?: React.ReactNode;
  description?: string;
  href?: string;
  onClick?: () => void;
  showChevron?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function SettingsItem({
  icon,
  label,
  value,
  description,
  href,
  onClick,
  showChevron = false,
  className,
  children,
}: SettingsItemProps) {
  const content = (
    <>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {icon && (
          <div className="w-8 h-8 bg-[var(--color-peach-light)] rounded-lg flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-foreground)]">{label}</p>
          {description && (
            <p className="text-sm text-[var(--color-muted)] truncate">{description}</p>
          )}
        </div>
      </div>
      {children}
      {value && !children && (
        <span className="text-sm text-[var(--color-muted)] flex-shrink-0">{value}</span>
      )}
      {showChevron && (
        <ChevronRight className="w-5 h-5 text-[var(--color-muted)] flex-shrink-0" />
      )}
    </>
  );

  const baseClassName = cn(
    'flex items-center justify-between px-4 py-4 w-full',
    (href || onClick) && 'hover:bg-[var(--color-peach-light)] transition-colors cursor-pointer',
    className
  );

  if (href) {
    return (
      <a href={href} className={baseClassName}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <button onClick={onClick} className={baseClassName}>
        {content}
      </button>
    );
  }

  return (
    <div className={baseClassName}>
      {content}
    </div>
  );
}

interface SettingsToggleProps {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

export function SettingsToggle({
  icon,
  label,
  description,
  checked,
  onChange,
  className,
}: SettingsToggleProps) {
  return (
    <div className={cn('flex items-center justify-between px-4 py-4', className)}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {icon && (
          <div className="w-8 h-8 bg-[var(--color-peach-light)] rounded-lg flex items-center justify-center flex-shrink-0">
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-foreground)]">{label}</p>
          {description && (
            <p className="text-sm text-[var(--color-muted)] truncate">{description}</p>
          )}
        </div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2',
          checked ? 'bg-[var(--color-primary)]' : 'bg-gray-200 dark:bg-gray-700'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}
