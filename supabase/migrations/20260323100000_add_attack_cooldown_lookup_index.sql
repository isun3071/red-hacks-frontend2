-- Speed up per-team per-target latest-attack lookups used by attack cooldown checks.
CREATE INDEX IF NOT EXISTS attacks_cooldown_lookup_idx
ON attacks (attacker_team_id, defended_challenge_id, created_at DESC);
