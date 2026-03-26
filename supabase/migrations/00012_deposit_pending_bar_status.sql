-- Migration: Support pending_bar status for deposit 2-step flow
-- Staff creates deposit → pending_bar (bar must confirm)
-- Customer requests deposit → pending (staff claims) → pending_bar (bar confirms)

-- Update claim_action_card to also accept pending_bar status
CREATE OR REPLACE FUNCTION claim_action_card(p_message_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages; v_meta JSONB; v_profile RECORD;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Message not found'); END IF;
  IF v_msg.type != 'action_card' THEN RETURN jsonb_build_object('success', false, 'error', 'Not an action card'); END IF;
  v_meta := v_msg.metadata;
  IF v_meta->>'status' = 'claimed' AND is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  END IF;
  -- Allow claiming from both 'pending' and 'pending_bar' status
  IF v_meta->>'status' NOT IN ('pending', 'pending_bar') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed', 'claimed_by', v_meta->>'claimed_by_name');
  END IF;
  SELECT display_name, username INTO v_profile FROM public.profiles WHERE id = p_user_id;
  v_meta := v_meta || jsonb_build_object('status', 'claimed', 'claimed_by', p_user_id, 'claimed_by_name', COALESCE(v_profile.display_name, v_profile.username), 'claimed_at', now(), 'auto_released', null, 'auto_released_at', null);
  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Update release_action_card to restore correct status (pending vs pending_bar)
CREATE OR REPLACE FUNCTION release_action_card(p_message_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages; v_meta JSONB; v_original_status TEXT;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Message not found'); END IF;
  v_meta := v_msg.metadata;
  IF v_meta->>'status' = 'claimed' AND is_action_card_timed_out(v_meta) THEN
    v_meta := auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
    RETURN jsonb_build_object('success', true, 'metadata', v_meta);
  END IF;
  IF v_meta->>'claimed_by' != p_user_id::text THEN RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you'); END IF;
  -- Restore to pending_bar if _bar_step is set, otherwise pending
  v_original_status := CASE WHEN (v_meta->>'_bar_step')::boolean IS TRUE THEN 'pending_bar' ELSE 'pending' END;
  v_meta := v_meta || jsonb_build_object('status', v_original_status, 'claimed_by', null, 'claimed_by_name', null, 'claimed_at', null, 'released_by', p_user_id, 'released_at', now(), '_bar_step', null);
  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
