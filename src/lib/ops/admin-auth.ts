import { NextRequest, NextResponse } from 'next/server';

// /api/ops/* 共通のオペレーター認可。/ops の管理ページから送られる
// x-admin-secret ヘッダを環境変数 ADMIN_SECRET と比較する
// (/api/ops/api-costs と同じ方式)。認可NGならエラーレスポンスを返し、
// OKなら null を返す。ADMIN_SECRET はサーバー側でのみ参照し、
// クライアントコードには決して埋め込まないこと。

export function requireAdminSecret(request: NextRequest): NextResponse | null {
  const adminSecret = request.headers.get('x-admin-secret')?.trim();
  if (!adminSecret) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const expected = process.env.ADMIN_SECRET?.trim();
  if (!expected || adminSecret !== expected) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
