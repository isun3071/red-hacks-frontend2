<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let tools = $state<any[]>([]);
  let name = $state('');
  let description = $state('');
  let spec = $state('');
  let loading = $state(false);
  let errorMsg = $state('');

  onMount(async () => {
    await fetchTools();
  });

  async function fetchTools() {
    const { data, error } = await supabase.from('tools').select('*');
    if (data) tools = data;
    if (error) console.error(error);
  }

  async function createTool() {
    loading = true;
    errorMsg = '';
    
    let parsedSpec;
    try {
      parsedSpec = JSON.parse(spec);
    } catch(e) {
      errorMsg = 'Invalid JSON in OpenRouter Tool Specification';
      loading = false;
      return;
    }

    const { data: user } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('tools')
      .insert([{
        name,
        description,
        spec: parsedSpec,
        created_by: user?.user?.id || null
      }])
      .select()
      .single();

    if (error) {
      errorMsg = error.message;
    } else {
      name = '';
      description = '';
      spec = '';
      await fetchTools();
    }
    
    loading = false;
  }
</script>

<div class="p-8 max-w-5xl mx-auto space-y-8">
  <div class="flex items-center justify-between border-b border-white/10 pb-6">
    <div class="space-y-1">
      <h1 class="text-3xl font-bold tracking-tight text-white">Manage Tools</h1>
      <p class="text-gray-400">Configure functions that LLMs can invoke during tool-calling challenges.</p>
    </div>
  </div>
  
  {#if errorMsg}
    <div class="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-md">
      {errorMsg}
    </div>
  {/if}

  <div class="border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl space-y-4 shadow-xl">
    <h2 class="text-xl font-semibold text-white">Create New Tool</h2>
    
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2 col-span-2 md:col-span-1">
        <label class="text-sm font-medium text-gray-300">Tool Name</label>
        <input bind:value={name} placeholder="e.g. weather_api" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>

      <div class="space-y-2 col-span-2">
        <label class="text-sm font-medium text-gray-300">Description</label>
        <textarea bind:value={description} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white h-20 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" placeholder="Describe the tool..."></textarea>
      </div>

      <div class="space-y-2 col-span-2">
        <label class="text-sm font-medium text-gray-300">OpenRouter Tool Specification (JSON)</label>
        <textarea bind:value={spec} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white font-mono text-sm h-48 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" placeholder={'{ "type": "function", "function": { "name": "get_weather", "description": "Get current weather" } }'}></textarea>
      </div>
    </div>

    <button onclick={createTool} disabled={loading || !name || !spec} class="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded-lg font-bold disabled:opacity-50 mt-6 transition-all shadow-lg hover:shadow-red-500/20 active:scale-[0.98]">
      {loading ? 'Creating...' : 'Create Tool'}
    </button>
  </div>

  <div class="space-y-4 pt-8">
    <h2 class="text-xl font-semibold text-white">Existing Tools</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each tools as tool}
        <div class="border border-white/10 bg-slate-900/40 backdrop-blur-sm p-5 rounded-xl hover:border-red-500/30 transition-colors shadow-lg">
          <h3 class="font-bold text-lg text-white">{tool.name}</h3>
          <p class="text-sm text-gray-400 mt-3 line-clamp-2 leading-relaxed">{tool.description}</p>
        </div>
      {/each}
      {#if tools.length === 0}
        <p class="text-gray-500 text-sm col-span-full">No tools created yet. Create one above to get started.</p>
      {/if}
    </div>
  </div>
</div>
