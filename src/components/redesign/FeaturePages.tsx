'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

type Tone = 'ink' | 'accent' | 'blue' | 'gold' | 'red';

const toneClass: Record<Tone, string> = {
  ink: 'bg-[var(--color-foreground)] text-white border-[var(--solid-ink)]',
  accent: 'bg-[var(--color-accent-subtle)] text-[var(--color-accent-ink)] border-[var(--color-accent)]',
  blue: 'bg-blue-50 text-blue-800 border-blue-700',
  gold: 'bg-amber-50 text-amber-800 border-amber-700',
  red: 'bg-red-50 text-red-800 border-red-700',
};

const correctionHistory = [
  { title: '英検準2級 ライティング', score: 72, words: 61, issue: '時制と冠詞に注意', date: '今日 9:12' },
  { title: '環境問題について', score: 84, words: 93, issue: '語法の微修正のみ', date: '昨日 21:05' },
  { title: '留学の志望理由', score: 68, words: 118, issue: '理由の接続を整理', date: '4/28' },
];

const parserHistory = [
  {
    title: "Although she had never spoken in public before...",
    level: '節 4',
    words: 27,
    note: '主節 + 譲歩節 + 関係詞節 x2',
  },
  {
    title: 'The book that my teacher recommended was useful.',
    level: '節 2',
    words: 9,
    note: '主節 + 関係詞節',
  },
  {
    title: 'If you practice every day, your fluency will improve.',
    level: '節 2',
    words: 10,
    note: '条件節 + 主節',
  },
];

const correctionIssues = [
  { tag: '時制', tone: 'red' as const, from: 'have lived', to: 'lived', why: '過去の特定時点には現在完了ではなく単純過去を使う。' },
  { tag: '語法', tone: 'accent' as const, from: 'discuss about', to: 'discussed', why: 'discuss は他動詞なので about を取らない。' },
  { tag: '時制', tone: 'red' as const, from: 'am walking', to: 'walked', why: '習慣的な過去は単純過去で表す。' },
  { tag: '分詞', tone: 'gold' as const, from: 'a river run', to: 'a river running', why: '名詞を後置修飾するには分詞を使う。' },
];

const parserClauses = [
  { label: '主節', tone: 'accent' as const, text: 'she delivered the speech with confidence.' },
  { label: '譲歩節', tone: 'blue' as const, text: 'Although she had never spoken in public before' },
  { label: '関係詞節', tone: 'accent' as const, text: "that changed the company's direction" },
  { label: '関係詞節', tone: 'gold' as const, text: 'that surprised everyone in the room' },
];

export function CorrectionHistoryPage() {
  return (
    <FeatureShell
      eyebrow="A / CORRECTION"
      title="書いた英文を直す"
      description="添削はUI先行実装です。履歴、直接入力、スキャン、結果表示のデザインを先に入れ、解析APIは別途接続します。"
      primaryHref="/correction/new"
      primaryLabel="直接入力"
      secondaryHref="/correction/scan"
      secondaryLabel="スキャン"
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <SolidPanel className="p-5">
          <SectionTitle label="履歴" value={`${correctionHistory.length}件`} />
          <div className="mt-4 space-y-3">
            {correctionHistory.map((item) => (
              <Link key={item.title} href="/correction/result" className="block rounded-xl border-[1.5px] border-[var(--solid-ink)] bg-white p-4 transition hover:bg-[var(--color-surface-secondary)]">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--color-foreground)] font-display text-white">
                    <span className="text-xl font-black leading-none">{item.score}</span>
                    <span className="mt-0.5 font-mono text-[8px] tracking-[0.08em] text-white/70">SCORE</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-bold text-[var(--color-foreground)]">{item.title}</h2>
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-muted)]">{item.words}語</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-secondary-text)]">{item.issue}</p>
                    <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-muted)]">{item.date}</p>
                  </div>
                  <Icon name="chevron_right" size={20} className="text-[var(--color-muted)]" />
                </div>
              </Link>
            ))}
          </div>
        </SolidPanel>
        <SolidPanel inverse className="p-5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white/60">Pro workflow</p>
          <h2 className="mt-3 font-display text-2xl font-black text-white">赤ペンから単語帳へ</h2>
          <p className="mt-3 text-sm leading-7 text-white/75">
            修正理由をタグ化し、語法・文法ミスから復習すべき表現だけを単語帳へ送る画面です。
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Metric label="文法" value="4" />
            <Metric label="語法" value="2" />
            <Metric label="自然さ" value="1" />
            <Metric label="保存候補" value="3" />
          </div>
        </SolidPanel>
      </div>
    </FeatureShell>
  );
}

export function CorrectionInputPage() {
  return (
    <FeatureShell
      eyebrow="CORRECTION / INPUT"
      title="英文を貼り付ける"
      description="英検、入試、日常、ビジネスの目的を選んで、600字までの英文を添削する画面です。"
      backHref="/correction"
    >
      <SolidPanel className="p-5">
        <SectionTitle label="添削条件" value="最大600字" />
        <div className="mt-4 flex flex-wrap gap-2">
          {['英検', '日常', 'ビジネス', '入試'].map((item, index) => (
            <span
              key={item}
              className={cn(
                'rounded-full border-[1.5px] px-3 py-1.5 text-sm font-bold',
                index === 0 ? 'border-[var(--solid-ink)] bg-[var(--color-foreground)] text-white' : 'border-[var(--color-border)] bg-white text-[var(--color-foreground)]'
              )}
            >
              {item}
            </span>
          ))}
        </div>
        <textarea
          className="mt-5 min-h-64 w-full resize-none rounded-2xl border-[1.5px] border-[var(--solid-ink)] bg-white p-4 text-[15px] leading-7 outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          defaultValue={'When I was a child, I have lived in a small town. Every morning I am walking to school with my friends, and we discussing about many things.'}
        />
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <ComingSoonButton icon="draw" label="添削する" />
          <Link href="/correction/result" className="solid-link-secondary">
            モック結果を見る
          </Link>
        </div>
      </SolidPanel>
    </FeatureShell>
  );
}

export function CorrectionScanPage() {
  return (
    <FeatureShell
      eyebrow="CORRECTION / SCAN"
      title="手書き英作文を撮る"
      description="答案用紙をフレームに収め、行検出後に添削へ送る導線です。"
      backHref="/correction"
    >
      <ScanMock title="英作文スキャン" mode="6行を検出" cta="添削スキャンを開始" resultHref="/correction/result" />
    </FeatureShell>
  );
}

export function CorrectionResultPage() {
  return (
    <FeatureShell eyebrow="CORRECTION / RESULT" title="添削結果" description="削除は赤線、追加はアクセント下線で表示します。" backHref="/correction">
      <div className="space-y-5">
        <SolidPanel className="p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--color-foreground)] font-display text-white">
              <span className="text-3xl font-black leading-none">72</span>
              <span className="mt-1 font-mono text-[9px] tracking-[0.08em] text-white/70">SCORE</span>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-muted)]">準2級レベル · 61語</p>
              <h2 className="mt-1 font-display text-xl font-black text-[var(--color-foreground)]">時制と冠詞に注意</h2>
              <p className="mt-1 text-sm text-[var(--color-secondary-text)]">文法 4 · 語法 2 · 自然さ 1</p>
            </div>
          </div>
        </SolidPanel>

        <SolidPanel className="p-5">
          <SectionTitle label="添削後" value="削除 / 追加" />
          <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-4 text-[15px] leading-8 text-[var(--color-foreground)]">
            When I was a child, I <Del>have lived</Del> <Ins>lived</Ins> in a small town. The town <Ins>was</Ins> surrounded by mountains and there was a river <Del>run</Del> <Ins>running</Ins> through the middle. Every morning I <Del>am walking</Del> <Ins>walked</Ins> to school with my friends, and we <Del>discussing about</Del> <Ins>discussed</Ins> many things.
          </p>
        </SolidPanel>

        <SolidPanel className="p-5">
          <SectionTitle label="指摘" value={`${correctionIssues.length}件`} />
          <div className="mt-4 space-y-3">
            {correctionIssues.map((issue) => (
              <div key={issue.from} className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={issue.tone}>{issue.tag}</Badge>
                  <span className="font-mono font-bold text-red-700 line-through">{issue.from}</span>
                  <Icon name="arrow_forward" size={14} className="text-[var(--color-muted)]" />
                  <span className="border-b-2 border-[var(--color-accent)] font-mono font-bold">{issue.to}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--color-secondary-text)]">{issue.why}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <ComingSoonButton icon="library_books" label="単語帳に保存" />
            <Link href="/correction/new" className="solid-link-secondary">修正する</Link>
          </div>
        </SolidPanel>
      </div>
    </FeatureShell>
  );
}

export function ParserHistoryPage() {
  return (
    <FeatureShell
      eyebrow="B / PARSER"
      title="長文をSVOと節で読む"
      description="構造解析はUI先行実装です。結果は色帯付き原文と構造ツリーの2段ビューで表示します。"
      primaryHref="/parser/new"
      primaryLabel="直接入力"
      secondaryHref="/parser/scan"
      secondaryLabel="スキャン"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {parserHistory.map((item) => (
          <Link key={item.title} href="/parser/result" className="card block p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge tone="blue">{item.level}</Badge>
                <h2 className="mt-3 font-display text-lg font-black text-[var(--color-foreground)]">{item.title}</h2>
                <p className="mt-2 text-sm text-[var(--color-secondary-text)]">{item.note}</p>
              </div>
              <span className="font-mono text-[11px] font-bold text-[var(--color-muted)]">{item.words}語</span>
            </div>
            <ClausePreview />
          </Link>
        ))}
      </div>
    </FeatureShell>
  );
}

export function ParserInputPage() {
  return (
    <FeatureShell eyebrow="PARSER / INPUT" title="英文を構造解析する" description="解析の深さを選び、英文を貼り付けます。" backHref="/parser">
      <SolidPanel className="p-5">
        <SectionTitle label="解析の深さ" value="Pro対応" />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {['SVOのみ', '節を分ける', 'ツリー詳細'].map((item, index) => (
            <div key={item} className={cn('rounded-xl border-[1.5px] p-3 text-sm font-bold', index === 1 ? 'border-[var(--solid-ink)] bg-[var(--color-foreground)] text-white' : 'border-[var(--color-border)] bg-white')}>
              {item}
            </div>
          ))}
        </div>
        <textarea
          className="mt-5 min-h-56 w-full resize-none rounded-2xl border-[1.5px] border-[var(--solid-ink)] bg-white p-4 font-mono text-[14px] leading-7 outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
          defaultValue={"Although she had never spoken in public before, she delivered the speech that changed the company's direction with confidence that surprised everyone in the room."}
        />
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <ComingSoonButton icon="account_tree" label="解析する" />
          <Link href="/parser/result" className="solid-link-secondary">モック結果を見る</Link>
        </div>
      </SolidPanel>
    </FeatureShell>
  );
}

export function ParserScanPage() {
  return (
    <FeatureShell eyebrow="PARSER / SCAN" title="英文の一文を撮る" description="教科書や問題集の英文を狙って構造解析へ送る導線です。" backHref="/parser">
      <ScanMock title="構造解析スキャン" mode="1文を検出" cta="解析スキャンを開始" resultHref="/parser/result" />
    </FeatureShell>
  );
}

export function ParserResultPage() {
  return (
    <FeatureShell eyebrow="PARSER / RESULT" title="構造解析" description="色帯で節を分け、SVOタグと構造ツリーで骨格を確認します。" backHref="/parser">
      <div className="space-y-5">
        <SolidPanel className="p-5">
          <SectionTitle label="原文 + 節分け" value="27語" />
          <div className="mt-4 rounded-xl border-[1.5px] border-[var(--solid-ink)] bg-white p-4 font-mono text-[14px] leading-9">
            <Clause tone="blue" tag="M">Although</Clause> <Clause tone="blue" tag="S">she</Clause> <Clause tone="blue" tag="V">had never spoken</Clause> <Clause tone="blue">in public before</Clause>, <Clause tone="accent" tag="S">she</Clause> <Clause tone="accent" tag="V">delivered</Clause> <Clause tone="accent" tag="O">the speech</Clause> <Clause tone="accent" tag="M">that changed the company&apos;s direction</Clause> <Clause tone="gold">with confidence that surprised everyone in the room</Clause>.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {parserClauses.map((clause) => <Badge key={clause.text} tone={clause.tone}>{clause.label}</Badge>)}
          </div>
        </SolidPanel>

        <SolidPanel className="p-5">
          <SectionTitle label="構造ツリー" value="ツリー" />
          <div className="mt-4 space-y-3">
            {parserClauses.map((clause, index) => (
              <div key={clause.text} className={cn('rounded-xl border-l-4 p-4', index === 0 ? 'bg-[var(--color-accent-subtle)] border-[var(--color-accent)]' : 'bg-white border-[var(--solid-ink)]')}>
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.08em] text-[var(--color-muted)]">{clause.label}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{clause.text}</p>
              </div>
            ))}
          </div>
        </SolidPanel>

        <SolidPanel className="p-5">
          <SectionTitle label="訳" value="AI下訳" />
          <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-notebook-paper)] p-4 text-sm leading-7 text-[var(--color-foreground)]">
            人前で話したことが一度もなかったのに、彼女はその場の全員を驚かせるほどの自信を持って、会社の方向を変えるスピーチを行った。
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <ComingSoonButton icon="volume_up" label="音読" />
            <ComingSoonButton icon="library_books" label="単語帳に保存" />
          </div>
        </SolidPanel>
      </div>
    </FeatureShell>
  );
}

function FeatureShell({
  eyebrow,
  title,
  description,
  children,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  backHref,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  backHref?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-28 lg:pb-10">
      <main className="mx-auto max-w-4xl px-5 py-6 lg:px-8 lg:py-10">
        <div className="mb-7">
          {backHref ? (
            <Link href={backHref} className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-[var(--color-secondary-text)] hover:text-[var(--color-foreground)]">
              <Icon name="chevron_left" size={18} />
              戻る
            </Link>
          ) : null}
          <p className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-[var(--color-accent)]">{eyebrow}</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-display text-4xl font-black leading-tight tracking-normal text-[var(--color-foreground)] lg:text-5xl">{title}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-secondary-text)]">{description}</p>
            </div>
            {(primaryHref || secondaryHref) ? (
              <div className="flex shrink-0 gap-3">
                {secondaryHref && secondaryLabel ? <Link href={secondaryHref} className="solid-link-secondary">{secondaryLabel}</Link> : null}
                {primaryHref && primaryLabel ? <Link href={primaryHref} className="solid-link-primary">{primaryLabel}</Link> : null}
              </div>
            ) : null}
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function SolidPanel({ children, className, inverse = false }: { children: ReactNode; className?: string; inverse?: boolean }) {
  return (
    <section className={cn('rounded-[var(--radius-xl)] border-[1.5px] border-[var(--solid-ink)] shadow-[3px_4px_0_var(--solid-ink)]', inverse ? 'bg-[var(--color-foreground)]' : 'bg-[var(--color-surface)]', className)}>
      {children}
    </section>
  );
}

function SectionTitle({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-[var(--color-muted)]">{label}</h2>
      {value ? <span className="font-mono text-[11px] font-bold text-[var(--color-muted)]">{value}</span> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/20 bg-white/10 p-3">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white/60">{label}</p>
      <p className="mt-1 font-display text-2xl font-black text-white">{value}</p>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: Tone }) {
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-1 font-mono text-[10px] font-black uppercase tracking-[0.06em]', toneClass[tone])}>
      {children}
    </span>
  );
}

function ComingSoonButton({ icon, label }: { icon: string; label: string }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() => showToast({ type: 'success', message: 'API接続は準備中です。画面デザインのみ実装済みです。' })}
      className="solid-link-primary"
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
}

function ScanMock({ title, mode, cta, resultHref }: { title: string; mode: string; cta: string; resultHref: string }) {
  return (
    <SolidPanel className="overflow-hidden">
      <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative min-h-[440px] bg-[var(--color-foreground)] p-5 text-white">
          <div className="absolute left-8 right-8 top-16 bottom-16 rounded-[28px] border-2 border-white/80">
            <span className="absolute -left-1 -top-1 h-10 w-10 border-l-4 border-t-4 border-[var(--color-accent)]" />
            <span className="absolute -right-1 -top-1 h-10 w-10 border-r-4 border-t-4 border-[var(--color-accent)]" />
            <span className="absolute -bottom-1 -left-1 h-10 w-10 border-b-4 border-l-4 border-[var(--color-accent)]" />
            <span className="absolute -bottom-1 -right-1 h-10 w-10 border-b-4 border-r-4 border-[var(--color-accent)]" />
            <div className="absolute inset-x-10 top-20 rotate-[-3deg] rounded-xl bg-white p-5 text-[var(--color-foreground)] shadow-lg">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-muted)]">English answer</p>
              <div className="mt-4 space-y-3">
                <div className="h-2 rounded bg-[var(--color-border)]" />
                <div className="h-2 w-5/6 rounded bg-[var(--color-border)]" />
                <div className="h-2 w-4/5 rounded bg-[var(--color-border)]" />
                <div className="h-2 w-3/4 rounded bg-[var(--color-border)]" />
              </div>
            </div>
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <span className="rounded-full border border-white/25 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white/75">{mode}</span>
            <Icon name="photo_camera" size={24} />
          </div>
        </div>
        <div className="p-6">
          <p className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-[var(--color-accent)]">Scan mode</p>
          <h2 className="mt-2 font-display text-3xl font-black text-[var(--color-foreground)]">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--color-secondary-text)]">
            実際の画像アップロードとAI処理は今後のAPI接続で有効化します。現時点では撮影UIと結果導線を確認できます。
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <ComingSoonButton icon="camera_alt" label={cta} />
            <Link href={resultHref} className="solid-link-secondary">モック結果を見る</Link>
          </div>
        </div>
      </div>
    </SolidPanel>
  );
}

function ClausePreview() {
  return (
    <div className="mt-4 flex gap-1">
      <span className="h-2 flex-1 rounded bg-[var(--color-accent)]" />
      <span className="h-2 flex-[0.7] rounded bg-blue-600" />
      <span className="h-2 flex-[0.45] rounded bg-amber-600" />
      <span className="h-2 flex-[0.35] rounded bg-[var(--solid-ink)]" />
    </div>
  );
}

function Del({ children }: { children: ReactNode }) {
  return <span className="rounded bg-red-50 px-1 text-red-700 line-through decoration-2">{children}</span>;
}

function Ins({ children }: { children: ReactNode }) {
  return <span className="rounded bg-[var(--color-accent-subtle)] px-1 font-bold text-[var(--color-foreground)] underline decoration-[var(--color-accent)] decoration-2 underline-offset-4">{children}</span>;
}

function Clause({ children, tone, tag }: { children: ReactNode; tone: Tone; tag?: string }) {
  return (
    <span className={cn('relative inline-block rounded px-1.5 pb-1 pt-4', tone === 'blue' && 'bg-blue-50', tone === 'accent' && 'bg-[var(--color-accent-subtle)]', tone === 'gold' && 'bg-amber-50')}>
      {tag ? <span className="absolute left-1 top-0 rounded-sm bg-[var(--color-foreground)] px-1 font-mono text-[8px] font-black text-white">{tag}</span> : null}
      {children}
    </span>
  );
}
