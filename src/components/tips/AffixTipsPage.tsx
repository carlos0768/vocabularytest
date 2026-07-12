'use client';

/**
 * 豆知識: 接頭語・接尾語・接中語の静的解説ページ共通ボディ。
 * /tips/prefixes, /tips/suffixes, /tips/infixes の3ルートが薄いラッパーとして使う。
 * 一覧部分は AFFIX_CATALOG（接辞マスターデータ）から生成するため、
 * カタログを更新するとこのページも自動で追随する。
 */

import { useRouter } from 'next/navigation';
import { DesktopLegalDocView } from '@/components/desktop/DesktopSupport';
import { Icon } from '@/components/ui/Icon';
import {
  AFFIX_CATALOG,
  getAffixesByKind,
  type AffixKind,
  type AffixSense,
} from '@/lib/morphology/affix-catalog';

const KIND_META: Record<AffixKind, {
  title: string;
  reading: string;
  hyphenate: (form: string) => string;
  intro: string;
  whatIs: string[];
  tips: string[];
}> = {
  prefix: {
    title: '接頭語（プレフィックス）',
    reading: 'PREFIX',
    hyphenate: (form) => `${form}-`,
    intro: '接頭語は単語の頭に付いて意味を加えるパーツです。接頭語の意味を知っていれば、初見の単語でも「方向」や「否定」などの大まかな意味を推測できます。早慶レベルの長文では、接頭語からの語彙推測が得点に直結します。',
    whatIs: [
      '接頭語（prefix）は語根の前に付き、「否定」「方向」「数」「程度」などの意味を加えます。例えば predict は pre（前もって）＋ dict（言う）＝「予言する」。単語を丸暗記するのではなく、パーツに分解して覚えると記憶の負担が大きく減ります。',
      '注意すべきは、綴りが同じでも意味が違う接頭語があることです。unhappy の un- は「否定」ですが、unanimous の un- は uni-（1つ）の変化形で、uni（1つ）＋ anim（心）＋ ous ＝「心が1つ → 満場一致の」となります。',
    ],
    tips: [
      '新しい単語に出会ったら、まず頭の部分が既知の接頭語かどうか確認する癖をつける。',
      '同化（in- → im-/il-/ir-、con- → com-/col-/cor- など）のパターンを覚えると適用範囲が一気に広がる。',
      '綴りが同じ接頭語（un-「否定」と uni-「1つ」、in-「否定」と in-「中へ」など）は代表語とセットで区別する。',
      '接頭語＋語根で意味を「推測」した後は、必ず辞書で確認する。推測は読解の補助であり、暗記の代替ではない。',
    ],
  },
  suffix: {
    title: '接尾語（サフィックス）',
    reading: 'SUFFIX',
    hyphenate: (form) => `-${form}`,
    intro: '接尾語は単語の末尾に付いて、品詞や意味を変えるパーツです。接尾語が分かれば、知らない単語でも品詞を即座に判定でき、文法問題や長文の構造把握で大きな武器になります。',
    whatIs: [
      '接尾語（suffix）は語根の後ろに付き、主に品詞を決めます。-tion / -ness / -ity は名詞、-ous / -ful / -able は形容詞、-ize / -ify は動詞、-ly は副詞、という具合です。空所補充問題で「ここは名詞が入る」と分かれば、接尾語だけで選択肢を絞れます。',
      '接尾語にも同綴り異義があります。teacher の -er は「〜する人」ですが、bigger の -er は比較級。friendly の -ly は名詞に付く「形容詞化」で、quickly の -ly は形容詞に付く「副詞化」です。何に付いているか（土台の品詞）で見分けるのがコツです。',
    ],
    tips: [
      '接尾語を見たら品詞を判定する癖をつける（-tion なら名詞、-ous なら形容詞）。',
      '-er は「〜する人」（動詞に付く）と「比較級」（形容詞に付く）の2種類。土台の品詞で見分ける。',
      '-able / -ible、-ance / -ence のような綴り違いの同機能ペアはまとめて覚える。',
      '派生語のセット（decide → decision → decisive → decisively）で覚えると語彙が4倍になる。',
    ],
  },
  infix: {
    title: '接中語（インフィックス）',
    reading: 'INFIX',
    hyphenate: (form) => `-${form}-`,
    intro: '接中語は単語の内部に入るパーツです。英語では数こそ少ないものの、語根と語根をつなぐ「連結母音」は早慶レベルの学術系単語で頻出します。仕組みを知っていると、長い単語の分解が一気に楽になります。',
    whatIs: [
      '接中語（infix）は語の内部に挿入されるパーツです。英語で実用上重要なのは、2つの語根をつなぐ「連結母音」で、ギリシャ語系では -o-（therm-o-meter ＝ 温度計）、ラテン語系では -i-（herb-i-vore ＝ 草食動物）が使われます。',
      '長い学術系単語は「語根＋連結母音＋語根＋接尾語」という構造をしていることが多く、insecticide は insect（昆虫）＋ -i- ＋ cide（殺す）＝「殺虫剤」と分解できます。連結母音自体に意味はなく、発音をなめらかにする役割です。',
    ],
    tips: [
      '長い単語は連結母音（-o- / -i-）で区切ってみると、既知の語根が見えてくることが多い。',
      '-o- はギリシャ語系（bio, geo, thermo...）、-i- はラテン語系（herbi, carni, insecti...）とセットで覚える。',
      '連結母音そのものに意味はない。意味は前後の語根が持っている。',
    ],
  },
};

function formatAffixLine(sense: AffixSense, hyphenate: (form: string) => string): string {
  const examples = sense.examples.slice(0, 3).join(' / ');
  const nuance = sense.nuanceJa ? ` — ${sense.nuanceJa}` : '';
  return `${hyphenate(sense.form)}（${sense.meaningJa}）: ${examples}${nuance}`;
}

/** 同じ綴り・同じ種類で複数の意味を持つ接辞のグループを返す */
function buildHomographGroups(kind: AffixKind): { form: string; senses: AffixSense[] }[] {
  const byForm = new Map<string, AffixSense[]>();
  for (const sense of getAffixesByKind(kind)) {
    const list = byForm.get(sense.form) ?? [];
    list.push(sense);
    byForm.set(sense.form, list);
  }
  return Array.from(byForm.entries())
    .filter(([, senses]) => senses.length > 1)
    .map(([form, senses]) => ({ form, senses }));
}

export function AffixTipsPage({ kind }: { kind: AffixKind }) {
  const router = useRouter();
  const meta = KIND_META[kind];
  const basicSenses = getAffixesByKind(kind).filter((sense) => sense.level !== 'advanced');
  const advancedSenses = getAffixesByKind(kind).filter((sense) => sense.level === 'advanced');
  const homographs = buildHomographGroups(kind);

  const articles: { h: string; p?: string[]; list?: string[] }[] = [
    { h: `${meta.title}とは`, p: meta.whatIs },
  ];
  if (basicSenses.length > 0) {
    articles.push({
      h: '基本レベル',
      p: ['まずはここから。中学〜高校基礎レベルで登場する頻出パーツです。'],
      list: basicSenses.map((sense) => formatAffixLine(sense, meta.hyphenate)),
    });
  }
  if (advancedSenses.length > 0) {
    articles.push({
      h: '早慶・難関大レベル',
      p: ['難関大の長文・語彙問題で差がつくパーツです。'],
      list: advancedSenses.map((sense) => formatAffixLine(sense, meta.hyphenate)),
    });
  }
  if (homographs.length > 0) {
    articles.push({
      h: '同じ綴りで意味が違うものに注意',
      p: ['綴りが同じでも由来と意味が異なるパーツがあります。単語の成り立ちに合わせて区別しましょう。'],
      list: homographs.map(({ form, senses }) =>
        `${meta.hyphenate(form)}: ${senses
          .map((sense) => `「${sense.meaningJa}」(${sense.examples[0] ?? ''})`)
          .join(' と ')}`,
      ),
    });
  }
  articles.push({ h: '学習のコツ', list: meta.tips });

  const totalCount = getAffixesByKind(kind).length;

  return (
    <>
      <DesktopLegalDocView
        title={meta.title}
        updated="2026年7月12日"
        intro={meta.intro}
        toc={articles.map((article) => article.h)}
        articles={articles}
        onBack={() => router.back()}
      />
      <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
        {/* Header */}
        <div className="px-[18px] pb-3.5 pt-1">
          <div className="mb-0.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="chevron_left" size={16} />
            </button>
            <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT / 豆知識</div>
          </div>
          <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">{meta.title}</div>
          <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">MERKEN {meta.reading} GUIDE · 全 {totalCount} 項目</div>
        </div>

        {/* Intro */}
        <div className="px-[18px] pb-3.5">
          <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px]">
            <p className="m-0 text-[11px] leading-[1.75] text-[var(--solid-ink)]">{meta.intro}</p>
          </div>
        </div>

        {articles.map((article, index) => (
          <Section key={article.h} num={String(index + 1)} label={article.h}>
            {article.p?.map((paragraph) => (
              <P key={paragraph.slice(0, 24)}>{paragraph}</P>
            ))}
            {article.list && <UL items={article.list} />}
          </Section>
        ))}

        <div className="px-[18px] pb-[110px] pt-1">
          <div className="text-center font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
            MERKEN 豆知識 · 語源で覚える受験英語
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ num, label, children }: { num: string; label: string; children: React.ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="flex items-baseline gap-1.5 pb-1.5 pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <span className="text-[var(--solid-ink)]">§{num}</span>
        <span>{label}</span>
      </div>
      <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px]">
        {children}
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="m-0 pb-1.5 text-[11.5px] leading-[1.75] text-[var(--solid-ink)] last:pb-0">{children}</p>;
}

function UL({ items }: { items: string[] }) {
  return (
    <ul className="mt-1.5 space-y-1 pl-[18px]">
      {items.map((item) => (
        <li key={item.slice(0, 40)} className="list-disc pl-0.5 text-[11.5px] leading-[1.7] text-[var(--solid-ink)]">{item}</li>
      ))}
    </ul>
  );
}

// AFFIX_CATALOG 全体が3ページのいずれかに必ず載っていることの静的な担保
// （kind の網羅は AffixKind 型で保証される）。
void AFFIX_CATALOG;
