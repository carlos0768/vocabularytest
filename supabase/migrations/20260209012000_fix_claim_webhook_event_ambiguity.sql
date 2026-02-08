-- Fix ambiguous column reference in claim_webhook_event()

CREATE OR REPLACE FUNCTION public.claim_webhook_event(
  p_id TEXT,
  p_type TEXT,
  p_payload_hash TEXT,
  p_stale_after_seconds INTEGER DEFAULT 300
)
RETURNS TABLE (
  id TEXT,
  status TEXT,
  attempt_count INTEGER,
  should_process BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.webhook_events%ROWTYPE;
  v_inserted_count INTEGER := 0;
  v_stale_after INTERVAL := make_interval(secs => GREATEST(p_stale_after_seconds, 1));
BEGIN
  INSERT INTO public.webhook_events AS we (
    id,
    type,
    status,
    attempt_count,
    payload_hash,
    received_at,
    updated_at,
    processed_at,
    last_error
  )
  VALUES (
    p_id,
    p_type,
    'processing',
    1,
    p_payload_hash,
    NOW(),
    NOW(),
    NULL,
    NULL
  )
  ON CONFLICT ON CONSTRAINT webhook_events_pkey DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT *
  INTO v_row
  FROM public.webhook_events AS we
  WHERE we.id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'webhook event not found for id %', p_id;
  END IF;

  IF v_inserted_count > 0 THEN
    RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, TRUE;
    RETURN;
  END IF;

  IF v_row.status = 'processed' THEN
    RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, FALSE;
    RETURN;
  END IF;

  IF v_row.status = 'processing'
     AND v_row.updated_at >= NOW() - v_stale_after THEN
    RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, FALSE;
    RETURN;
  END IF;

  UPDATE public.webhook_events AS we
  SET
    type = COALESCE(NULLIF(p_type, ''), v_row.type),
    status = 'processing',
    attempt_count = COALESCE(v_row.attempt_count, 0) + 1,
    payload_hash = COALESCE(NULLIF(p_payload_hash, ''), v_row.payload_hash),
    processed_at = NULL,
    last_error = NULL,
    updated_at = NOW()
  WHERE we.id = p_id
  RETURNING * INTO v_row;

  RETURN QUERY SELECT v_row.id, v_row.status, v_row.attempt_count, TRUE;
END;
$$;
