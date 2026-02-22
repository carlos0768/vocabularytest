'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { createBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { NativeLanguage } from '@/types';

const LANGUAGES: { value: NativeLanguage; flag: string; label: string }[] = [
  { value: 'ja', flag: '\u{1F1EF}\u{1F1F5}', label: '\u65E5\u672C\u8A9E' },
  { value: 'en', flag: '\u{1F1FA}\u{1F1F8}', label: 'English' },
  { value: 'ko', flag: '\u{1F1F0}\u{1F1F7}', label: '\uD55C\uAD6D\uC5B4' },
  { value: 'zh', flag: '\u{1F1E8}\u{1F1F3}', label: '\u4E2D\u6587' },
  { value: 'ar', flag: '\u{1F1F8}\u{1F1E6}', label: '\u0627\u0644\u0639\u0631\u0628\u064A\u0629' },
  { value: 'he', flag: '\u{1F1EE}\u{1F1F1}', label: '\u05E2\u05D1\u05E8\u05D9\u05EA' },
];

function LanguageSelector() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { user } = useAuth();

  const [selected, setSelected] = useState<NativeLanguage>('ja');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setError(null);

    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({ native_language: selected })
        .eq('user_id', user.id);

      if (updateError) {
        setError('保存に失敗しました。もう一度お試しください。');
        setSaving(false);
        return;
      }

      // Hard navigation to ensure fresh auth state
      window.location.href = redirect;
    } catch {
      setError('通信エラーが発生しました');
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-foreground)]">MERKEN</h1>
        <p className="text-[var(--color-foreground)] mt-4 font-medium">
          あなたの母語を選んでください
        </p>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Select your native language
        </p>
      </div>

      <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-soft border border-[var(--color-border)] p-6">
        {error && (
          <div className="bg-[var(--color-error-light)] text-[var(--color-error)] px-4 py-3 rounded-[var(--radius-lg)] mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.value}
              onClick={() => setSelected(lang.value)}
              className={`w-full flex items-center justify-between px-4 py-3 border rounded-[var(--radius-lg)] transition-all text-left ${
                selected === lang.value
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/50'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="text-2xl">{lang.flag}</span>
                <span className="font-semibold text-[var(--color-foreground)]">{lang.label}</span>
              </span>
              {selected === lang.value && (
                <Icon name="check" size={20} className="text-[var(--color-primary)]" />
              )}
            </button>
          ))}
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full mt-6"
          size="lg"
        >
          {saving ? (
            <>
              <Icon name="progress_activity" size={20} className="mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            '次へ'
          )}
        </Button>
      </div>
    </div>
  );
}

function LanguageSelectorFallback() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-foreground)]">MERKEN</h1>
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-soft border border-[var(--color-border)] p-6">
        <div className="flex items-center justify-center py-8">
          <Icon name="progress_activity" size={32} className="text-[var(--color-primary)] animate-spin" />
        </div>
      </div>
    </div>
  );
}

export default function OnboardingLanguagePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] p-4">
      <Suspense fallback={<LanguageSelectorFallback />}>
        <LanguageSelector />
      </Suspense>
    </div>
  );
}
