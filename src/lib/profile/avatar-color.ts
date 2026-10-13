// Site-wide avatar/thumbnail palette (matches home, collections, shared, feed, stats).
// プロフィール画面とシェア画像(opengraph-image)で同じ色を出すため、
// クライアント専用ではないこのモジュールに置く。
import { thumbColor } from '@/lib/ui/thumb-color';

export const profileAvatarColor = thumbColor;
