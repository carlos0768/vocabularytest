-- フォロー通知を1件ずつ保存するテーブル。
--
-- これまで通知は user_follows の行から毎回組み立てていたため、既読になると消え、
-- フォローが外れると通知ごと無くなっていた。通知を独立した行として残し、
-- 受け取った人ごとに新しい順で10件までに保つ（11件目が入ったら古いものを削除する）。
--
-- ただし未対応のフォローリクエスト（相手の user_follows がまだ pending のもの）は
-- 承認・削除がこの通知からしかできないので、10件の枠を超えても削除しない。
-- src/lib/follows/server.ts の FOLLOW_NOTIFICATION_LIMIT / selectFollowNotifications と同じ規則。

CREATE TABLE IF NOT EXISTS public.follow_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 通知を受け取る人（フォローされた側）
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- フォローした人
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- フォローが外れても通知は残すので、元の行が消えたら NULL にするだけ
  follow_id UUID REFERENCES public.user_follows(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  read_at TIMESTAMPTZ,
  CONSTRAINT follow_notifications_kind_check CHECK (kind IN ('follow', 'follow_request'))
);

CREATE INDEX IF NOT EXISTS follow_notifications_user_created_idx
  ON public.follow_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS follow_notifications_follow_idx
  ON public.follow_notifications (follow_id);

ALTER TABLE public.follow_notifications ENABLE ROW LEVEL SECURITY;

-- 読むのは本人だけ。書き込みはトリガーとサーバー（service role）だけが行う
DROP POLICY IF EXISTS "follow_notifications_select_own" ON public.follow_notifications;
CREATE POLICY "follow_notifications_select_own"
  ON public.follow_notifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 受け取った人の通知を新しい順で10件に保つ。未対応のフォローリクエストは件数に関係なく残し、
-- 残りの枠（10 - 未対応リクエスト数）を新しい順の履歴で埋め、はみ出した履歴を削除する
CREATE OR REPLACE FUNCTION public.prune_follow_notifications(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH classified AS (
    SELECT
      n.id,
      n.created_at,
      (
        n.kind = 'follow_request'
        AND EXISTS (
          SELECT 1
          FROM public.user_follows f
          WHERE f.id = n.follow_id
            AND f.status = 'pending'
        )
      ) AS is_open_request
    FROM public.follow_notifications n
    WHERE n.user_id = p_user_id
  ),
  history AS (
    SELECT
      c.id,
      row_number() OVER (ORDER BY c.created_at DESC, c.id DESC) AS rn
    FROM classified c
    WHERE NOT c.is_open_request
  )
  DELETE FROM public.follow_notifications n
  USING history h
  WHERE n.id = h.id
    AND h.rn > GREATEST(0, 10 - (SELECT count(*) FROM classified WHERE is_open_request));
END;
$$;

REVOKE ALL ON FUNCTION public.prune_follow_notifications(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prune_follow_notifications_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.prune_follow_notifications(NEW.user_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prune_follow_notifications_after_insert
  ON public.follow_notifications;
CREATE TRIGGER prune_follow_notifications_after_insert
  AFTER INSERT ON public.follow_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.prune_follow_notifications_after_insert();

-- フォローされたら通知を1件作る。アプリのどの経路から user_follows に入っても漏れないよう DB 側で行う
CREATE OR REPLACE FUNCTION public.create_follow_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.follow_notifications (user_id, actor_id, follow_id, kind, created_at)
  VALUES (
    NEW.following_id,
    NEW.follower_id,
    NEW.id,
    CASE WHEN NEW.status = 'pending' THEN 'follow_request' ELSE 'follow' END,
    NEW.created_at
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS create_follow_notification_after_insert
  ON public.user_follows;
CREATE TRIGGER create_follow_notification_after_insert
  AFTER INSERT ON public.user_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.create_follow_notification();

-- 未対応のリクエストが消えた（削除された・相手が取り消した）ら、その通知も消す。
-- 承認済みのフォローが外れた場合の通知は残す（follow_id が NULL になるだけ）
CREATE OR REPLACE FUNCTION public.delete_pending_follow_request_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'pending' THEN
    DELETE FROM public.follow_notifications
    WHERE follow_id = OLD.id
      AND kind = 'follow_request';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS delete_pending_follow_request_notification_before_delete
  ON public.user_follows;
CREATE TRIGGER delete_pending_follow_request_notification_before_delete
  BEFORE DELETE ON public.user_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_pending_follow_request_notification();

REVOKE ALL ON FUNCTION public.prune_follow_notifications_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_follow_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_pending_follow_request_notification() FROM PUBLIC, anon, authenticated;

-- 既存のフォローから通知を作っておく（既読状態も引き継ぐ）。受け取った人ごとに
-- 新しい順で10件まで。未対応のリクエストは枠に関係なく全部入れる
INSERT INTO public.follow_notifications (user_id, actor_id, follow_id, kind, created_at, read_at)
SELECT
  ranked.following_id,
  ranked.follower_id,
  ranked.id,
  CASE WHEN ranked.status = 'pending' THEN 'follow_request' ELSE 'follow' END,
  ranked.created_at,
  ranked.following_read_at
FROM (
  SELECT
    f.*,
    row_number() OVER (PARTITION BY f.following_id ORDER BY f.created_at DESC, f.id DESC) AS rn
  FROM public.user_follows f
  WHERE f.status IN ('active', 'pending')
) ranked
WHERE (ranked.rn <= 10 OR ranked.status = 'pending')
  AND NOT EXISTS (
    SELECT 1
    FROM public.follow_notifications existing
    WHERE existing.follow_id = ranked.id
  );
