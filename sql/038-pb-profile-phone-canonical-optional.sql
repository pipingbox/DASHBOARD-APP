ALTER TABLE public.app_14da0f1941_profiles
  ADD COLUMN IF NOT EXISTS phone_e164 text,
  ADD COLUMN IF NOT EXISTS phone_country_code text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_profile_phone_e164_format'
                 AND conrelid = 'public.app_14da0f1941_profiles'::regclass) THEN
    ALTER TABLE public.app_14da0f1941_profiles
      ADD CONSTRAINT pb_profile_phone_e164_format
      CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_profile_phone_country_consistency'
                 AND conrelid = 'public.app_14da0f1941_profiles'::regclass) THEN
    ALTER TABLE public.app_14da0f1941_profiles
      ADD CONSTRAINT pb_profile_phone_country_consistency
      CHECK ((phone_e164 IS NULL AND phone_country_code IS NULL)
          OR (phone_e164 IS NOT NULL AND phone_country_code ~ '^[A-Z]{2}$'));
  END IF;
END $$;

COMMENT ON COLUMN public.app_14da0f1941_profiles.phone_e164 IS
  'Optional contact phone, E.164 with leading +. Owner-editable; owner/admin RLS on profiles. Not a Marketplace Ready gate and not permission for SMS/WhatsApp.';
COMMENT ON COLUMN public.app_14da0f1941_profiles.phone_country_code IS
  'Country used to normalize phone_e164. Both columns change together; verification and marketing consent are separate features.';
