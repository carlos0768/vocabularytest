# 音読チャレンジ (Voice Quiz) — GCPだけで完結できるか調査

**調査日:** 2026-08-12
**関連実装:** `/voice-quiz/[projectId]`, `src/lib/speech/cloud-speech-to-text.ts`, `src/app/api/voice-quiz/recognize/route.ts`

## 結論

**はい、TTS（読み上げ）・STT（音声認識）ともにGCPの製品だけで完結できます。**
Google Cloud には `Text-to-Speech API` と `Speech-to-Text API` があり、どちらも同じGCPプロジェクト上でAPIキー1つで呼び出せます。今回の実装ではユーザーの要望（「精度を上げるためGCPを使ってほしい」）に沿って **音声認識(STT)をGCP Cloud Speech-to-Text に置き換え**ました。読み上げ(TTS)は当面ブラウザ内蔵のWeb Speech API (`speechSynthesis`) のままにしていますが、これも同じ理由でGCP Cloud Text-to-Speechに置き換え可能です（下記「TTSも GCP化する場合」を参照）。

## なぜブラウザ内蔵のWeb Speech APIだけでは不十分か

このリポジトリには既に `/quick-response`（即答チャレンジ）という、ブラウザ内蔵の `SpeechRecognition` / `webkitSpeechRecognition` を使った音声認識機能がありました。調査の結果、次の制約が判明しています。

1. **精度・対応がブラウザ依存**: `SpeechRecognition` はどのエンジンを使うか標準化されておらず、Chrome/Edgeは裏でGoogleの音声認識サーバーに接続する一方、Firefox は未対応、Brave はプライバシー保護のためAPIオブジェクトは存在するが実際には接続がブロックされる（`quick-response/page.tsx` に既にこの検出ロジックがある）。認識精度・対応言語・レイテンシがブラウザ・OSごとにバラつく。
2. **iOS Safari の standalone PWA では動作しない**: iOS 14.5以降、Safari自体は音声認識に対応しているが、ホーム画面に追加した **PWA(standalone)モードでは `SpeechRecognition` が機能しない**（オブジェクトは存在するが結果が返らない。マイク権限がPWAコンテキストで正しく機能しないことが原因とされる）。MERKENはPWAとして配布しているため、この制約は無視できない。
3. サーバー側で結果を検証・ログできない（クライアントで完結するAPIのため、誤答判定のロジックをサーバー側で一元管理・監査できない）。

一方、`getUserMedia` + `MediaRecorder` によるマイク録音は、iOS Safari standalone PWAでも問題なく動作する（ブロックされているのは `SpeechRecognition` オブジェクトの方であり、マイクアクセス自体ではない）。録音した音声をサーバーに送り、GCP側で認識させることで、この制約を回避できる。

## 採用したアーキテクチャ（今回の実装）

```
[フロントエンド]                         [サーバー / GCP]
1. 定型の出題文テンプレートに日本語訳を差し込み
   speechSynthesis (ブラウザTTS) で読み上げ
2. MediaRecorder でマイク音声を録音 (WEBM_OPUS)
3. 録音データをbase64化して
   POST /api/voice-quiz/recognize  ───────▶  Cloud Speech-to-Text
                                              (speech.googleapis.com)
                                              で音声→テキスト変換
4. 返ってきたtranscriptと正解英単語を照合   ◀───  { transcript, confidence }
5a. 不正解 & 試行回数が残っている
    → 「もう一回!」と読み上げて 2. へ戻る
5b. 正解 or 試行回数を使い切った → 確定
    正解英単語をspeechSynthesisで読み上げ
```

- 出題文の**枠は単語に依存しない**ので、`src/lib/quiz/voice-quiz-prompt.ts` に定型文を複数持たせ、問題ごとにローテーションさせながら日本語訳を差し込むだけにした。当初は単語ごとにAIで生成して `words.voice_quiz_prompt` にキャッシュする設計だったが、「〜という意味の単語、英語で何と言う?」という枠自体はどの単語でも共通であり、単語ごとに生成・保存する必要がないため取りやめた。結果として **AI呼び出しゼロ・DB列ゼロ（マイグレーション不要）・クイズ開始時の待ち時間ゼロ** になり、出題文が日本語訳のみから組み立てられるので英単語のスペルが漏れる経路も構造的に存在しない。
- **読み上げ(TTS)はフロントエンド**（ブラウザの`speechSynthesis`）のまま — ユーザーの要望どおり「単語の音声はフロントエンド側で生成」。
- **音声認識(STT)はGCP Cloud Speech-to-Text**（サーバー側、`GOOGLE_CLOUD_SPEECH_API_KEY`）に変更 — ブラウザ内蔵より精度・対応環境が安定する。

## GOOGLE_AI_API_KEY (Gemini) との違い

既存の `GOOGLE_AI_API_KEY` は Google AI Studio (`generativelanguage.googleapis.com`) のAPIキーで、Gemini専用。Cloud Speech-to-Text (`speech.googleapis.com`) は**別のGCPプロダクト**であり、以下が別途必要:

1. GCPプロジェクトで課金(billing)を有効化（Speech-to-Text/Text-to-Speechは従量課金。無料枠はあるが恒久無料ではない）
2. 「Cloud Speech-to-Text API」を有効化
3. APIキーを新規発行し、「Cloud Speech-to-Text API」のみに制限（IPリファラ制限はサーバー間通信のためAPI制限のみでよい）
4. `GOOGLE_CLOUD_SPEECH_API_KEY` としてVercel等の環境変数に設定

Gemini用のGCPプロジェクトと同じプロジェクトで有効化してよい（プロジェクトを分ける必要はない）。

## 料金

2026年8月時点の Google Cloud 公式料金ページ (cloud.google.com/speech-to-text/pricing, cloud.google.com/text-to-speech/pricing) より:

| API | 料金 | 無料枠 |
|---|---|---|
| Speech-to-Text (standard) | $0.006 / 15秒 | 月60分まで無料 |
| Speech-to-Text (enhanced) | $0.009 / 15秒 | 月60分まで無料 |
| Text-to-Speech (Standard/WaveNet) | $4 / 100万文字 | あり(モデルにより異なる) |
| Text-to-Speech (Neural2) | $16 / 100万文字 | あり |
| Text-to-Speech (Chirp 3 HD) | $30 / 100万文字 | あり |

音読チャレンジ1回の録音は最大6秒（15秒単位で課金されるため1回=15秒課金想定）。試行回数を2〜3回に設定すると1問で最大2〜3回の認識APIが走る点に注意。

日次上限は `AI_LIMIT_VOICE_QUIZ_FREE_DAILY` / `AI_LIMIT_VOICE_QUIZ_PRO_DAILY` (feature-usageの仕組みを流用) で管理しており、**問題数ではなく認識API呼び出し回数**でカウントされる。したがって試行回数3回設定なら1日に解ける問題数はその分減る。Free上限30回は 30×15秒=7.5分/日 で月の無料枠(60分)に収まる規模。

**Proは無制限** (`AI_LIMIT_VOICE_QUIZ_PRO_DAILY=0`)。`check_and_increment_feature_usage` は 0 以下の上限を「上限なし」として扱うため、回数では止まらない。利用回数の記録は従来どおり `feature_usage_daily` に残るので、実績は後から追える。参考までに、旧上限の300回相当で1日75分・$0.03/日程度。1人が1日中解き続けても数十セント規模なので、コスト面のリスクは小さいが、青天井である以上は `feature_usage_daily` の推移とGCPの予算アラート (`gcp-budget-guard`) で見張る前提とする。

## TTSもGCP化する場合（将来の拡張オプション）

現在はフロントエンドの `speechSynthesis` で日本語の出題文・英単語の発音を読み上げている。これをGCP Cloud Text-to-Speechに置き換えると:

**メリット**
- ボイス品質が安定する（ブラウザ内蔵ボイスは端末依存で音質・イントネーションにバラつきがある。特にAndroidの一部端末や日本語環境では英語の発音が不自然になりがち — `src/lib/speech.ts` の大量のワークアラウンドコメントがその証左）
- Chirp 3 HD 等の自然な音声を選べる（母親が読み上げるような自然な抑揚に近づけられる）
- 音声ファイルを事前生成してキャッシュ可能（出題文テンプレートは有限個なので、テンプレートの固定部分だけを先にMP3化しておく、といったキャッシュも効かせやすい）

**デメリット・実装コスト**
- 追加のAPI呼び出し・課金が発生する（前述の料金表参照。テキストは短いため実際のコストは小さい）
- 生成した音声ファイルの保存先（Supabase Storage等）と、再生成の要否判定（出題文が変わったら再生成)というキャッシュ管理が新たに必要
- オフライン再生ができなくなる可能性（ブラウザTTSは端末内で完結するが、事前生成した音声ファイルであればむしろオフラインでも再生できるため、キャッシュ設計次第ではこれはメリットにもなる）

**推奨**: 現時点ではブラウザTTSのままで十分（出題文はテキストが短く、多少の発音の癖があってもクイズの成立は妨げない）。今後「もっとナレーションを自然にしたい」という要望が出た場合に、Cloud TTSで音声ファイルを生成してキャッシュする方式への移行を検討するとよい。

## まとめ

| 要素 | 今回の実装 | GCPのみで完結させる場合 |
|---|---|---|
| 出題文のテキスト | 定型テンプレート（AI・DB不使用） | 該当なし（AIを使っていない） |
| 出題文の読み上げ(TTS) | ブラウザ `speechSynthesis`（フロントエンド、要望どおり） | Cloud Text-to-Speech に置換可能（未実装、将来オプション） |
| 回答の音声認識(STT) | **Cloud Speech-to-Text**（今回追加、サーバー側） | 実装済み |
| 正解の発音フィードバック | ブラウザ `speechSynthesis`（フロントエンド） | Cloud Text-to-Speech に置換可能（未実装、将来オプション） |

技術的には全工程をGCPプロダクトだけで完結させることが可能。今回は要望どおり「単語の音声はフロントエンド生成、認識精度はGCPで向上」というハイブリッド構成を採用した。
