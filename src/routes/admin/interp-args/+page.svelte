<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let interpArgs = $state<any[]>([]);
  let name = $state('');
  let configuration = $state('{\n  "flags": []\n}');
  let errorMessage = $state('');

  onMount(() => {
    fetchArgs();
  });

  async function fetchArgs() {
    const { data, error } = await supabase.from('interp_args').select('*').order('created_at', { ascending: false });
    if (data) interpArgs = data;
    if (error) console.error(error);
  }

  async function createArg() {
    errorMessage = '';
    
    let parsedConfig;
    try {
      parsedConfig = JSON.parse(configuration);
    } catch (e: any) {
      errorMessage = 'Invalid JSON in configuration: ' + e.message;
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error } = await supabase.from('interp_args').insert({
      name,
      configuration: parsedConfig,
      created_by: userData.user.id
    });

    if (error) {
      errorMessage = error.message;
    } else {
      name = '';
      configuration = '{\n  "flags": []\n}';
      fetchArgs();
    }
  }

  async function deleteArg(id: string) {
    if (!confirm('Are you sure you want to delete this Interp Argument? It may be linked to active challenges.')) return;
    const { error } = await supabase.from('interp_args').delete().eq('id', id);
    if (error) alert(error.message);
    else fetchArgs();
  }
</script>

<div class="p-8 max-w-5xl mx-auto space-y-8 dark">
  <div class="flex items-center space-x-4 border-b border-white/10 pb-6">
    <a href="/admin" class="text-gray-400 hover:text-white transition-colors">&larr; Back</a>
    <h1 class="text-3xl font-bold tracking-tight text-white">Manage Interp Args</h1>
  </div>

  {#if errorMessage}
    <div class="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-lg px-4 py-3">
      {errorMessage}
    </div>
  {/if}

  <div class="bg-black/40 border border-white/10 rounded-xl p-6">
    <h2 class="text-xl font-bold text-white mb-6 pl-2 border-l-4 border-red-500">Create New Interp Argument</h2>
    
    <div class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Name</label>
          <input bind:value={name} placeholder="e.g. strict-mode-v1" class="w-full bg-slate-900/50 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
        </div>
      </div>
      
      <div>
        <label class="block text-sm font-medium text-gray-300 mb-2">Configuration (JSON)</label>
        <textarea bind:value={configuration} rows="6" class="w-full bg-slate-900/50 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all font-mono text-sm"></textarea>
      </div>
      
      <button onclick={createArg} class="bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 px-6 rounded-md transition-colors shadow-lg shadow-red-500/20">
        Create Argument
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    {#each interpArgs as arg}
      <div class="bg-slate-900/40 border border-white/10 rounded-xl p-6 flex flex-col justify-between group hover:border-white/20 transition-all">
        <div>
          <div class="flex justify-between items-start mb-4">
            <h3 class="text-xl font-bold text-white group-hover:text-red-400 transition-colors">{arg.name}</h3>
            <button onclick={() => deleteArg(arg.id)} class="text-gray-500 hover:text-red-500 transition-colors px-2 py-1 rounded hover:bg-red-500/10">Delete</button>
          </div>
          <pre class="bg-black/50 p-4 rounded-md text-xs text-gray-300 overflow-x-auto border border-white/5">{JSON.stringify(arg.configuration, null, 2)}</pre>
        </div>
      </div>
    {/each}
    {#if interpArgs.length === 0}
      <div class="col-span-1 md:col-span-2 text-center py-12 text-gray-500 border border-dashed border-white/10 rounded-xl bg-white/5">
        No interp args defined yet.
      </div>
    {/if}
  </div>
</div>
