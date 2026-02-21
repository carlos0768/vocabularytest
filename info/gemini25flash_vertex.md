# Vertex AI 経由 Gemini 2.5 Flash — 料金 & レート制限まとめ

> Google Cloud 公式ドキュメントに基づく（2026年2月時点）

---

## 💰 API 料金（Vertex AI）

| 項目 | 料金（1Mトークンあたり） | 備考 |
|------|--------------------------|------|
| テキスト入力（≤200K tokens） | **$0.30** | コンテキスト長に関わらず定額 |
| テキスト出力 | **$2.50** | Thinkingトークンも合算 |
| 音声入力 | **$1.00** | テキストの約3.3倍 |
| バッチAPI（非リアルタイム） | **通常の50%オフ** | 非同期処理の場合に適用 |

**注意事項**
- Flashモデルはコンテキスト長に関係なく定額（ProのようにProのように200K超で2倍にはならない）
- HTTP 200（成功）レスポンスのみ課金。4xx / 5xx エラーは課金なし
- PDF は画像入力として課金（1ページ = 1画像分）
- Thinkingトークンは出力トークンと合算して課金

---

## ⚡ レート制限（Standard PayGo）

Vertex AI は Gemini 2.0 以降、**Standard PayGo（使用量ティア制）** を採用。  
組織の**過去30日間の Vertex AI 総支出**に応じてティアが自動昇格する。

| ティア | ベーススループット（TPM） | 備考 |
|--------|--------------------------|------|
| Tier 1（デフォルト） | 動的共有プール | 課金開始直後のデフォルト |
| Tier 2 | 中程度 | 一定額以上の月間支出で自動昇格 |
| Tier 3 | **10,000,000 TPM** | 高額支出組織向け |

**注意事項**
- ティアごとの個別 RPM 上限はない
- ただしシステム上限として **30,000 RPM / モデル / リージョン** が絶対上限
- 429 エラーは固定クォータ超過ではなく「一時的な共有リソースの競合」を示す場合が多い → **指数バックオフによるリトライ**を実装すること
- ティアはプロジェクト単位ではなく**組織単位**で適用
- Gemini 2.5 Flash と Gemini 2.0 Flash の TPM はそれぞれ**独立してカウント**

---

## 🔍 Vertex AI vs Gemini Developer API

| 比較項目 | Vertex AI | Gemini Developer API |
|----------|-----------|----------------------|
| 対象 | エンタープライズ | 開発者・個人 |
| フリー枠 | なし（課金必須） | あり（レート制限付き） |
| データ利用 | 学習に使用されない | フリー枠では使用の可能性あり |
| 最大 RPM 上限 | 30,000 RPM / モデル / リージョン | 〜10 RPM（Free Tier） |
| 主な追加機能 | VPC, IAM, データレジデンシー | なし |

---

## ✅ 実務上のポイント

- リアルタイム処理・大量トークンを扱う場合は Vertex AI Standard PayGo が適切
- スループット SLA が厳しい本番環境は **Provisioned Throughput**（事前購入型）も検討
- 大量コール想定時はティア昇格のために**組織レベルでの支出管理**が重要
- 429 エラー対策として**指数バックオフのリトライ実装**は必須
- バッチ処理可能なタスクはバッチ API で **50% コスト削減**

---

## 📎 公式参照リンク

| ドキュメント | URL |
|-------------|-----|
| 料金 | https://cloud.google.com/vertex-ai/generative-ai/pricing |
| クォータ・レート制限 | https://cloud.google.com/vertex-ai/generative-ai/docs/quotas |
| Standard PayGo | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/standard-paygo |
| モデル仕様 | https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash |
