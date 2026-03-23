<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  let myTeams = $state<any[]>([]);
  let gameInviteCode = $state('');
  
  let loading = $state(false);
  let actionMessage = $state('');
  let actionError = $state(false);
  let userId = $state('');

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) await supabase.auth.signInAnonymously();
    const { data: currentUser } = await supabase.auth.getUser();
    if (currentUser?.user) {
      userId = currentUser.user.id;
      await supabase.from('profiles').upsert({ id: userId, username: 'Player_' + userId.substring(0, 5) }, { onConflict: 'id' }).select();
      await fetchUserData();
    }
  });

  async function fetchUserData() {
    const { data: memberData } = await supabase
      .from('team_members')
      .select('role, teams(*, games(id, name, is_active))')
      .eq('user_id', userId);
      
    if (memberData) {
      myTeams = memberData.map(m => ({
        ...m.teams,
        role: m.role,
        game: m.teams.games
      })).filter(t => t.game); // Filter out orphans
    }
  }

  async function joinGame() {
    if (!gameInviteCode) return;
    loading = true;
    actionError = false;

    // Verify game invite code exists
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, is_active')
      .eq('invite_code', gameInviteCode.toUpperCase().trim())
      .single();
      
    if (gameError || !game || !game.is_active) {
      actionMessage = 'Invalid or inactive game invite code.';
      actionError = true;
      loading = false;
      return;
    }
    
    // Redirect to team creation/join screen for this game
    goto(`/play/${gameInviteCode.toUpperCase().trim()}`);
  }
</script>

<div class="p-8 max-w-6xl mx-auto space-y-12">
  <div class="border-b border-white/10 pb-6">
    <h1 class="text-4xl font-black tracking-tight text-white flex items-center gap-3">
      <span class="text-red-500">🎮</span> Player Hub
    </h1>
    <p class="text-gray-400 mt-2 text-lg">Enter a Game Invite Code to begin playing, or manage your active teams.</p>
  </div>
  
  {#if actionMessage}
    <div class="p-4 rounded-xl border {actionError ? 'bg-red-500/10 border-red-500/50 text-red-500' : 'bg-green-500/10 border-green-500/50 text-green-400'}">
      {actionMessage}
    </div>
  {/if}

  <div class="max-w-md border border-white/10 bg-slate-900/50 backdrop-blur-md p-6 rounded-2xl shadow-xl">
    <div class="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-red-500/30 text-2xl">🎟️</div>
    <h2 class="text-xl font-bold text-white mb-2">Join a Game</h2>
    <p class="text-gray-400 mb-6">Enter the code provided by the Admin to start a new game.</p>
    
    <div class="space-y-4">
      <input bind:value={gameInviteCode} placeholder="E.g. X9Y8Z7" class="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white text-center text-xl tracking-[0.2em] font-mono uppercase focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" maxlength="6" />
    </div>
    
    <button onclick={joinGame} disabled={loading || gameInviteCode.length < 6} class="w-full bg-red-600 hover:bg-red-500 text-white px-6 py-4 rounded-xl font-bold disabled:opacity-50 transition-all text-lg tracking-wide shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] active:scale-[0.98] mt-6">
      {loading ? 'Joining Game...' : 'JOIN GAME'}
    </button>
  </div>

  <div class="space-y-6 pt-8">
    <h2 class="text-2xl font-bold text-white">Your Games</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each myTeams as team}
        <div class="border border-white/10 bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl shadow-lg relative group overflow-hidden">
          {#if team.role === 'leader'}
            <div class="absolute top-0 right-0 bg-red-500/20 text-red-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Leader</div>
          {:else}
            <div class="absolute top-0 right-0 bg-blue-500/20 text-blue-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Member</div>
          {/if}
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold text-white group-hover:text-red-400 transition-colors">{team.game?.name || 'Unknown'}</h3>
          </div>
          <div class="space-y-2 mb-6">
            <div class="flex justify-between items-center text-sm">
              <span class="text-gray-400">Team:</span>
              <span class="text-white font-medium">{team.name}</span>
            </div>
          </div>
          <a href={`/game/${team.game.id}`} class="block w-full bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/50 text-white text-center py-3 rounded-lg font-semibold transition-all hover:shadow-[0_0_15px_rgba(220,38,38,0.2)]">
            Play Game
          </a>
        </div>
      {/each}
      {#if myTeams.length === 0}
        <div class="col-span-full border border-dashed border-white/20 bg-white/5 p-8 rounded-2xl text-center">
          <p class="text-gray-400">You are not part of any games yet.</p>
        </div>
      {/if}
    </div>
  </div>
</div>
