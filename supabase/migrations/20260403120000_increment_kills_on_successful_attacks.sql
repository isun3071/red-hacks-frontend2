-- Treat every successful attack as a kill and keep the denormalized counter in sync.

CREATE OR REPLACE FUNCTION public.increment_team_member_kills_from_attack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_successful IS TRUE AND NEW.attacker_team_id IS NOT NULL AND NEW.attacker_user_id IS NOT NULL THEN
    UPDATE public.team_members
    SET kills = kills + 1
    WHERE team_id = NEW.attacker_team_id
      AND user_id = NEW.attacker_user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_increment_team_member_kills_on_attack ON public.attacks;

CREATE TRIGGER trigger_increment_team_member_kills_on_attack
AFTER INSERT ON public.attacks
FOR EACH ROW
EXECUTE FUNCTION public.increment_team_member_kills_from_attack();

WITH successful_attack_counts AS (
  SELECT
    attacker_team_id,
    attacker_user_id,
    COUNT(*)::INT AS successful_attacks
  FROM public.attacks
  WHERE is_successful IS TRUE
    AND attacker_team_id IS NOT NULL
    AND attacker_user_id IS NOT NULL
  GROUP BY attacker_team_id, attacker_user_id
)
UPDATE public.team_members tm
SET kills = sac.successful_attacks
FROM successful_attack_counts sac
WHERE tm.team_id = sac.attacker_team_id
  AND tm.user_id = sac.attacker_user_id;