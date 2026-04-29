-- 00033_profiles_last_sign_in.sql
--
-- Cache `auth.users.last_sign_in_at` into `profiles` so the users list
-- can display it without service-role queries. A trigger on auth.users
-- keeps the cache fresh on every successful sign-in.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION sync_profile_last_sign_in()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    UPDATE public.profiles
    SET last_sign_in_at = NEW.last_sign_in_at
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_signin ON auth.users;
CREATE TRIGGER on_auth_user_signin
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_profile_last_sign_in();

-- Backfill from existing auth.users data
UPDATE public.profiles p
SET last_sign_in_at = u.last_sign_in_at
FROM auth.users u
WHERE u.id = p.id AND u.last_sign_in_at IS NOT NULL;
