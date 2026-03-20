<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let myTeams = $state<any[]>([]);
  let activeGames = $state<any[]>([]);
  
  // Forms state
  let newTeamName = $state('');
  let selectedGameId = $state('');
  let inviteCode = $state('');
  
  let loading = $state(false);
  let actionMessage = $state('');
  let actionError = $state(false);
  let userId = $state('');

  onMount(async () => {
    // Basic auto-auth for players
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (!session) {
      await supabase.auth.signInAnonymously();
    }
    const { data: currentUser } = await supabase.auth.getUser();
    if (currentUser?.user) {
      userId = currentUser.user.id;
      await supabase.from('profiles').upsert({ id: userId, username: 'Player_' + userId.substring(0, 5) }, { onConflict: 'id' }).select();
      await fetchUserData();
    }
  });

  async function fetchUserData() {
    // Get active games
    const { data: gamesData } = await supabase.from('games').select('*').eq('is_active', true);
    if (gamesData) {
      activeGames = gamesData;
      if (activeGames.length > 0) selectedGameId = activeGames[0].id;
    }

    // Get user's teams
    const { data: memberData } = await supabase
      .from('team_members')
      .select('role, teams(*, games(id, name, is_active))')
      .eq('user_id', userId);
      
    if (memberData) {
      myTeams = memberData.map(m => ({
        ...m.teams,
        role: m.role,
        game: m.teams.games
      }));
    }
  }

  async function createTeam() {
    if (!newTeamName || !selectedGameId) return;
    loading = true;
    actionError = false;
    
    const newInviteCode = Math.floor(Math.random()*16777215).toString(16).padStart(6, '0').toUpperCase();

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert([{
        game_id: selectedGameId,
        name: newTeamName,
        invite_code: newInviteCode
      }])
      .select()
      .single();

    if (teamError) {
      actionMessage = teamError.message;
      actionError = true;
    } else if (team) {
      await supabase.from('team_members').insert([{
        team_id: team.id,
        user_id: userId,
        role: 'leader'
      }]);
      actionMessage = `Team created! Invite code: ${newInviteCode}`;
      actionError = false;
      newTeamName = '';
      await fetchUserData();
    }
    loading = false;
  }

  async function joinTeam() {
    if (!inviteCode) return;
    loading = true;
    actionError = false;
    
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase().trim())
      .single();
        
    if (teamError || !team) {
      actionMessage = 'Invalid invite code.';
      actionError = true;
      loading = false;
      return;
    }

    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: userId,
        role: 'member'
      });
        
    if (memberError && memberError.code !== '23505') { 
      actionMessage = memberError.message;
      actionError = true;
    } else {
      actionMessage = `Successfully joined ${team.name}!`;
      actionError = false;
      inviteCode = '';
      await fetchUserData();
    }
    loading = false;
  }
</script>

<div class="p-8 max-w-6xl mx-auto space-y-12">
  <div class="border-b border-white/10 pb-6">
    <h1 class="text-4xl font-black tracking-tight text-white flex items-center gap-3">
      <span class="text-red-500">🎮</span> Player Hub
    </h1>
    <p class="text-gray-400 mt-2 text-lg">Manage your teams, create new ones, or join an existing squad.</p>
  </div>
  
  {#if actionMessage}
    <div class="p-4 rounded-xl border {actionError ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-green-500/10 border-green-500/50 text-green-400'}">
      {actionMessage}
    </div>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
    <!-- Join Team -->
    <div class="border border-white/10 bg-slate-900/50 backdrop-blur-md p-6 rounded-2xl shadow-xl flex flex-col justify-between">
      <div>
        <div class="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-blue-500/30 text-2xl">🤝</div>
        <h2 class="text-2xl font-bold text-white mb-2">Join a Team</h2>
        <p class="text-gray-400 mb-6">Have an invite code from your team leader? Enter it here to join their squad.</p>
        
        <div class="space-y-4">
          <input bind:value={inviteCode} placeholder="E.g. A1B2C3" class="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white text-center text-xl tracking-[0.3em] font-mono uppercase focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all" maxlength="6" />
        </div>
      </div>
      <button onclick={joinTeam} disabled={loading || inviteCode.length < 6} class="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-xl font-bold disabled:opacity-50 transition-all text-lg tracking-wide shadow-[0_0_15px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] active:scale-[0.98] mt-6">
        {loading ? 'Joining...' : 'JOIN TEAM'}
      </button>
    </div>

    <!-- Create Team -->
    <div class="border border-white/10 bg-slate-900/50 backdrop-blur-md p-6 rounded-2xl shadow-xl flex flex-col justify-between">
      <div>
        <div class="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-red-500/30 text-2xl">🛡️</div>
        <h2 class="text-2xl font-bold text-white mb-2">Create a New Team</h2>
        <p class="text-gray-400 mb-6">Start a new squad for an active competition. You will be the team leader.</p>
        
        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-semibold text-gray-300">Team Name</label>
            <input bind:value={newTeamName} placeholder="e.g. Protocol Breakers" class="w-full bg-black/60 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-semibold text-gray-300">Select Game</label>
            <select bind:value={selectedGameId} class="w-full bg-black/60 border border-white/10 rounded-xl p-3 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all">
              {#each activeGames as game}
                <option value={game.id}>{game.name}</option>
              {/each}
              {#if activeGames.length === 0}
                <option value="" disabled>No active games available</option>
              {/if}
            </select>
          </div>
        </div>
      </div>
      <button onclick={createTeam} disabled={loading || !newTeamName || !selectedGameId} class="w-full bg-red-600 hover:bg-red-500 text-white px-6 py-4 rounded-xl font-bold disabled:opacity-50 transition-all text-lg tracking-wide shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] active:scale-[0.98] mt-6">
        {loading ? 'Creating...' : 'CREATE TEAM'}
      </button>
    </div>
  </div>

  <div class="space-y-6 pt-8">
    <h2 class="text-2xl font-bold text-white">Your Teams</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each myTeams as team}
        <div class="border border-white/10 bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl shadow-lg relative group overflow-hidden">
          {#if team.role === 'leader'}
            <div class="absolute top-0 right-0 bg-red-500/20 text-red-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Leader</div>
          {:else}
            <div class="absolute top-0 right-0 bg-blue-500/20 text-blue-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Member</div>
          {/if}

          <h3 class="font-black text-xl text-white mb-2">{team.name}</h3>
          
          <div class="space-y-2 mb-6">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">Game:</span>
              <span class="text-gray-200 font-medium">{team.game?.name}</span>
            </div>
            {#if team.role === 'leader'}
              <div class="flex items-center justify-between text-sm bg-black/40 p-2 rounded-lg border border-white/5">
                <span class="text-gray-400">Invite Code:</span>
                <span class="text-red-400 font-mono font-bold tracking-widest">{team.invite_code}</span>
              </div>
            {/if}
          </div>

          <div class="grid grid-cols-2 gap-3 mt-auto">
            <a href={`/game/${team.game_id}/defend`} class="text-center px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg font-bold text-sm transition-colors">
              Defend
            </a>
            <a href={`/game/${team.game_id}/attack`} class="text-center px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-500 border border-red-500/30 rounded-lg font-bold text-sm transition-colors">
              Attack
            </a>
          </div>
        </div>
      {/each}
      {#if myTeams.length === 0}
        <div class="col-span-full py-12 text-center border border-white/5 rounded-2xl bg-white/5 border-dashed">
          <p class="text-gray-500 text-lg">You haven't joined any teams yet.</p>
        </div>
      {/if}
    </div>
  </div>
</div>
