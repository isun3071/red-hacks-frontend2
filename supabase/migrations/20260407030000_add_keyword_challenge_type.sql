DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'challenge_type'
      AND e.enumlabel = 'keyword'
  ) THEN
    ALTER TYPE public.challenge_type ADD VALUE 'keyword';
  END IF;
END;
$$;