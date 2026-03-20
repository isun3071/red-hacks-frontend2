<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';

  let { children } = $props();
  let loading = $state(true);
  let isAdmin = $state(false);

  onMount(async () => {
    // 1. Get the current authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      goto('/');
      return;
    }

    // 2. Fetch their profile to check role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    // 3. Verify if they are an admin
    if (profile?.role !== 'admin') {
      // Redirect to play hub if they are just a standard player
      goto('/play');
      return;
    }

    isAdmin = true;
    loading = false;
  });
</script>

{#if loading}
  <div class="flex h-screen w-full items-center justify-center transition-all bg-slate-950">
    <div class="text-center space-y-4">
      <div class="w-12 h-12 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin mx-auto"></div>
      <p class="text-gray-400 font-medium">Verifying Admin Privileges...</p>
    </div>
  </div>
{:else if isAdmin}
  {@render children()}
{/if}
