-- PayPay 継続課金の照会キー (OrderID) を保持する。
--
-- GMO の取引照会API (SearchTrade) は **OrderID で引く**。結果通知も OrderID を
-- 運んでくるので、「通知 → 再照会 → どのユーザーか特定」の経路はすべて OrderID が軸になる。
-- OrderID はこちらが契約作成時に採番する値なので、採番した時点で行に残しておかないと
-- 通知が来ても誰の契約か分からない。
--
-- paypay_subscription_id (継続課金契約ID) とは別物なので列を分ける:
--  - paypay_order_id       : こちらが採番し、GMOへの照会キーになる
--  - paypay_subscription_id: GMO 側が採番する継続課金契約の識別子

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paypay_order_id TEXT;

-- 1つの OrderID が2人のユーザーに紐づくことはありえない。
-- 通知から user を一意に引くための土台なので一意制約で守る。
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_paypay_order_id_unique
  ON public.subscriptions (paypay_order_id)
  WHERE paypay_order_id IS NOT NULL;

-- Phase 1 では paypay_subscription_id を 'paypay' 行の必須項目にしていたが、
-- 実際の GMO の流れでは「OrderID を採番して決済ページへ送る」→「通知/照会で
-- 契約IDが判明する」の順になるため、契約IDが埋まる前に行が 'paypay' になる瞬間がある。
-- 必須条件を「OrderID か 契約ID のどちらかがある」に緩める。
-- どちらも無い 'paypay' 行は照会も解約もできない孤児なので、それは引き続き拒否する。
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_paypay_requires_subscription_id;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_paypay_requires_subscription_id
  CHECK (
    pro_source <> 'paypay'
    OR (
      paypay_provider IS NOT NULL
      AND (
        NULLIF(BTRIM(paypay_subscription_id), '') IS NOT NULL
        OR NULLIF(BTRIM(paypay_order_id), '') IS NOT NULL
      )
    )
  );
