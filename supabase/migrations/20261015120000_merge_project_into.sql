-- 単語帳ごと別の単語帳に統合する。
--
-- 統合元の語を統合先へ「移す」(コピーではない): 語の行はそのまま project_id を
-- 付け替えるので、SM-2 の進み具合・習得レベル・お気に入り・語義 (word_translations は
-- word_id で紐づく) が全部残る。移した語は統合元の単語帳名のセクションに入れ、
-- 統合先の section_names の末尾に足す。最後に統合元を消す。
--
-- 1回の呼び出しで1トランザクションなので、途中で失敗すれば何も変わらない
-- (語だけ移って統合元が残る / 統合元だけ消えて語が消える、が起きない)。
-- SECURITY INVOKER なので RLS (Cloud writers の update/delete) もそのまま効く。
-- 所有者・同じ単語帳・種別 (english / classical) の検査は関数の中で行う。
CREATE OR REPLACE FUNCTION public.merge_project_into(
  p_source_project_id uuid,
  p_target_project_id uuid,
  p_section_name text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_source_kind text;
  v_target_kind text;
  v_section text;
  v_moved integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_source_project_id IS NULL OR p_target_project_id IS NULL
     OR p_source_project_id = p_target_project_id THEN
    RAISE EXCEPTION 'invalid merge target' USING ERRCODE = '22023';
  END IF;

  v_section := left(nullif(btrim(regexp_replace(coalesce(p_section_name, ''), '\s+', ' ', 'g')), ''), 40);
  IF v_section IS NULL THEN
    RAISE EXCEPTION 'section name is required' USING ERRCODE = '22023';
  END IF;

  -- 2冊とも行ロックしてから読む (同時に別の統合・削除が走っても食い違わない)
  SELECT coalesce(kind, 'english') INTO v_source_kind
    FROM projects
   WHERE id = p_source_project_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'source wordbook not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT coalesce(kind, 'english') INTO v_target_kind
    FROM projects
   WHERE id = p_target_project_id AND user_id = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target wordbook not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_source_kind <> v_target_kind THEN
    RAISE EXCEPTION 'wordbook kinds differ' USING ERRCODE = '22023';
  END IF;

  -- updated_at を進めるのは、他の端末の差分同期 (_deltaSync) に移った語を拾わせるため
  UPDATE words
     SET project_id = p_target_project_id,
         section_name = v_section,
         updated_at = now()
   WHERE project_id = p_source_project_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE projects
     SET section_names = CASE
           WHEN v_section = ANY(coalesce(section_names, '{}')) THEN section_names
           ELSE array_append(coalesce(section_names, '{}'), v_section)
         END,
         updated_at = now()
   WHERE id = p_target_project_id;

  DELETE FROM projects WHERE id = p_source_project_id;

  RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_project_into(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_project_into(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.merge_project_into(uuid, uuid, text) IS
  '統合元の単語帳の語を統合先へ移し (統合元の名前のセクションに入れる)、統合元を消す。';
