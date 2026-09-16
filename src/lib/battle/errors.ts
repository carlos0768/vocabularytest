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
  ) {
    super(code);
    this.name = 'BattleError';
  }
}
