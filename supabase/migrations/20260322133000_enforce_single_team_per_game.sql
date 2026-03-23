-- Enforce that a user can only belong to one team per game.
-- We enforce this in a trigger because game_id lives on teams, not team_members.

CREATE OR REPLACE FUNCTION public.enforce_single_team_per_game()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_game_id uuid;
  conflicting_team_id uuid;
BEGIN
  SELECT game_id
  INTO target_game_id
  FROM public.teams
  WHERE id = NEW.team_id;

  IF target_game_id IS NULL THEN
    RAISE EXCEPTION 'Target team does not exist.' USING ERRCODE = '23503';
  END IF;

  SELECT tm.team_id
  INTO conflicting_team_id
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE tm.user_id = NEW.user_id
    AND t.game_id = target_game_id
    AND tm.team_id <> NEW.team_id
  LIMIT 1;

  IF conflicting_team_id IS NOT NULL THEN
    RAISE EXCEPTION 'User can only be on one team per game.' USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_single_team_per_game ON public.team_members;

CREATE TRIGGER trigger_enforce_single_team_per_game
BEFORE INSERT OR UPDATE OF user_id, team_id
ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_team_per_game();
