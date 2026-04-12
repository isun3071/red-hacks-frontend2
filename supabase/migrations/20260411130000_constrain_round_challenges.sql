-- Enforce two gameplay invariants on rounds:
-- 1. Every round must have at least one available challenge. Without this,
--    a round is effectively empty — teams can't defend or attack anything.
-- 2. required_defenses must leave at least one challenge attackable
--    (required_defenses <= n - 1 where n is the number of available
--    challenges). Otherwise a team that defends every required challenge
--    in the round has no legal attack target, which soft-locks the round.

ALTER TABLE public.rounds
  DROP CONSTRAINT IF EXISTS rounds_available_challenges_nonempty;

ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_available_challenges_nonempty
  CHECK (COALESCE(array_length(available_challenges, 1), 0) >= 1);

ALTER TABLE public.rounds
  DROP CONSTRAINT IF EXISTS rounds_required_defenses_leaves_attackable;

ALTER TABLE public.rounds
  ADD CONSTRAINT rounds_required_defenses_leaves_attackable
  CHECK (
    required_defenses >= 0
    AND required_defenses <= GREATEST(
      COALESCE(array_length(available_challenges, 1), 0) - 1,
      0
    )
  );
