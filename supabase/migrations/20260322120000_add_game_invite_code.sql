-- Add invite_code to games so players can join games by code
-- Uses 6-character uppercase hex codes to match existing UI expectations.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS invite_code TEXT;

-- Backfill existing rows that do not yet have an invite code.
UPDATE games
SET invite_code = upper(substr(md5(id::text || clock_timestamp()::text || random()::text), 1, 6))
WHERE invite_code IS NULL;

-- Ensure future rows always get a code when one is not provided.
ALTER TABLE games
  ALTER COLUMN invite_code SET DEFAULT upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text), 1, 6));

-- Enforce integrity for game invite workflow.
ALTER TABLE games
  ALTER COLUMN invite_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'games_invite_code_unique'
  ) THEN
    CREATE UNIQUE INDEX games_invite_code_unique ON games(invite_code);
  END IF;
END $$;
