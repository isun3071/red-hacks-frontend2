<script lang="ts">
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let gameId = $derived($page.params.gameId);
  let challenges = $state<any[]>([]);
  let selectedChallengeId = $state('');
  let attackPrompt = $state('');
  let secretKeyGuess = $state('');
  let loading = $state(false);
  let attackResult = $state<any>(null);

  onMount(async () => {
    // Fetch challenges currently defended by other teams
    const { data } = await supabase
      .from('defended_challenges')
      .select('id, lives_remaining, teams(name), challenges(id, description, type, model_name)')
      .eq('is_active', true)
      .gt('lives_remaining', 0);
      
    if (data) challenges = data;
  });

  async function performAttack() {
    loading = true;
    attackResult = null;

    const { data: user } = await supabase.auth.getUser();

    // In a real implementation this should call a Supabase Edge Function to securely
    // combine the system prompt and call the LLM to prevent leaking.
    try {
      const { data, error } = await supabase.functions.invoke('attack', {
        body: {
          defended_challenge_id: selectedChallengeId,
          attacker_user_id: user?.user?.id,
          prompt: attackPrompt,
          guess: secretKeyGuess
        }
      });

      if (error) {
        attackResult = { error: error.message || 'Failed to connect to attack server' };
      } else {
        attackResult = data;
      }
    } catch (e) {
      attackResult = { error: 'Failed to connect to attack server' };
    }

    loading = false;
  }
</script>

<div class="p-8 max-w-6xl mx-auto space-y-8">
  <div class="border-b border-white/10 pb-6">
    <h1 class="text-4xl font-black tracking-tight text-white mb-2 flex items-center gap-3">
      <span class="text-red-500">⚡</span> Red Team: Attack Interface
    </h1>
    <p class="text-gray-400 text-lg">Select an opponent's defended challenge to attack. Bypass their system prompt to extract the secret key or trigger the forbidden tool!</p>
  </div>
  
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="col-span-1 border border-white/10 bg-slate-900/50 backdrop-blur-md rounded-xl overflow-hidden h-[600px] flex flex-col shadow-xl">
      <div class="p-4 border-b border-white/10 bg-black/40 top-0 sticky z-10">
        <h2 class="text-xs font-bold text-gray-400 tracking-widest uppercase">Available Targets</h2>
      </div>
      <div class="divide-y divide-white/5 overflow-y-auto flex-1">
        {#each challenges as target}
          <button 
            class="w-full text-left p-5 hover:bg-slate-800/80 transition-all block group {selectedChallengeId === target.id ? 'bg-red-500/10 border-l-4 border-red-500' : 'border-l-4 border-transparent'}"
            onclick={() => selectedChallengeId = target.id}
          >
            <div class="font-bold text-white mb-1 group-hover:text-red-300 transition-colors">{target.teams?.name}</div>
            <div class="text-xs text-gray-400 mb-3 truncate font-mono">{target.challenges?.model_name} • {target.challenges?.type}</div>
            <div class="flex items-center space-x-1.5">
              {#each Array(target.lives_remaining) as _}
                <div class="w-2.5 h-2.5 rounded-sm bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
              {/each}
            </div>
          </button>
        {/each}
      </div>
    </div>

    <div class="col-span-1 md:col-span-2 border border-white/10 bg-slate-900/50 backdrop-blur-md rounded-xl p-8 flex flex-col shadow-xl relative overflow-hidden">
      <!-- Background dramatic flare -->
      <div class="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-red-500/5 rounded-full blur-[80px] pointer-events-none"></div>

      {#if selectedChallengeId}
        {@const selected = challenges.find(c => c.id === selectedChallengeId)}
        <div class="mb-6 pb-6 border-b border-white/10 relative z-10">
          <div class="flex justify-between items-start">
            <div>
              <h2 class="text-2xl font-bold text-white mb-2">Targeting: <span class="text-red-400">{selected.teams?.name}</span></h2>
              <p class="text-sm text-gray-400 leading-relaxed max-w-xl">{selected.challenges?.description}</p>
            </div>
            <span class="px-3 py-1 bg-black/40 border border-white/10 rounded-full text-xs font-mono text-gray-300">
              {selected.challenges?.model_name}
            </span>
          </div>
        </div>

        <div class="flex-1 space-y-6 relative z-10">
          <div class="space-y-3">
            <label class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Your Attack Prompt</label>
            <textarea 
              bind:value={attackPrompt} 
              class="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white h-48 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all placeholder:text-gray-600 font-mono text-sm leading-relaxed" 
              placeholder="> Initialize prompt override..."></textarea>
          </div>

          {#if selected.challenges?.type === 'secret-key'}
            <div class="space-y-3">
              <label class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Secret Key Guess</label>
              <input 
                bind:value={secretKeyGuess} 
                class="w-full bg-black/60 border border-white/10 rounded-xl p-4 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all placeholder:text-gray-600 font-mono text-sm" 
                placeholder="Submit sequence if extracted..." />
            </div>
          {/if}
        </div>

        <div class="mt-8 pt-6 border-t border-white/10 relative z-10">
          <button 
            onclick={performAttack} 
            disabled={loading || !attackPrompt} 
            class="bg-red-600 hover:bg-red-500 text-white px-6 py-4 rounded-xl font-bold disabled:opacity-50 transition-all w-full text-lg tracking-wide shadow-[0_0_15px_rgba(220,38,38,0.3)] hover:shadow-[0_0_25px_rgba(220,38,38,0.5)] active:scale-[0.98] uppercase"
          >
            {loading ? 'EXECUTING INJECTION...' : 'LAUNCH ATTACK'}
          </button>
        </div>

        {#if attackResult}
          <div class="mt-6 p-5 rounded-xl border relative overflow-hidden z-10 {attackResult.success ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-red-500/10 border-red-500/50 text-red-500'}">
            <div class="font-black text-lg mb-2 flex items-center gap-2">
              {attackResult.success ? '✅ TARGET COMPROMISED!' : '❌ ATTACK FAILED'}
            </div>
            <div class="text-sm opacity-90 font-medium">{attackResult.message || attackResult.error}</div>
            {#if attackResult.log}
              <div class="mt-3 text-xs bg-black/60 p-3 rounded-lg text-gray-300 font-mono h-32 overflow-y-auto border border-white/5">
                {attackResult.log}
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="flex-1 flex flex-col items-center justify-center text-gray-500 space-y-4">
          <div class="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
            <span class="text-2xl">🎯</span>
          </div>
          <p class="text-lg font-medium">No target selected</p>
          <p class="text-sm">Select an opponent from the list to begin the assault.</p>
        </div>
      {/if}
    </div>
  </div>
</div>
