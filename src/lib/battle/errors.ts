/**
 * 対戦まわりの共通エラー。`server.ts` と `entitlement.ts` の両方から使うので、
 * 循環 import にならないようここに置いて双方から読む（`server.ts` は後方互換の
 * ために再 export している）。
 */
export class BattleError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly userMessage: string,
    /**
     * 元になった DB エラー。ログにだけ出し、利用者には見せない。
     * これが無いと「対戦ルームの取得に失敗しました」だけが残り、どの列・
     * どのテーブルで落ちたのか後から追えない（`battleErrorResponse` が出す）。
     */
    readonly detail?: unknown,
  ) {
    super(code);
    this.name = 'BattleError';
  }
}
