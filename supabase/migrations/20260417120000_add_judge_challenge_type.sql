-- Add the `judge` challenge type: semantic challenges where a separate
-- LLM judge evaluates the transcript against a rubric and returns a
-- coefficient (0.00, 0.25, 0.50, 0.75, 1.00) that scales the base steal.
-- Also supports an `escalate` verdict for ambiguous cases, routed to
-- admin review via /admin/escalations.

ALTER TYPE challenge_type ADD VALUE IF NOT EXISTS 'judge';

-- Judge configuration on the challenge
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS judge_rubric JSONB,
  ADD COLUMN IF NOT EXISTS judge_model TEXT;

-- Judge outcome + escrow state on each attack row
ALTER TABLE public.attacks
  ADD COLUMN IF NOT EXISTS judge_verdict TEXT,
  ADD COLUMN IF NOT EXISTS judge_coefficient NUMERIC,
  ADD COLUMN IF NOT EXISTS judge_reason TEXT,
  ADD COLUMN IF NOT EXISTS escalation_status TEXT,
  ADD COLUMN IF NOT EXISTS escrow_amount INT,
  ADD COLUMN IF NOT EXISTS escrow_snapshot JSONB;

-- Keep the verdict column tidy with a known set of values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attacks_judge_verdict_check'
  ) THEN
    ALTER TABLE public.attacks
      ADD CONSTRAINT attacks_judge_verdict_check
      CHECK (judge_verdict IS NULL OR judge_verdict IN (
        'none', 'structural', 'partial', 'substantial', 'full', 'escalate'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attacks_escalation_status_check'
  ) THEN
    ALTER TABLE public.attacks
      ADD CONSTRAINT attacks_escalation_status_check
      CHECK (escalation_status IS NULL OR escalation_status IN ('pending', 'resolved'));
  END IF;
END $$;
