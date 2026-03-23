-- Introduce team-coin economy for challenge rewards and attack steals.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS defense_reward_coins INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attack_steal_coins INT NOT NULL DEFAULT 0;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS coins INT NOT NULL DEFAULT 0;

ALTER TABLE public.defended_challenges
  ADD COLUMN IF NOT EXISTS defense_reward_granted BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'challenges_defense_reward_coins_nonnegative'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_defense_reward_coins_nonnegative
      CHECK (defense_reward_coins >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'challenges_attack_steal_coins_nonnegative'
  ) THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_attack_steal_coins_nonnegative
      CHECK (attack_steal_coins >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'teams_coins_nonnegative'
  ) THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_coins_nonnegative
      CHECK (coins >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_attack_coins(
  p_attacker_team_id UUID,
  p_defender_team_id UUID,
  p_challenge_id UUID
)
RETURNS TABLE (
  stolen_coins INT,
  attacker_coins INT,
  defender_coins INT,
  defender_eliminated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attacker_coins INT;
  v_defender_coins INT;
  v_requested_steal INT;
  v_stolen_coins INT;
BEGIN
  IF p_attacker_team_id IS NULL OR p_defender_team_id IS NULL OR p_challenge_id IS NULL THEN
    RAISE EXCEPTION 'attacker team id, defender team id, and challenge id are required';
  END IF;

  IF p_attacker_team_id = p_defender_team_id THEN
    RAISE EXCEPTION 'attacker and defender cannot be the same team';
  END IF;

  SELECT coins INTO v_attacker_coins
  FROM public.teams
  WHERE id = p_attacker_team_id
  FOR UPDATE;

  IF v_attacker_coins IS NULL THEN
    RAISE EXCEPTION 'attacker team not found';
  END IF;

  SELECT coins INTO v_defender_coins
  FROM public.teams
  WHERE id = p_defender_team_id
  FOR UPDATE;

  IF v_defender_coins IS NULL THEN
    RAISE EXCEPTION 'defender team not found';
  END IF;

  SELECT attack_steal_coins INTO v_requested_steal
  FROM public.challenges
  WHERE id = p_challenge_id;

  IF v_requested_steal IS NULL THEN
    RAISE EXCEPTION 'challenge not found';
  END IF;

  v_stolen_coins := LEAST(v_defender_coins, GREATEST(v_requested_steal, 0));

  UPDATE public.teams
  SET coins = coins - v_stolen_coins
  WHERE id = p_defender_team_id;

  UPDATE public.teams
  SET coins = coins + v_stolen_coins
  WHERE id = p_attacker_team_id;

  RETURN QUERY
  SELECT
    v_stolen_coins,
    (v_attacker_coins + v_stolen_coins) AS attacker_coins,
    (v_defender_coins - v_stolen_coins) AS defender_coins,
    (v_defender_coins - v_stolen_coins) = 0 AS defender_eliminated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_attack_coins(UUID, UUID, UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.increment_team_coins(
  p_team_id UUID,
  p_delta INT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance INT;
BEGIN
  IF p_team_id IS NULL THEN
    RAISE EXCEPTION 'team id is required';
  END IF;

  IF p_delta IS NULL THEN
    RAISE EXCEPTION 'delta is required';
  END IF;

  UPDATE public.teams
  SET coins = GREATEST(coins + p_delta, 0)
  WHERE id = p_team_id
  RETURNING coins INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'team not found';
  END IF;

  RETURN v_new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_team_coins(UUID, INT) TO anon, authenticated, service_role;
