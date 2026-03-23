<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let games = $state<any[]>([]);
  let teams = $state<any[]>([]);
  let name = $state('');
  let start_time = $state('');
  let end_time = $state('');
  let startTimeInput: HTMLInputElement | null = null;
  let endTimeInput: HTMLInputElement | null = null;
  let challenges_per_team = $state(5);
  let loading = $state(false);
  let errorMsg = $state('');
  let selectedGameId = $state('');
  let teamLoading = $state(false);
  let teamMessage = $state('');
  let teamError = $state(false);

  onMount(async () => {
    await fetchGames();
  });

  async function fetchGames() {
    const { data, error } = await supabase.from('games').select('*').order('created_at', { ascending: false });
    if (data) {
      games = data;
      await ensureInviteCodes(data);
      if (games.length > 0) {
        const stillSelected = games.some((game) => game.id === selectedGameId);
        selectedGameId = stillSelected ? selectedGameId : games[0].id;
        await fetchTeamsForGame(selectedGameId);
      } else {
        selectedGameId = '';
        teams = [];
      }
    }
    if (error) console.error(error);
  }

  function generateInviteCode() {
    return Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, '0')
      .toUpperCase();
  }

  async function fetchTeamsForGame(gameId: string) {
    if (!gameId) {
      teams = [];
      return;
    }

    teamLoading = true;
    teamMessage = '';

    const { data: teamRows, error: teamsError } = await supabase
      .from('teams')
      .select('id, game_id, name, invite_code, created_at')
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
    const { data: memberRows, error: memberError } = await supabase
      .from('team_members')
      .select('team_id')
      .in('team_id', teamIds);

    if (memberError) {
      teamMessage = memberError.message;
      teamError = true;
      teamLoading = false;
      return;
    }

    const membersByTeam = (memberRows || []).reduce<Record<string, number>>((acc, row: any) => {
      const currentCount = acc[row.team_id] || 0;
      acc[row.team_id] = currentCount + 1;
      return acc;
    }, {});

    teams = teamRows.map((team) => ({
      ...team,
      member_count: membersByTeam[team.id] || 0
    }));
    teamLoading = false;
  }

  async function renameTeam(teamId: string, currentName: string) {
    const updatedName = window.prompt('Rename team', currentName);
    if (!updatedName || updatedName.trim() === currentName) return;

    teamLoading = true;
    teamMessage = '';
    teamError = false;

    const { error } = await supabase
      .from('teams')
      .update({ name: updatedName.trim() })
      .eq('id', teamId);

    if (error) {
      teamMessage = error.message;
      teamError = true;
      teamLoading = false;
      return;
    }

    teamMessage = 'Team renamed successfully.';
    await fetchTeamsForGame(selectedGameId);
    teamLoading = false;
  }

  async function regenerateTeamInviteCode(teamId: string) {
    teamLoading = true;
    teamMessage = '';
    teamError = false;

    let updateError: any = null;
    let nextCode = '';
    for (let i = 0; i < 5; i += 1) {
      nextCode = generateInviteCode();
      const { error } = await supabase
        .from('teams')
        .update({ invite_code: nextCode })
        .eq('id', teamId);

      if (!error) {
        updateError = null;
        break;
      }

      updateError = error;
      if (error.code !== '23505') break;
    }

    if (updateError) {
      teamMessage = updateError.message;
      teamError = true;
      teamLoading = false;
      return;
    }

    teamMessage = `Updated team invite code to TEAM:${nextCode}.`;
    await fetchTeamsForGame(selectedGameId);
    teamLoading = false;
  }

  async function deleteTeam(teamId: string, teamTitle: string) {
    if (!window.confirm(`Delete team "${teamTitle}"? This also removes all members and challenge setups.`)) {
      return;
    }

    teamLoading = true;
    teamMessage = '';
    teamError = false;

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);

    if (error) {
      teamMessage = error.message;
      teamError = true;
      teamLoading = false;
      return;
    }

    teamMessage = 'Team deleted successfully.';
    await fetchTeamsForGame(selectedGameId);
    teamLoading = false;
  }

  async function setInviteCodeForGame(gameId: string) {
    for (let i = 0; i < 5; i += 1) {
      const inviteCode = generateInviteCode();
      const { error } = await supabase
        .from('games')
        .update({ invite_code: inviteCode })
        .eq('id', gameId);

      if (!error) return;

      // Retry if generated code collided with existing one.
      if (error.code !== '23505') throw error;
    }

    throw new Error('Failed to generate a unique invite code after multiple attempts.');
  }

  async function ensureInviteCodes(gameRows: any[]) {
    const missingInviteCodes = gameRows.filter((g) => !g.invite_code);
    if (missingInviteCodes.length === 0) return;

    for (const game of missingInviteCodes) {
      await setInviteCodeForGame(game.id);
    }

    const { data: refreshedGames, error } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (refreshedGames) games = refreshedGames;
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

  function isGameActive(game: { is_active: boolean; start_time: string; end_time: string }) {
    const now = Date.now();
    const start = new Date(game.start_time).getTime();
    const end = new Date(game.end_time).getTime();
    return Boolean(game.is_active) && !Number.isNaN(start) && !Number.isNaN(end) && now >= start && now <= end;
  }

  async function createGame() {
    loading = true;
    errorMsg = '';

    const dateTimeLocalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    if (!dateTimeLocalPattern.test(start_time) || !dateTimeLocalPattern.test(end_time)) {
      errorMsg = 'Please select valid start and end date/time values.';
      loading = false;
      return;
    }

    // datetime-local uses a sortable format: YYYY-MM-DDTHH:mm
    if (end_time <= start_time) {
      errorMsg = 'End time must be after start time.';
      loading = false;
      return;
    }
    
    const { data: user } = await supabase.auth.getUser();
    const invite_code = generateInviteCode();
    const now = Date.now();
    const startDate = new Date(start_time);
    const endDate = new Date(end_time);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      errorMsg = 'Could not parse start/end time. Please reselect both values.';
      loading = false;
      return;
    }

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const initialIsActive = now >= startMs && now <= endMs;

    const { error } = await supabase
      .from('games')
      .insert([{
        name,
        start_time: startIso,
        end_time: endIso,
        challenges_per_team,
        invite_code,
        is_active: initialIsActive,
        created_by: user?.user?.id || null
      }])
      .select()
      .single();

    if (error) {
      errorMsg = error.message;
    } else {
      name = '';
      start_time = '';
      end_time = '';
      challenges_per_team = 5;
      await fetchGames();
    }
    
    loading = false;
  }
</script>

<div class="p-8 max-w-5xl mx-auto space-y-8">
  <div class="flex items-center justify-between border-b border-white/10 pb-6">
    <div class="space-y-1">
      <h1 class="text-3xl font-bold tracking-tight text-white">Manage Games</h1>
      <p class="text-gray-400">Create new competition rounds and view existing games.</p>
    </div>
  </div>
  
  {#if errorMsg}
    <div class="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-md">
      {errorMsg}
    </div>
  {/if}

  <div class="border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl space-y-4 shadow-xl">
    <h2 class="text-xl font-semibold text-white">Create New Game</h2>
    
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2 col-span-2">
        <p class="text-sm font-medium text-gray-300">Game Name</p>
        <input id="game-name" bind:value={name} placeholder="RedHacks 2026 Season 1" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>

      <div class="space-y-2 col-span-2 md:col-span-1">
        <p class="text-sm font-medium text-gray-300">Start Time</p>
        <div class="flex gap-2">
          <input id="game-start-time" bind:this={startTimeInput} type="datetime-local" bind:value={start_time} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
          <button
            type="button"
            class="shrink-0 px-3 rounded-md border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 transition-colors"
            onclick={() => startTimeInput?.showPicker?.()}
            aria-label="Open start time calendar"
          >
            Pick
          </button>
        </div>
      </div>
      <div class="space-y-2 col-span-2 md:col-span-1">
        <p class="text-sm font-medium text-gray-300">End Time</p>
        <div class="flex gap-2">
          <input id="game-end-time" bind:this={endTimeInput} type="datetime-local" bind:value={end_time} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
          <button
            type="button"
            class="shrink-0 px-3 rounded-md border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 transition-colors"
            onclick={() => endTimeInput?.showPicker?.()}
            aria-label="Open end time calendar"
          >
            Pick
          </button>
        </div>
      </div>

      <div class="space-y-2 col-span-2 md:col-span-1">
        <p class="text-sm font-medium text-gray-300">Challenges Per Team</p>
        <input id="game-challenges-per-team" type="number" bind:value={challenges_per_team} min="1" max="20" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>
    </div>

    <button onclick={createGame} disabled={loading || !name || !start_time || !end_time} class="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded-lg font-bold disabled:opacity-50 mt-6 transition-all shadow-lg hover:shadow-red-500/20 active:scale-[0.98]">
      {loading ? 'Creating...' : 'Create Game'}
    </button>
  </div>

  <div class="space-y-4 pt-8">
    <h2 class="text-xl font-semibold text-white">Existing Games</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each games as game}
        <div class="border border-white/10 {isGameActive(game) ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900/40 backdrop-blur-sm'} p-5 rounded-xl flex flex-col justify-between hover:border-red-500/30 transition-colors shadow-lg">
          <div>
            <div class="flex justify-between items-start">
              <h3 class="font-bold text-lg text-white">{game.name}</h3>
              {#if game.invite_code}
                <span class="font-mono text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/30" title="Game Invite Code">
                  GAME:{game.invite_code}
                </span>
              {/if}
            </div>
            
            <span class="inline-block px-2.5 py-1 bg-white/10 text-xs rounded-full text-gray-300 mt-3 whitespace-nowrap font-medium">
              {formatDateTime(game.start_time)} - {formatDateTime(game.end_time)}
            </span>
            <p class="text-xs text-gray-400 mt-2 font-mono break-all">GAME:{game.id}</p>
            <p class="text-sm text-gray-400 mt-3 bg-black/20 p-2 rounded flex justify-between">
              <span>{game.challenges_per_team} Challenges</span>
              <span>{game.is_active ? 'Active' : 'Inactive'}</span>
            </p>
          </div>
          <div class="mt-5 pt-3 border-t border-white/5">
            <a href="/dashboard/{game.id}" class="text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-1 group">
              View Dashboard 
              <span class="group-hover:translate-x-1 transition-transform">&rarr;</span>
            </a>
          </div>
        </div>
      {/each}
      {#if games.length === 0}
        <p class="text-gray-500 text-sm col-span-full">No games created yet. Create one above to get started.</p>
      {/if}
    </div>
  </div>

  <div class="space-y-4 pt-10 border-t border-white/10">
    <h2 class="text-xl font-semibold text-white">Manage Teams</h2>
    <p class="text-sm text-gray-400">View and manage teams for a specific game.</p>

    {#if teamMessage}
      <div class="p-3 rounded-md border {teamError ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-green-500/10 border-green-500/40 text-green-300'}">
        {teamMessage}
      </div>
    {/if}

    <div class="border border-white/10 bg-slate-900/40 rounded-xl p-5 space-y-4">
      <div class="grid grid-cols-1 gap-4">
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-300">Game</p>
          <select
            bind:value={selectedGameId}
            class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all"
            onchange={() => fetchTeamsForGame(selectedGameId)}
          >
            <option value="" disabled selected={selectedGameId === ''}>Select a game</option>
            {#each games as game}
              <option value={game.id}>{game.name}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each teams as team}
        <div class="border border-white/10 bg-slate-900/40 p-4 rounded-xl space-y-3">
          <div>
            <h3 class="text-lg font-semibold text-white">{team.name}</h3>
            <p class="text-xs text-gray-400 font-mono break-all mt-1">TEAM:{team.id}</p>
          </div>

          <div class="space-y-2 text-sm text-gray-300">
            <div class="flex items-center justify-between bg-black/20 p-2 rounded">
              <span>Team Invite Code</span>
              <span class="font-mono font-semibold tracking-wider text-red-300">TEAM:{team.invite_code}</span>
            </div>
            <div class="flex items-center justify-between bg-black/20 p-2 rounded">
              <span>Members</span>
              <span>{team.member_count}</span>
            </div>
            <div class="flex items-center justify-between bg-black/20 p-2 rounded">
              <span>Created</span>
              <span>{formatDateTime(team.created_at)}</span>
            </div>
          </div>

          <div class="grid grid-cols-3 gap-2">
            <button
              class="px-2 py-1.5 rounded border border-white/20 text-xs text-gray-200 hover:bg-white/10"
              onclick={() => renameTeam(team.id, team.name)}
              disabled={teamLoading}
            >
              Rename
            </button>
            <button
              class="px-2 py-1.5 rounded border border-red-500/30 text-xs text-red-300 hover:bg-red-500/10"
              onclick={() => regenerateTeamInviteCode(team.id)}
              disabled={teamLoading}
            >
              New Code
            </button>
            <button
              class="px-2 py-1.5 rounded border border-red-500/50 text-xs text-red-400 hover:bg-red-500/20"
              onclick={() => deleteTeam(team.id, team.name)}
              disabled={teamLoading}
            >
              Delete
            </button>
          </div>
        </div>
      {/each}
      {#if selectedGameId && teams.length === 0 && !teamLoading}
        <p class="text-sm text-gray-500 col-span-full">No teams in this game yet.</p>
      {/if}
    </div>
  </div>
</div>
