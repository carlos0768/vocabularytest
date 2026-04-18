'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const iconReadyState = {
  done: false,
  callbacks: new Set<() => void>(),
};

function ensureIconFontReady() {
  if (typeof document === 'undefined' || iconReadyState.done) return;

  const markReady = () => {
    if (iconReadyState.done) return;
    iconReadyState.done = true;
    for (const callback of iconReadyState.callbacks) {
      callback();
    }
    iconReadyState.callbacks.clear();
  };

  if (document.fonts?.load) {
    void Promise.all([
      document.fonts.load('20px "Material Symbols Outlined"'),
      document.fonts.load('20px "Material Icons Outlined"'),
    ]).then(markReady, markReady);
    window.setTimeout(markReady, 2500);
    return;
  }

  window.setTimeout(markReady, 1500);
}

export function MerkenIcon({
  name,
  size = 20,
  fill = false,
  weight,
  className = '',
  style,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: 'thin';
  className?: string;
  style?: React.CSSProperties;
}) {
  const [ready, setReady] = useState(iconReadyState.done);

  useEffect(() => {
    ensureIconFontReady();
    if (iconReadyState.done) {
      setReady(true);
      return;
    }

    const callback = () => setReady(true);
    iconReadyState.callbacks.add(callback);
    return () => {
      iconReadyState.callbacks.delete(callback);
    };
  }, []);

  return (
    <span
      aria-hidden="true"
      className={cn('mso', fill && 'fill', weight === 'thin' && 'thin', ready && 'ready', className)}
      style={{ fontSize: size, lineHeight: 1, ...style }}
    >
      {name}
    </span>
  );
}

export function StatusBar({ time = '9:41', theme = 'paper' }: { time?: string; theme?: 'paper' | 'ink' }) {
  const color = theme === 'ink' ? '#fafaf7' : '#0a0a0a';
  return (
    <div
      className="flex items-center justify-between px-6 pt-3 pb-1 text-[12px] font-semibold"
      style={{ color, fontFamily: '"Inter Tight"' }}
    >
      <span>{time}</span>
      <div className="flex items-center gap-1.5">
        <MerkenIcon name="signal_cellular_alt" size={14} />
        <MerkenIcon name="wifi" size={14} />
        <MerkenIcon name="battery_full" size={14} />
      </div>
    </div>
  );
}

export function TopNav({
  title,
  sub,
  onBack,
  variant = 'swiss',
  trailing,
}: {
  title: string;
  sub?: string;
  onBack?: () => void;
  variant?: 'editorial' | 'swiss';
  trailing?: ReactNode;
}) {
  const editorial = variant === 'editorial';
  return (
    <div className={cn('px-4 pb-3 pt-2')}>
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="press -ml-1.5 flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5">
          <MerkenIcon name="arrow_back_ios_new" size={16} />
        </button>
        <div className="-mr-1.5 flex items-center gap-0.5">{trailing}</div>
      </div>
      <div className="mt-2 px-1">
        {sub && (
          <div className={cn('mb-1 text-[10px] font-bold uppercase tracking-[.2em] text-muted')}>
            {sub}
          </div>
        )}
        <h1
          className={cn(
            editorial
              ? 'font-serif text-[28px] font-medium leading-[1.05] tracking-tight'
              : 'font-sans text-[24px] font-extrabold leading-tight tracking-tight',
          )}
        >
          {title}
        </h1>
      </div>
    </div>
  );
}

export function HeaderStrip({
  items,
  variant = 'swiss',
}: {
  items: Array<{ icon: string; label: string; sub: string; badge?: string; onClick?: () => void }>;
  variant?: 'editorial' | 'swiss';
}) {
  return (
    <div className="mb-3 mt-1 px-5">
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <button
            key={`${item.icon}-${item.label}`}
            onClick={item.onClick}
            className={cn(
              'press relative flex h-[76px] flex-col items-start justify-between border border-bd bg-white p-3 text-left',
              variant === 'editorial' ? 'rounded-2xl border-rule bg-cream h-[78px]' : '',
            )}
            style={variant === 'swiss' ? { borderRadius: 2 } : undefined}
          >
            <MerkenIcon name={item.icon} size={18} className="text-ink" />
            <div>
              <div className="text-[12px] font-semibold leading-tight">{item.label}</div>
              <div className="mt-0.5 text-[9.5px] text-muted" style={{ fontFamily: '"Inter Tight"' }}>
                {item.sub}
              </div>
            </div>
            {item.badge && (
              <span
                className="absolute right-2 top-2 text-[9px] font-bold uppercase tracking-wider text-ochre"
                style={{ fontFamily: '"Inter Tight"' }}
              >
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FolderCrumb({
  path = ['英検準1級', 'Unit 3'],
  variant = 'swiss',
}: {
  path?: string[];
  variant?: 'editorial' | 'swiss';
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 px-5 text-[11px]',
        variant === 'editorial' ? 'font-serif italic text-muted' : 'font-semibold uppercase tracking-[.15em] text-muted',
      )}
      style={variant === 'swiss' ? { fontFamily: '"Inter Tight"', fontSize: 10 } : undefined}
    >
      <MerkenIcon name="folder_open" size={12} />
      {path.map((part, index) => (
        <span key={`${part}-${index}`} className="contents">
          <span>{part}</span>
          {index < path.length - 1 && <span className="opacity-50">/</span>}
        </span>
      ))}
    </div>
  );
}

export function Fab({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="追加"
      className="press absolute bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper"
      style={{ boxShadow: '0 12px 26px -8px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.04) inset' }}
    >
      <MerkenIcon name="add" size={26} />
    </button>
  );
}

export function BottomTabs({
  active = 'notes',
  variant = 'swiss',
  onSelect,
}: {
  active?: 'home' | 'notes' | 'stats' | 'me';
  variant?: 'editorial' | 'swiss';
  onSelect?: (id: 'home' | 'notes' | 'stats' | 'me') => void;
}) {
  const items = [
    { id: 'home' as const, icon: 'home', label: 'ホーム' },
    { id: 'notes' as const, icon: 'menu_book', label: 'ノート' },
    { id: 'stats' as const, icon: 'bar_chart', label: '進歩' },
    { id: 'me' as const, icon: 'person', label: '自分' },
  ];

  return (
    <nav
      className={cn(
        'absolute inset-x-0 bottom-0 z-20 grid grid-cols-4 px-3 pb-5 pt-2',
        variant === 'editorial' ? 'border-t border-rule bg-paper/95 backdrop-blur' : 'border-t border-bd bg-white/95 backdrop-blur',
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect?.(item.id)}
          className={cn('press flex flex-col items-center justify-center gap-1', active === item.id ? 'text-ink' : 'text-muted')}
        >
          <MerkenIcon name={item.icon} size={22} fill={active === item.id} />
          <span
            className="text-[10px] font-semibold"
            style={variant === 'swiss' ? { fontFamily: '"Inter Tight"', letterSpacing: '.04em' } : undefined}
          >
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
}

export function Tag({
  children,
  variant = 'swiss',
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode;
  variant?: 'editorial' | 'swiss';
  tone?: 'neutral' | 'ochre' | 'moss' | 'pink' | 'red';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-black/5 text-ink',
    ochre: 'bg-[#c8935d22] text-[#805724]',
    moss: 'bg-[#5a6b4f22] text-[#3b4632]',
    pink: 'bg-[#ec489922] text-[#9d1a5b]',
    red: 'bg-[#ef444422] text-[#b91c1c]',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-[2px] text-[10px] font-bold',
        tones[tone],
        variant === 'editorial' ? 'rounded-full' : 'rounded-[3px] uppercase tracking-[.08em]',
        className,
      )}
      style={variant === 'swiss' ? { fontFamily: '"Inter Tight"', fontSize: 9.5 } : undefined}
    >
      {children}
    </span>
  );
}

export function MasteryCell({
  stage = 0,
  variant = 'swiss',
  title,
}: {
  stage?: 0 | 1 | 2 | 3;
  variant?: 'editorial' | 'swiss';
  title?: string;
}) {
  const labels = ['未習', '学習中 1/2', '学習中 2/2', '習得済み'];
  const radius = variant === 'editorial' ? 3 : 1.5;

  return (
    <div
      role="img"
      aria-label={`学習ステータス: ${labels[stage]}`}
      title={title || labels[stage]}
      style={{
        width: 14,
        height: 26,
        display: 'flex',
        flexDirection: 'column',
        border: '1.25px solid #0a0a0a',
        borderRadius: radius,
        overflow: 'hidden',
        flexShrink: 0,
        background: 'transparent',
      }}
    >
      {[2, 1, 0].map((index) => (
        <div
          key={index}
          style={{
            flex: 1,
            background: index < stage ? '#0a0a0a' : 'transparent',
            borderTop: index < 2 ? '1.25px solid #0a0a0a' : 'none',
          }}
        />
      ))}
    </div>
  );
}
