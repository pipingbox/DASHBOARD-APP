CREATE UNIQUE INDEX pb_client_notification_source_once
  ON public.app_14da0f1941_notifications (user_id, type, actor_id, related_entity_id)
  WHERE type IN ('job_invitation', 'like', 'comment')
    AND actor_id IS NOT NULL AND related_entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.pb_create_client_notification(
  p_type text,
  p_title text,
  p_message text,
  p_related_entity_type text,
  p_related_entity_id text,
  p_action_url text,
  p_recipient_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source_id uuid;
  v_entity_id text := p_related_entity_id;
  v_entity_type text := p_related_entity_type;
  v_title text := p_title;
  v_message text := p_message;
  v_action_url text := p_action_url;
  v_new_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_type IS NULL OR p_type NOT IN ('like', 'comment', 'job_invitation', 'REFERRAL_JOINED', 'REFERRAL_VERIFIED') THEN
    RAISE EXCEPTION 'notification type is not client-creatable';
  END IF;

  IF p_recipient_id IS NULL OR p_recipient_id = v_actor THEN
    RAISE EXCEPTION 'recipient is missing or self notifications are not allowed';
  END IF;

  IF p_type IN ('like', 'comment', 'job_invitation') THEN
    IF p_related_entity_id IS NULL THEN
      RAISE EXCEPTION 'source id is required';
    END IF;
    v_source_id := p_related_entity_id::uuid;
    v_entity_id := v_source_id::text;

    IF p_type = 'job_invitation' THEN
      IF p_related_entity_type IS DISTINCT FROM 'job_invitation' THEN
        RAISE EXCEPTION 'invalid source kind';
      END IF;

      SELECT j.title, '/jobs'
        INTO v_title, v_action_url
        FROM public.app_14da0f1941_job_invitations AS invitation
        JOIN public.app_14da0f1941_jobs AS j ON j.id = invitation.job_id
        JOIN public.app_14da0f1941_profiles AS company ON company.user_id = invitation.company_user_id
        JOIN public.app_14da0f1941_profiles AS candidate ON candidate.user_id = invitation.candidate_user_id
       WHERE invitation.id = v_source_id
         AND invitation.company_user_id = v_actor
         AND invitation.candidate_user_id = p_recipient_id
         AND j.posted_by = v_actor
         AND j.company_user_id = v_actor
         AND j.status = 'open'
         AND (company.account_type = 'company' OR company.role = 'admin')
         AND candidate.account_type = 'worker'
       FOR SHARE OF invitation, j, company, candidate;
    ELSIF p_type = 'like' THEN
      IF p_related_entity_type IS DISTINCT FROM 'community_like' THEN
        RAISE EXCEPTION 'invalid source kind';
      END IF;

      SELECT post.title, '/community/' || channel.slug || '/post/' || post.id::text
        INTO v_title, v_action_url
        FROM public.app_14da0f1941_community_post_likes AS reaction
        JOIN public.app_14da0f1941_community_posts AS post ON post.id = reaction.post_id
        JOIN public.app_14da0f1941_community_channels AS channel ON channel.id = post.channel_id
       WHERE reaction.id = v_source_id
         AND reaction.user_id = v_actor
         AND post.user_id = p_recipient_id
         AND post.is_deleted = false
         AND channel.is_public = true
       FOR SHARE OF reaction, post, channel;
    ELSE
      IF p_related_entity_type IS DISTINCT FROM 'community_comment' THEN
        RAISE EXCEPTION 'invalid source kind';
      END IF;

      SELECT post.title, '/community/' || channel.slug || '/post/' || post.id::text
        INTO v_title, v_action_url
        FROM public.app_14da0f1941_community_comments AS entry
        JOIN public.app_14da0f1941_community_posts AS post ON post.id = entry.post_id
        JOIN public.app_14da0f1941_community_channels AS channel ON channel.id = post.channel_id
       WHERE entry.id = v_source_id
         AND entry.user_id = v_actor
         AND post.user_id = p_recipient_id
         AND entry.is_deleted = false
         AND post.is_deleted = false
         AND channel.is_public = true
       FOR SHARE OF entry, post, channel;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'no authorized source for notification';
    END IF;
    v_message := NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.app_14da0f1941_referrals AS referral
     WHERE referral.referrer_id = p_recipient_id
       AND referral.referred_id = v_actor
  ) THEN
    RAISE EXCEPTION 'no referral relationship authorizes notification';
  END IF;

  INSERT INTO public.app_14da0f1941_notifications (
    user_id, type, title, message, related_entity_type, related_entity_id,
    action_url, actor_id, actor_name, is_read
  ) VALUES (
    p_recipient_id, p_type, v_title, v_message, v_entity_type, v_entity_id,
    v_action_url, v_actor, NULL, false
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL AND p_type IN ('like', 'comment', 'job_invitation') THEN
    SELECT id INTO v_new_id
      FROM public.app_14da0f1941_notifications
     WHERE user_id = p_recipient_id AND type = p_type
       AND actor_id = v_actor AND related_entity_id = v_entity_id;
  END IF;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pb_create_client_notification(text,text,text,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pb_create_client_notification(text,text,text,text,text,text,uuid) TO authenticated;
