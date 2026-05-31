'use client';

import { useState, type ReactNode } from 'react';
import { DesktopSidebar } from '@/components/desktop/DesktopChrome';
import { Icon } from '@/components/ui/Icon';

type Article = {
  h: string;
  p?: string[];
  list?: string[];
};

export type TokushoSection = {
  label: string;
  rows: { label: string; value: ReactNode }[];
};

function DesktopStandaloneShell({ children }: { children: ReactNode }) {
  return (
    <div className="hidden h-screen lg:block">
      <div className="ds-app">
        <DesktopSidebar />
        {children}
      </div>
    </div>
  );
}

function SupportTopbar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="ds-top">
      <button type="button" className="ds-iconbtn" onClick={onBack} style={{ width: 38, height: 38 }} aria-label="戻る">
        <Icon name="arrow_back" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="crumb">設定 / サポート</div>
        <h1>{title}</h1>
      </div>
    </div>
  );
}

export function DesktopContactView({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState('bug');
  const kinds = [
    ['bug', '不具合の報告'],
    ['request', '機能のご要望'],
    ['question', '使い方の質問'],
    ['other', 'その他'],
  ];

  return (
    <DesktopStandaloneShell>
      <div className="ds-main">
        <SupportTopbar title="お問い合わせ" onBack={onBack} />
        <div
          className="ds-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 300px',
            gap: 26,
            alignItems: 'start',
            width: 'min(100%, 980px)',
            margin: '0 auto',
          }}
        >
          <div style={{ maxWidth: 620 }}>
            <p className="muted" style={{ fontSize: 14, lineHeight: 1.7, marginTop: 0, marginBottom: 24 }}>
              不具合のご報告や機能のご要望をお寄せください。内容を確認のうえ、通常2営業日以内にメールでご返信します。
            </p>
            <div className="ds-card" style={{ padding: '24px 26px' }}>
              <div className="ds-form-field">
                <label>お問い合わせの種類</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {kinds.map(([key, label]) => (
                    <button key={key} type="button" className={'ds-chip' + (kind === key ? ' active' : '')} onClick={() => setKind(key)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ds-form-field">
                <label>件名</label>
                <input className="ds-input" placeholder="例：クイズ画面で発音が再生されない" />
              </div>
              <div className="ds-form-field">
                <label>内容</label>
                <textarea className="ds-textarea" placeholder="できるだけ詳しく状況をお書きください。発生した画面や操作の手順があると解決が早まります。" />
              </div>
              <div className="ds-form-field">
                <label>返信先メールアドレス</label>
                <input className="ds-input" type="email" placeholder="you@example.com" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                <a className="ds-btn accent" href={`mailto:support@merken.jp?subject=${encodeURIComponent(kind)}`}>
                  <Icon name="send" />
                  送信する
                </a>
                <span className="muted mono" style={{ fontSize: 11.5 }}>メールアプリで送信内容を確認できます</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
            <a href="mailto:support@merken.jp" className="ds-card ds-contact-method" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="ic"><Icon name="mail" style={{ color: 'var(--color-accent)' }} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>メールで直接</div>
                <div className="mono muted" style={{ fontSize: 12, marginTop: 2 }}>support@merken.jp</div>
              </div>
            </a>
            <div className="ds-card" style={{ padding: '18px 20px' }}>
              <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>よくある質問</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {['スキャンの精度を上げるには？', '同期できないときは？', '解約・退会の方法'].map((q) => (
                  <div key={q} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Icon name="help" style={{ fontSize: 17, color: 'var(--color-muted)' }} />
                    <span style={{ fontSize: 13, flex: 1 }}>{q}</span>
                    <Icon name="chevron_right" style={{ fontSize: 18, color: 'var(--color-muted)' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesktopStandaloneShell>
  );
}

export function DesktopLegalDocView({
  title,
  updated,
  intro,
  toc,
  articles,
  onBack,
}: {
  title: string;
  updated: string;
  intro: string;
  toc: string[];
  articles: Article[];
  onBack: () => void;
}) {
  return (
    <DesktopStandaloneShell>
      <div className="ds-main">
        <SupportTopbar title={title} onBack={onBack} />
        <div className="ds-scroll">
          <div className="ds-doc">
            <div className="ds-doc-head">
              <div className="meta">最終更新日：{updated}</div>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 0, marginTop: 14 }}>{intro}</p>
              <div className="ds-toc">
                {toc.map((item, index) => (
                  <a key={item} href={`#article-${index + 1}`}>{`${index + 1}. ${item}`}</a>
                ))}
              </div>
            </div>
            {articles.map((article, index) => (
              <div key={article.h} id={`article-${index + 1}`} className="ds-article">
                <h2><span className="no">第{index + 1}条</span>{article.h}</h2>
                {article.p?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {article.list && (
                  <ul>
                    {article.list.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </div>
            ))}
            <div className="mono muted" style={{ fontSize: 11.5, marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--color-border)' }}>
              本{title}に関するお問い合わせは support@merken.jp までご連絡ください。
            </div>
          </div>
        </div>
      </div>
    </DesktopStandaloneShell>
  );
}

export function DesktopTokushoView({
  onBack,
  sections,
  updated,
}: {
  onBack: () => void;
  sections: TokushoSection[];
  updated: string;
}) {
  return (
    <DesktopStandaloneShell>
      <div className="ds-main">
        <SupportTopbar title="特定商取引法に基づく表記" onBack={onBack} />
        <div className="ds-scroll">
          <div className="ds-doc">
            <div className="ds-doc-head">
              <div className="meta">SPECIFIED COMMERCIAL TRANSACTIONS ACT</div>
              <div className="ds-paper" style={{ marginTop: 16, padding: '14px 18px 14px 46px' }}>
                <div className="lab"><Icon name="gavel" style={{ fontSize: 14 }} />第11条に基づく表示</div>
                <div style={{ fontSize: 13, color: 'var(--color-secondary-text)', lineHeight: 1.8 }}>
                  特定商取引法第11条に基づき、Pro 購読サービスの提供に関する事項を以下のとおり表示します。
                </div>
              </div>
            </div>
            {sections.map((section, index) => (
              <div key={section.label} className="ds-article">
                <h2><span className="no">{String(index + 1).padStart(2, '0')}</span>{section.label}</h2>
                <div className="ds-deflist">
                  {section.rows.map((row) => (
                    <div key={row.label} className="ds-defrow">
                      <div className="dl">{row.label}</div>
                      <div className="dv">{row.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="mono muted" style={{ fontSize: 11.5, marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--color-border)' }}>
              最終更新日：{updated} ・ お問い合わせは support@merken.jp まで
            </div>
          </div>
        </div>
      </div>
    </DesktopStandaloneShell>
  );
}
