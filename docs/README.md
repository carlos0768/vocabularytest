# Docs Entry Point

このリポジトリでAIまたは人間が作業を始める時の入口です。

## 作業前に読む順番

1. `docs/README.md`（このファイル）
2. `docs/maintenance/AI_HANDOFF.md`
3. 作業対象に近い恒久docsまたはrunbook
4. 実コード

矛盾した場合は、実コード、`docs/README.md`、該当runbook、古い調査メモの順に確認してください。

## 現在の最重要方針

- `codex/prelaunch-safety-baseline` は古い `main` 由来なので、今後の公開前作業には使いません。
- 最新UIを守るため、作業ブランチは `codex/prelaunch-safety-baseline-current-ui` を使います。
- 旧ブランチの56コミットを丸ごとcherry-pickしません。
- 旧ブランチの保守性向上作業は、最新UIを守った状態でこのブランチへ再実装済みです。
- `docs/maintenance/*CHECKPOINT.md` やaudit系docsは、旧ブランチでの完了記録を含みます。最新UIブランチでの現在地は、`docs/maintenance/AI_HANDOFF.md` と `docs/maintenance/TASKS.md` を正としてください。
- `src/components/redesign/**` と `src/app/globals.css` は原則変更しません。Home/Project/Quizを触る場合も、最新UIの見た目・文言・レイアウトを巻き戻さないことを最優先にします。

## 恒久情報

- `docs/architecture.md`: システム構成と主要データフロー
- `docs/boundaries.md`: 触ってよい領域と危険領域
- `docs/invariants.md`: 破ってはいけない不変条件
- `docs/commands.md`: コマンド一覧
- `docs/runbooks.md`: 運用runbook入口
- `docs/ops/`: 障害対応、外部サービス、運用手順
- `docs/security/`: セキュリティ確認

## 工事中の一時情報

- `docs/maintenance/AI_HANDOFF.md`: 次のAIが最初に読む引き継ぎ
- `docs/maintenance/TASKS.md`: 公開前タスクの現在地
- `docs/maintenance/PRELAUNCH_RELEASE_CHECKLIST.md`: 公開判断前の最終チェックリスト
- `docs/maintenance/MAIN_PUSH_RELEASE_NOTES_2026-05-10.md`: 2026-05-10にmainへ入った変更範囲と本番投入前の注意点
- `docs/maintenance/ARCHITECTURE_MAINTAINABILITY_AUDIT.md`: 大局的な保守性棚卸し
- `docs/maintenance/REFACTOR_PLAN.md`: 旧P2-Cの分解計画
- `docs/maintenance/P2C_CHECKPOINT.md`: 旧P2-C完了後の固定済みcontractと残リスク
- `docs/maintenance/SCAN_PROCESS_CHECKPOINT.md`: 旧scan process追加分割後の状態
- `docs/maintenance/HOME_PAGE_AUDIT.md`, `docs/maintenance/PROJECT_PAGE_AUDIT.md`, `docs/maintenance/QUIZ_PAGE_AUDIT.md`: UI隣接巨大ファイルの棚卸し

`maintenance/` は作業中のホワイトボードです。恒久化すべき内容は後続作業で正式docsへ移します。
