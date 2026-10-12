/**
 * GMO PG (PayPay継続課金) 疎通・取引照会 QA スクリプト
 *
 * 用途は2つ:
 *
 *  1. 疎通確認（決済なしで実行可）
 *       npx tsx scripts/qa-gmo-paypay.ts
 *     存在しない OrderID で SearchTrade を叩き、GMO が業務エラーを返すことを確認する。
 *     ここまで通れば「エンドポイント到達・資格情報・応答パーサ」が揃っている。
 *
 *  2. 実取引の照会（テスト決済を1件通したあと）
 *       npx tsx scripts/qa-gmo-paypay.ts --order <OrderID>
 *     応答の**全キー**を出力する。これで未確定だった項目がまとめて判明する:
 *       - Status の実値            → spec.ts の GMO_STATUS_TO_NOTIFICATION_TYPE
 *       - 継続課金契約IDの項目名   → spec.ts の GMO_NOTIFICATION_FIELDS.recurringId
 *       - SearchTrade で PayPay の取引が引けるか（引けなければ --api SearchTradeMulti）
 *
 *     結果通知やIP許可リストを待たずに確認できる。通知経路は「誰のどの契約か」を
 *     引き当てるために要るが、Status の語彙を知るだけならこちらで足りる。
 *
 * オプション:
 *   --order <OrderID>   照会する取引。省略時は存在しないIDで疎通確認のみ
 *   --api <名前>        既定 SearchTrade。PayPay が引けないとき SearchTradeMulti を試す
 *   --paytype <コード>  SearchTradeMulti 用の PayType
 *
 * 必要な環境変数（.env.local を自動で読む）:
 *   GMO_API_BASE_URL / GMO_SHOP_ID / GMO_SHOP_PASS / GMO_SITE_ID / GMO_SITE_PASS
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getGmoConfig, GmoConfigError } from '../src/lib/paypay/gmo/config';
import { callGmoApi, GmoTransportError } from '../src/lib/paypay/gmo/client';
import { GmoApiError } from '../src/lib/paypay/gmo/response';

// .env.local を読む。tsx は Next.js と違って自動では読まない。
function loadEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.warn('[qa-gmo] .env.local が見つかりません。既存の環境変数のみで続行します。');
    return;
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i++;
    } else {
      args[key] = 'true';
    }
  }
  return args;
}

loadEnvLocal();

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const apiName = args.api ?? 'SearchTrade';
  // 実在しないことが明らかなIDで疎通だけ確かめる
  const orderId = args.order ?? `qa-nonexistent-${Date.now()}`;
  const isConnectivityOnly = args.order === undefined;

  let config;
  try {
    config = getGmoConfig();
  } catch (error) {
    if (error instanceof GmoConfigError) {
      console.error(`❌ 設定不足: ${error.message}`);
      console.error('   .env.local に GMO_API_BASE_URL / GMO_SHOP_ID / GMO_SHOP_PASS /');
      console.error('   GMO_SITE_ID / GMO_SITE_PASS を設定してください。');
      return 1;
    }
    throw error;
  }

  console.log('=== GMO PayPay QA ===');
  console.log(`endpoint : ${config.baseUrl}/payment/${apiName}.idPass`);
  console.log(`shopId   : ${config.shopId}`);
  // ShopPass / SitePass は出力しない（ログ・スクショ経由の漏洩を防ぐ）
  console.log(`orderId  : ${orderId}${isConnectivityOnly ? '  (疎通確認用の架空ID)' : ''}`);
  console.log('');

  try {
    const body = await callGmoApi(
      apiName,
      {
        ShopID: config.shopId,
        ShopPass: config.shopPass,
        OrderID: orderId,
        ...(args.paytype ? { PayType: args.paytype } : {}),
      },
      config
    );

    console.log('--- 応答の全キー ---');
    for (const [key, value] of Object.entries(body)) {
      console.log(`  ${key} = ${value}`);
    }
    console.log('');

    if (isConnectivityOnly) {
      console.log('⚠️  架空の OrderID なのに成功応答が返りました。想定外です。');
      console.log('    --order に実在の取引IDを渡して照会してください。');
      return 0;
    }

    console.log('--- spec.ts に入れる値 ---');
    console.log(`  Status の実値: ${body.Status ?? '(なし)'}`);
    console.log('    → GMO_STATUS_TO_NOTIFICATION_TYPE にこの値を追加');

    const recurringCandidates = Object.keys(body).filter((key) =>
      /recur|regist|subscription|contract|tran/i.test(key)
    );
    console.log(
      `  契約IDらしき項目: ${recurringCandidates.length > 0 ? recurringCandidates.join(', ') : '(該当なし)'}`
    );
    console.log('    → GMO_NOTIFICATION_FIELDS.recurringId に項目名を設定');
    console.log(`  Amount: ${body.Amount ?? '(なし)'} (Pro月額 300 と一致する必要あり)`);
    return 0;
  } catch (error) {
    if (error instanceof GmoApiError) {
      console.log('--- GMO 業務エラー (HTTP 200 で返る) ---');
      for (const detail of error.errors) {
        console.log(`  ErrCode=${detail.errCode}  ErrInfo=${detail.errInfo}`);
      }
      console.log('');
      if (isConnectivityOnly) {
        console.log('✅ 疎通OK。エンドポイント到達・資格情報・応答パーサが機能しています。');
        console.log('   （架空の OrderID なのでエラーが返るのが正しい挙動）');
        console.log('');
        console.log('   次: テスト決済を1件通し、--order <OrderID> で照会してください。');
        return 0;
      }
      console.log('❌ 実在の OrderID のはずがエラーです。考えられる原因:');
      console.log('   - OrderID の綴り違い');
      console.log('   - PayPay の取引が SearchTrade では引けない');
      console.log('     → --api SearchTradeMulti --paytype <コード> を試す');
      console.log('   - テスト環境と本番環境の取り違え (GMO_API_BASE_URL)');
      return 1;
    }

    if (error instanceof GmoTransportError) {
      console.error('❌ 通信失敗（結果不明。取引が成立している可能性あり）');
      console.error(`   ${error.message}`);
      console.error('');
      console.error('   GMO_API_BASE_URL が正しいか、送信元IPがGMO側で許可されているか確認。');
      console.error('   GMO は接続元IPの事前申請が必要な場合があります。');
      return 1;
    }

    console.error('❌ 想定外のエラー:', error);
    return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('❌ 想定外のエラー:', error);
    process.exit(1);
  });
