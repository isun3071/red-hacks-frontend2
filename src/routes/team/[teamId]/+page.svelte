<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let teamId = $derived($page.params.teamId);
  let errorMessage = $state('');

  onMount(async () => {
    const { data: teamRow } = await supabase
      .from('teams')
      .select('id, game_id')
      .eq('id', teamId)
      .maybeSingle();

    if (!teamRow?.game_id) {
      errorMessage = 'Team not found.';
      return;
    }

    goto(`/game/${teamRow.game_id}/team/${teamId}`);
  });
</script>

<div class="p-8 max-w-3xl mx-auto">
  {#if errorMessage}
    <div class="border border-red-500/30 bg-red-500/10 text-red-300 p-4 rounded-lg">{errorMessage}</div>
  {:else}
    <div class="text-gray-400">Redirecting to game-scoped team page...</div>
  {/if}
</div>
