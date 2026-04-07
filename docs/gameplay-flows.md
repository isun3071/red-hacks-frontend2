# Gameplay Flows

## 1. Join Game and Team

Entry points:
- `/play`
- `/play/[inviteCode]`

Flow:
1. Player enters a game invite code.
2. App validates game and active status.
3. Player creates a team or joins existing team using team invite code.
4. Player is redirected to game dashboard.

## 2. Configure Defenses

Entry point:
- `/game/[gameId]/defend`

Flow:
1. Resolve player's team membership for the game.
2. Resolve the current round and load its `available_challenges`.
3. Open a challenge defense page and configure system prompt and defense params.
4. Activate defense to make it attackable in PvP rounds.
5. In PvE rounds, the challenge default prompt acts as the defense and team-specific prompt editing is disabled.

## 3. Attack Opponents

Entry points:
- `/game/[gameId]/attack`
- `/game/[gameId]/attack/[defendedChallengeId]`

Flow:
1. Resolve the active round and its `available_challenges`.
2. In PvP rounds, load opponent defended challenges in the same game and hide self-team targets and teams with zero coins.
3. In PvE rounds, load the round's challenges and attack the default prompt defense.
4. Start attack session with a seed prompt.
5. Post the attack intent to the same-origin SvelteKit attack dispatcher.
	- The dispatcher resolves the target challenge server-side, including server-only fields such as `target_secret_key` for secret-key challenges.
	- If `challenge_url` is set, the dispatcher forwards the resolved payload directly to that backend; otherwise it forwards to the Supabase attack edge function.
6. The backend enforces rule checks and returns the outcome.
7. On success, PvP attacks can transfer coins from defender to attacker.

## Custom Backend Route Authoring Notes

If you implement a backend route for `challenge_url`, keep it payload-compatible with the server dispatcher.

Required compatibility:
- Accept the current attack payload fields (`prompt`, `guess`, `messages`, and target identifiers).
- Accept the resolved challenge object, including server-only fields such as `target_secret_key` for secret-key challenges.
- Return JSON that includes at least `success` and a short result message (`output_message` or `message`).

For tool-calling challenges:
- Evaluate success by inspecting actual model tool calls.
- Do not rely on model self-judged success flags.
- Prefer deterministic matching against configured success criteria (tool name + required argument subset).

For full request/response schema details, see the custom backend contract section in `docs/game.md`.

## Challenge Types

Examples in current implementation:
- `secret-key`: attacker must obtain/guess protected key
- `tool-calling`: attacker must induce forbidden/targeted tool behavior

## User Roles

- Player: joins teams, configures defenses, performs attacks
- Admin: manages games/challenges/tools and game configuration surfaces
