import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-[var(--color-border-light)] rounded-full flex items-center justify-center mx-auto mb-6">
          <Icon name="search_off" size={32} className="text-[var(--color-muted)]" />
        </div>

        <h1 className="text-xl font-semibold text-[var(--color-foreground)] mb-2">
          ページが見つかりません
        </h1>

        <p className="text-[var(--color-muted)] text-sm mb-8">
          URLが間違っているか、ページが移動・削除された可能性があります。
        </p>

        <div className="grid gap-3">
          <Link href="/">
            <Button className="w-full" size="lg">
              ホームへ戻る
            </Button>
          </Link>
          <Link href="/settings">
            <Button className="w-full" size="lg" variant="secondary">
              設定へ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
