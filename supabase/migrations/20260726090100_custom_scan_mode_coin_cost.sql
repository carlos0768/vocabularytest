-- カスタム抽出モード（ユーザ定義プロンプト）のコイン単価: 3枚。
--
-- RATE TABLE — mirrored in src/lib/coins/rates.ts (SCAN_MODE_COIN_RATES.custom);
-- a contract test reads this migration file and asserts the literal matches.
-- Change both together.
--   custom = 3 （'all' / 'eiken' / 'idiom' と同じく1パス抽出のため同額）
--
-- シグネチャは 20260712101000_morphology_coin_cost.sql と同一なので
-- CREATE OR REPLACE のみ（DROP するとオーバーロードが増えて PostgREST の
-- RPC ディスパッチが曖昧になるリスクがあるため、引数は一切変えない）。

CREATE OR REPLACE FUNCTION public.scan_coin_cost(
  p_modes TEXT[],
  p_image_count INTEGER,
  p_include_morphology BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_cost INTEGER := 0;
  v_mode_cost INTEGER;
  v_mode TEXT;
BEGIN
  IF p_modes IS NULL OR array_length(p_modes, 1) IS NULL THEN
    RAISE EXCEPTION 'p_modes must not be empty';
  END IF;
  IF p_image_count IS NULL OR p_image_count < 1 THEN
    RAISE EXCEPTION 'p_image_count must be >= 1';
  END IF;

  FOR v_mode IN SELECT DISTINCT unnest(p_modes) LOOP
    v_mode_cost := CASE v_mode
      WHEN 'circled' THEN 2
      WHEN 'all'     THEN 3
      WHEN 'eiken'   THEN 3
      WHEN 'idiom'   THEN 3
      WHEN 'custom'  THEN 3
      ELSE NULL
    END;
    IF v_mode_cost IS NULL THEN
      RAISE EXCEPTION 'unknown scan mode: %', v_mode;
    END IF;
    v_cost := v_cost + v_mode_cost;
  END LOOP;

  RETURN v_cost + (p_image_count - 1)
    + (CASE WHEN COALESCE(p_include_morphology, FALSE) THEN 2 ELSE 0 END);
END;
$$;

NOTIFY pgrst, 'reload schema';
