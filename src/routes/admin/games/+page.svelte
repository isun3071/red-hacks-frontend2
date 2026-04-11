<script lang="ts">
  import { generateInviteCode } from '$lib/adminGames';
  import { isGameActive } from '$lib/gameplay';
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let games = $state<any[]>([]);
  let loading = $state(true);
  let errorMsg = $state('');

  // Teams management for selected game
  let selectedGameId = $state('');
  let teams = $state<any[]>([]);
  let teamLoading = $state(false);
  let teamMessage = $state('');
  let teamError = $state(false);

  async function fetchGames() {
    const { data, error } = await supabase.from('games').select('*').order('created_at', { ascending: false });
    if (error) {
      errorMsg = error.message;
      return;
    }
    games = data ?? [];
    await ensureInviteCodes(games);
    if (games.length > 0) {
      const stillSelected = games.some((g) => g.id === selectedGameId);
      if (!stillSelected) selectedGameId = games[0].id;
      await fetchTeamsForGame(selectedGameId);
    } else {
      selectedGameId = '';
      teams = [];
    }
  }

  async function setInviteCodeForGame(gameId: string) {
    for (let i = 0; i < 5; i += 1) {
      const inviteCode = generateInviteCode();
      const { error } = await supabase.from('games').update({ invite_code: inviteCode }).eq('id', gameId);
      if (!error) return;
      if (error.code !== '23505') throw error;
    }
    throw new Error('Failed to generate a unique invite code after multiple attempts.');
  }

  async function ensureInviteCodes(gameRows: any[]) {
    const missing = gameRows.filter((g) => !g.invite_code);
    if (missing.length === 0) return;
    for (const g of missing) await setInviteCodeForGame(g.id);
    const { data } = await supabase.from('games').select('*').order('created_at', { ascending: false });
    if (data) games = data;
  }

  function formatDateTime(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Invalid date';
    return parsed.toLocaleString([], {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  async function toggleGameActive(game: any) {
    const nextActive = !game.is_active;
    const { error } = await supabase.from('games').update({ is_active: nextActive }).eq('id', game.id);
    if (error) {
      errorMsg = `Failed to ${nextActive ? 'activate' : 'pause'} game: ${error.message}`;
      return;
    }
    await fetchGames();
  }

  async function deleteGame(game: any) {
    if (!confirm(`Delete "${game.name}"? This removes the game, rounds, teams, and attack history. Cannot be undone.`)) return;
    const { error } = await supabase.from('games').delete().eq('id', game.id);
    if (error) {
      errorMsg = `Failed to delete: ${error.message}`;
      return;
    }
    await fetchGames();
  }

  // ---------- Teams management ----------

  async function fetchTeamsForGame(gameId: string) {
    if (!gameId) {
      teams = [];
      return;
    }
    teamLoading = true;
    teamMessage = '';

    const { data: teamRows, error: teamsError } = await supabase
      .from('teams')
      .select('id, game_id, name, invite_code, coins, created_at')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false });

    if (teamsError) {
      teamMessage = teamsError.message;
      teamError = true;
      teamLoading = false;
      return;
    }

    if (!teamRows || teamRows.length === 0) {
      teams = [];
      teamLoading = false;
      return;
    }

    const teamIds = teamRows.map((team) => team.id);
    const { data: memberRows } = await supabase
      .from('team_members')
      .select('team_id')
      .in('team_id', teamIds);

    const membersByTeam = (memberRows || []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.team_id] = (acc[row.team_id] || 0) + 1;
      return acc;
    }, {});

    teams = teamRows.map((team) => ({ ...team, member_count: membersByTeam[team.id] || 0 }));
    teamLoading = false;
  }

  async function renameTeam(teamId: string, currentName: string) {
    const updatedName = window.prompt('Rename team', currentName);
    if (!updatedName || updatedName.trim() === currentName) return;

    teamLoading = true;
    teamMessage = '';
    teamError = false;
    const { error } = await supabase.from('teams').update({ name: updatedName.trim() }).eq('id', teamId);
    if (error) {
      teamMessage = error.message;
      teamError = true;
      teamLoading = false;
      return;
    }
    teamMessage = 'Team renamed.';
    await fetchTeamsForGame(selectedGameId);
    teamLoading = false;
  }

  async function regenerateTeamInviteCode(teamId: string) {
    teamLoading = true;
    teamMessage = '';
    teamError = false;

    let nextCode = '';
    for (let i = 0; i < 5; i += 1) {
      nextCode = generateInviteCode();
      const { error } = await supabase.from('teams').update({ invite_code: nextCode }).eq('id', teamId);
      if (!error) break;
      if (error.code !== '23505') {
        teamMessage = error.message;
        teamError = true;
        teamLoading = false;
        return;
      }
    }

    teamMessage = `Updated team invite code to TEAM:${nextCode}.`;
    await fetchTeamsForGame(selectedGameId);
    teamLoading = false;
  }

  async function deleteTeam(teamId: string, teamTitle: string) {
    if (!window.confirm(`Delete team "${teamTitle}"? This also removes all members and challenge setups.`)) return;
    teamLoading = true;
    teamMessage = '';
    teamError = false;
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    if (error) {
      teamMessage = error.message;
      teamError = true;
      teamLoading = false;
      return;
    }
    teamMessage = 'Team deleted.';
    await fetchTeamsForGame(selectedGameId);
    teamLoading = false;
  }

  onMount(async () => {
    await fetchGames();
    loading = false;
  });
</script>

<div class="p-8 max-w-6xl mx-auto space-y-8">
  <div class="flex items-center justify-between border-b border-white/10 pb-6">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-white">Games</h1>
      <p class="text-gray-400">Manage competition games, their rounds, and teams.</p>
    </div>
    <a href="/admin/games/new" class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold transition-all shadow-lg">+ New Game</a>
  </div>

  {#if errorMsg}
    <div class="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-md">{errorMsg}</div>
  {/if}

  {#if loading}
    <div class="text-gray-400">Loading games...</div>
  {:else if games.length === 0}
    <div class="border border-white/10 bg-slate-900/40 p-10 rounded-xl text-center space-y-3">
      <p class="text-gray-400">No games yet.</p>
      <a href="/admin/games/new" class="inline-block px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold">Create your first game</a>
    </div>
  {:else}
    <div class="space-y-4">
      <h2 class="text-xl font-semibold text-white">Existing Games</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each games as game}
          <div class="border border-white/10 {isGameActive(game) ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900/40 backdrop-blur-sm'} p-5 rounded-xl flex flex-col justify-between hover:border-red-500/30 transition-colors shadow-lg">
            <div>
              <div class="flex justify-between items-start gap-2">
                <h3 class="font-bold text-lg text-white">{game.name}</h3>
                {#if game.invite_code}
                  <span class="font-mono text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/30" title="Game Invite Code">
                    {game.invite_code}
                  </span>
                {/if}
              </div>
              <span class="inline-block px-2.5 py-1 bg-white/10 text-xs rounded-full text-gray-300 mt-3 font-medium">
                {formatDateTime(game.start_time)} → {formatDateTime(game.end_time)}
              </span>
              <p class="text-sm text-gray-400 mt-3 bg-black/20 p-2 rounded flex justify-between">
                <span>{game.challenges_per_team} default defenses</span>
                <span class={game.is_active ? 'text-green-400 font-semibold' : 'text-gray-500'}>
                  {game.is_active ? 'Active' : 'Paused'}
                </span>
              </p>
            </div>
            <div class="mt-5 pt-3 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
              <a href="/dashboard/{game.id}" class="text-red-400 hover:text-red-300 text-sm font-bold">View Dashboard →</a>
              <div class="flex items-center gap-2 flex-wrap justify-end">
                <a href="/admin/games/{game.id}/edit" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10">Edit</a>
                <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => toggleGameActive(game)}>
                  {game.is_active ? 'Pause' : 'Activate'}
                </button>
                <button type="button" class="px-2.5 py-1 rounded border border-red-500/30 text-xs text-red-300 hover:bg-red-500/10" onclick={() => deleteGame(game)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Teams management -->
    <div class="pt-10 border-t border-white/10 space-y-4">
      <div>
        <h2 class="text-xl font-semibold text-white">Manage Teams</h2>
        <p class="text-sm text-gray-400">View and manage teams for a specific game.</p>
      </div>

      {#if teamMessage}
        <div class="p-3 rounded-md border {teamError ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-green-500/10 border-green-500/40 text-green-300'}">
          {teamMessage}
        </div>
      {/if}

      <div class="border border-white/10 bg-slate-900/40 rounded-xl p-5 space-y-4">
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-300">Game</p>
          <select
            bind:value={selectedGameId}
            onchange={() => fetchTeamsForGame(selectedGameId)}
            class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all"
          >
            {#each games as game}
              <option value={game.id}>{game.name}</option>
            {/each}
          </select>
        </div>

        {#if teamLoading}
          <p class="text-sm text-gray-400">Loading teams...</p>
        {:else if selectedGameId && teams.length === 0}
          <p class="text-sm text-gray-500">No teams in this game yet.</p>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            {#each teams as team}
              <div class="border border-white/10 bg-black/30 rounded-lg p-3 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <p class="font-semibold text-white">{team.name}</p>
                  <span class="font-mono text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30">TEAM:{team.invite_code}</span>
                </div>
                <p class="text-xs text-gray-400">{team.member_count ?? 0} member(s) · {team.coins ?? 0} coins</p>
                <div class="flex items-center gap-2 pt-1">
                  <button type="button" class="px-2 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => renameTeam(team.id, team.name)}>Rename</button>
                  <button type="button" class="px-2 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => regenerateTeamInviteCode(team.id)}>New Code</button>
                  <button type="button" class="px-2 py-1 rounded border border-red-500/30 text-xs text-red-300 hover:bg-red-500/10" onclick={() => deleteTeam(team.id, team.name)}>Delete</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
