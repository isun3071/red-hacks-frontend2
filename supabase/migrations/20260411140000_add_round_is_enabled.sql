-- Per-round enable/disable flag. Disabled rounds are skipped in the phase
-- computation (cursor doesn't advance for them) and their challenges are
-- not available to defend or attack. Lets admins granularly turn specific
-- rounds on and off without deleting them.

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT true;
