<script lang="ts">
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabaseClient';
  import { onDestroy, onMount } from 'svelte';

  let { children } = $props();

  let gameId = $derived($page.params.gameId ?? '');
  let teamName = $state('');
  let coins = $state<number | null>(null);
  let teamId = $state('');

  // ---------- toast notifications ----------

  type Toast = {
    id: number;
    message: string;
    type: 'gain' | 'loss' | 'info';
  };

  let toasts = $state<Toast[]>([]);
  let nextToastId = 0;

  function addToast(message: string, type: Toast['type'] = 'info') {
    const id = nextToastId++;
    toasts = [...toasts, { id, message, type }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 4000);
  }

  // ---------- coin tracking ----------

  async function loadTeamInfo() {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;

    const { data: memberData } = await supabase
      .from('team_members')
      .select('team_id, teams!inner(name, coins, game_id)')
      .eq('user_id', userId)
      .eq('teams.game_id', gameId)
      .limit(1)
      .maybeSingle();

    if (memberData) {
      const team = Array.isArray(memberData.teams) ? memberData.teams[0] : memberData.teams;
      teamId = memberData.team_id ?? '';
      teamName = (team as any)?.name ?? '';
      coins = (team as any)?.coins ?? 0;
    }
  }

  onMount(() => {
    void loadTeamInfo();
  });

  // ---------- Realtime: watch for coin changes on our team ----------

  let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

  $effect(() => {
    // Re-subscribe when teamId becomes known (async from loadTeamInfo)
    if (!teamId) return;

    // Clean up prior subscription if any
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }

    realtimeChannel = supabase.channel(`team-coins:${teamId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'teams',
        filter: `id=eq.${teamId}`
      }, (payload) => {
        const newCoins = (payload.new as any)?.coins;
        const oldCoins = coins;

        if (typeof newCoins === 'number' && newCoins !== oldCoins) {
          const delta = newCoins - (oldCoins ?? 0);
          coins = newCoins;

          if (delta > 0) {
            addToast(`+${delta} coins`, 'gain');
          } else if (delta < 0) {
            addToast(`${delta} coins`, 'loss');
          }
        }
      })
      .subscribe();

    return () => {
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
    };
  });

  onDestroy(() => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  });
</script>

<!-- Persistent coin counter -->
{#if coins !== null && teamName}
  <div class="fixed top-20 right-4 z-40 flex flex-col items-end gap-2 pointer-events-none">
    <div class="pointer-events-auto px-4 py-2 rounded-xl bg-slate-900/90 border border-white/10 backdrop-blur-md shadow-xl flex items-center gap-3 text-sm">
      <span class="text-gray-400 font-medium">{teamName}</span>
      <span class="font-bold text-lg text-amber-300 font-mono">{coins}</span>
      <span class="text-gray-500 text-xs">coins</span>
    </div>

    <!-- Toast notifications -->
    {#each toasts as toast (toast.id)}
      <div
        class="pointer-events-auto px-4 py-2 rounded-xl shadow-lg text-sm font-bold animate-slide-in
          {toast.type === 'gain' ? 'bg-green-500/20 border border-green-500/40 text-green-300' :
           toast.type === 'loss' ? 'bg-red-500/20 border border-red-500/40 text-red-300' :
           'bg-white/10 border border-white/20 text-gray-200'}"
      >
        {toast.message}
      </div>
    {/each}
  </div>
{/if}

{@render children()}

<style>
  @keyframes slide-in {
    from {
      opacity: 0;
      transform: translateX(1rem);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  :global(.animate-slide-in) {
    animation: slide-in 0.3s ease-out;
  }
</style>
