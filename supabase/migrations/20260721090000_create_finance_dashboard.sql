-- 財務ダッシュボード基盤 (/ops/finance)
--
-- 1. finance_fixed_costs — 固定費(Supabase・Vercel・Resend等の月額/年額/単発費用)を
--    財務担当が登録・管理するテーブル。ユーザーデータではないため
--    service_role のみアクセス可(認可は /api/ops/* の ADMIN_SECRET ゲートで行う)。
-- 2. 月次集計RPC — api_cost_events / coin_transactions をJST月単位でDB側集計する。
--    行を全件フェッチしてアプリ側で集計すると api_cost_events の増加に耐えられない
--    (既存ダッシュボードは20,000行キャップ)ため、集計はSQLに寄せる。

-- ============================================
-- 1. 固定費テーブル
-- ============================================

CREATE TABLE IF NOT EXISTS public.finance_fixed_costs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other' CHECK (category IN
                  ('infrastructure', 'database', 'ai_api', 'saas', 'payment', 'marketing', 'other')),
  vendor        TEXT,
  amount_jpy    NUMERIC(12, 2) NOT NULL CHECK (amount_jpy >= 0),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly', 'one_time')),
  -- 計上開始日。yearly は starts_on から12分割で月割按分、one_time は starts_on の属する月に全額計上する。
  starts_on     DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on       DATE CHECK (ends_on IS NULL OR ends_on >= starts_on),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_fixed_costs_starts_on
  ON public.finance_fixed_costs (starts_on);

-- updated_at trigger (shared helper from 001_initial_schema.sql)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_finance_fixed_costs_updated_at'
      AND tgrelid = 'public.finance_fixed_costs'::regclass
  ) THEN
    CREATE TRIGGER update_finance_fixed_costs_updated_at
      BEFORE UPDATE ON public.finance_fixed_costs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.finance_fixed_costs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'finance_fixed_costs'
      AND policyname = 'Service role can manage finance fixed costs'
  ) THEN
    CREATE POLICY "Service role can manage finance fixed costs"
      ON public.finance_fixed_costs FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- 2. 月次集計RPC (service_role 専用)
-- ============================================

-- AI API原価のJST月次集計 (api_cost_events.estimated_cost_* は記録時に単価表で計算済み)
CREATE OR REPLACE FUNCTION public.finance_monthly_ai_costs(p_from TIMESTAMPTZ)
RETURNS TABLE (
  month_key    TEXT,
  calls        BIGINT,
  failed_calls BIGINT,
  total_tokens BIGINT,
  cost_usd     NUMERIC,
  cost_jpy     NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    to_char(e.created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM'),
    COUNT(*)::BIGINT,
    (COUNT(*) FILTER (WHERE e.status = 'failed'))::BIGINT,
    COALESCE(SUM(e.total_tokens), 0)::BIGINT,
    COALESCE(SUM(e.estimated_cost_usd), 0),
    COALESCE(SUM(e.estimated_cost_jpy), 0)
  FROM public.api_cost_events e
  WHERE e.created_at >= p_from
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.finance_monthly_ai_costs(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_monthly_ai_costs(TIMESTAMPTZ) TO service_role;

-- AI API原価のプロバイダ/モデル別内訳 (期間合計)
CREATE OR REPLACE FUNCTION public.finance_ai_cost_breakdown(p_from TIMESTAMPTZ)
RETURNS TABLE (
  provider     TEXT,
  model        TEXT,
  calls        BIGINT,
  total_tokens BIGINT,
  cost_jpy     NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    e.provider,
    e.model,
    COUNT(*)::BIGINT,
    COALESCE(SUM(e.total_tokens), 0)::BIGINT,
    COALESCE(SUM(e.estimated_cost_jpy), 0)
  FROM public.api_cost_events e
  WHERE e.created_at >= p_from
  GROUP BY e.provider, e.model
  ORDER BY 5 DESC;
$$;

REVOKE ALL ON FUNCTION public.finance_ai_cost_breakdown(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_ai_cost_breakdown(TIMESTAMPTZ) TO service_role;

-- コインパック販売のJST月次集計。金額(円)はアプリ側で pack_id → 価格表
-- (src/lib/coins/packs.ts) を引いて換算する。
CREATE OR REPLACE FUNCTION public.finance_monthly_coin_pack_sales(p_from TIMESTAMPTZ)
RETURNS TABLE (
  month_key TEXT,
  pack_id   TEXT,
  provider  TEXT,
  purchases BIGINT,
  coins     BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    to_char(t.created_at AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM'),
    t.metadata->>'pack_id',
    t.provider,
    COUNT(*)::BIGINT,
    COALESCE(SUM(t.purchased_amount), 0)::BIGINT
  FROM public.coin_transactions t
  WHERE t.type = 'pack_purchase'
    AND t.created_at >= p_from
  GROUP BY 1, 2, 3
  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.finance_monthly_coin_pack_sales(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_monthly_coin_pack_sales(TIMESTAMPTZ) TO service_role;
