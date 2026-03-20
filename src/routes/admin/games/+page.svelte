<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let games = $state<any[]>([]);
  let name = $state('');
  let start_time = $state('');
  let end_time = $state('');
  let challenges_per_team = $state(5);
  let lives_per_challenge = $state(3);
  let loading = $state(false);
  let errorMsg = $state('');

  onMount(async () => {
    await fetchGames();
  });

  async function fetchGames() {
    const { data, error } = await supabase.from('games').select('*').order('created_at', { ascending: false });
    if (data) games = data;
    if (error) console.error(error);
  }

  async function createGame() {
    loading = true;
    errorMsg = '';
    
    const { data: user } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('games')
      .insert([{
        name,
        start_time,
        end_time,
        challenges_per_team,
        lives_per_challenge,
        is_active: false,
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
      lives_per_challenge = 3;
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
        <label class="text-sm font-medium text-gray-300">Game Name</label>
        <input bind:value={name} placeholder="RedHacks 2026 Season 1" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>

      <div class="space-y-2 col-span-2 md:col-span-1">
        <label class="text-sm font-medium text-gray-300">Start Time</label>
        <input type="datetime-local" bind:value={start_time} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>
      <div class="space-y-2 col-span-2 md:col-span-1">
        <label class="text-sm font-medium text-gray-300">End Time</label>
        <input type="datetime-local" bind:value={end_time} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>

      <div class="space-y-2 col-span-2 md:col-span-1">
        <label class="text-sm font-medium text-gray-300">Challenges Per Team</label>
        <input type="number" bind:value={challenges_per_team} min="1" max="20" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>
      <div class="space-y-2 col-span-2 md:col-span-1">
        <label class="text-sm font-medium text-gray-300">Lives Per Challenge</label>
        <input type="number" bind:value={lives_per_challenge} min="1" max="10" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
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
        <div class="border border-white/10 {game.is_active ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900/40 backdrop-blur-sm'} p-5 rounded-xl flex flex-col justify-between hover:border-red-500/30 transition-colors shadow-lg">
          <div>
            <h3 class="font-bold text-lg text-white">{game.name}</h3>
            <span class="inline-block px-2.5 py-1 bg-white/10 text-xs rounded-full text-gray-300 mt-3 whitespace-nowrap font-medium">
              {new Date(game.start_time).toLocaleDateString()} - {new Date(game.end_time).toLocaleDateString()}
            </span>
            <p class="text-sm text-gray-400 mt-3 bg-black/20 p-2 rounded">
              {game.challenges_per_team} Challenges &bull; {game.lives_per_challenge} Lives
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
</div>
