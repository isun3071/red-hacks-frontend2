<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  // UI state
  let challenges = $state<any[]>([]);
  let tools = $state<any[]>([]);
  let interpArgs = $state<any[]>([]);

  // Form state
  let model_name = $state('');
  let description = $state('');
  let default_prompt = $state('');
  let context = $state('');
  let type = $state('secret-key');
  let target_tool_name = $state('');
  let selectedTools = $state<string[]>([]);
  let interp_arg_id = $state('');
  let loading = $state(false);
  let errorMsg = $state('');

  onMount(async () => {
    await fetchChallenges();
    await fetchTools();
    await fetchInterpArgs();
  });

  async function fetchChallenges() {
    const { data, error } = await supabase.from('challenges').select('*');
    if (data) challenges = data;
    if (error) console.error(error);
  }

  async function fetchTools() {
    const { data, error } = await supabase.from('tools').select('*');
    if (data) tools = data;
  }

  async function fetchInterpArgs() {
    const { data, error } = await supabase.from('interp_args').select('*');
    if (data) interpArgs = data;
  }

  async function createChallenge() {
    loading = true;
    errorMsg = '';

    const { data: user } = await supabase.auth.getUser();
    
    const newChallenge = {
      model_name,
      description,
      default_prompt,
      context,
      type,
      target_tool_name: type === 'tool-calling' ? target_tool_name : null,
      interp_arg_id: interp_arg_id || null,
      created_by: user?.user?.id || null
    };

    const { data, error } = await supabase
      .from('challenges')
      .insert([newChallenge])
      .select()
      .single();

    if (error) {
      errorMsg = error.message;
    } else {
      if (selectedTools.length > 0 && data) {
        const challengeTools = selectedTools.map(tool_id => ({
          challenge_id: data.id,
          tool_id
        }));
        await supabase.from('challenge_tools').insert(challengeTools);
      }
      
      model_name = '';
      description = '';
      default_prompt = '';
      context = '';
      type = 'secret-key';
      target_tool_name = '';
      selectedTools = [];
      interp_arg_id = '';
      await fetchChallenges();
    }
    loading = false;
  }
</script>

<div class="p-8 max-w-5xl mx-auto space-y-8">
  <div class="flex items-center justify-between border-b border-white/10 pb-6">
    <div class="space-y-1">
      <h1 class="text-3xl font-bold tracking-tight text-white">Manage Challenges</h1>
      <p class="text-gray-400">Create and configure LLM targets for the competition.</p>
    </div>
  </div>
  
  {#if errorMsg}
    <div class="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-md">
      {errorMsg}
    </div>
  {/if}

  <div class="border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl space-y-4 shadow-xl">
    <h2 class="text-xl font-semibold text-white">Create New Challenge</h2>
    
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2">
        <label class="text-sm font-medium text-gray-300">Model Name</label>
        <input bind:value={model_name} placeholder="e.g. gpt-4o, llama-interp-server" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>

      <div class="space-y-2">
        <label class="text-sm font-medium text-gray-300">Type</label>
        <select bind:value={type} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all">
          <option value="secret-key">Secret Key</option>
          <option value="tool-calling">Tool Calling</option>
        </select>
      </div>

      <div class="space-y-2 col-span-2">
        <label class="text-sm font-medium text-gray-300">Description</label>
        <textarea bind:value={description} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white h-20 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" placeholder="Describe the challenge..."></textarea>
      </div>

      <div class="space-y-2 col-span-2">
        <label class="text-sm font-medium text-gray-300">Default Prompt</label>
        <textarea bind:value={default_prompt} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white h-20 focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" placeholder="Default prompt if team provides none..."></textarea>
      </div>

      <div class="space-y-2 col-span-2">
        <label class="text-sm font-medium text-gray-300">System Context</label>
        <textarea bind:value={context} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white h-32 font-mono text-sm focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" placeholder="Model system instructions..."></textarea>
      </div>

      {#if type === 'tool-calling'}
        <div class="space-y-2">
          <label class="text-sm font-medium text-gray-300">Target Tool Call Name (Victory Condition)</label>
          <input bind:value={target_tool_name} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
        </div>
        <div class="space-y-2 col-span-2">
          <label class="text-sm font-medium text-gray-300">Available Tools</label>
          <!-- Multiple select for tools -->
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-2">
            {#each tools as tool}
              <label class="flex items-center space-x-3 text-white text-sm bg-black/40 p-3 rounded-lg border border-white/10 hover:border-red-500/50 hover:bg-slate-800/50 transition-all cursor-pointer">
                <input type="checkbox" bind:group={selectedTools} value={tool.id} class="accent-red-500 w-4 h-4 rounded border-white/20 bg-black/40" />
                <span class="font-medium">{tool.name}</span>
              </label>
            {/each}
          </div>
        </div>
      {/if}

      {#if model_name === 'llama-interp-server'}
        <div class="space-y-2 col-span-2">
          <label class="text-sm font-medium text-gray-300">Interp Args (Configuration)</label>
          <select bind:value={interp_arg_id} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all">
            <option value="">None</option>
            {#each interpArgs as arg}
              <option value={arg.id}>{arg.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <button onclick={createChallenge} disabled={loading || !model_name || !description} class="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded-lg font-bold disabled:opacity-50 mt-6 transition-all shadow-lg hover:shadow-red-500/20 active:scale-[0.98]">
      {loading ? 'Creating...' : 'Create Challenge'}
    </button>
  </div>

  <div class="space-y-4 pt-8">
    <h2 class="text-xl font-semibold text-white">Existing Challenges</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each challenges as challenge}
        <div class="border border-white/10 bg-slate-900/40 backdrop-blur-sm p-5 rounded-xl hover:border-red-500/30 transition-colors shadow-lg">
          <h3 class="font-bold text-lg text-white">{challenge.model_name}</h3>
          <span class="inline-block px-2.5 py-1 bg-red-500/10 border border-red-500/20 text-xs rounded-full text-red-400 mt-2 font-medium">{challenge.type}</span>
          <p class="text-sm text-gray-400 mt-3 line-clamp-2 leading-relaxed">{challenge.description}</p>
        </div>
      {/each}
      {#if challenges.length === 0}
        <p class="text-gray-500 text-sm col-span-full">No challenges created yet. Create one above to get started.</p>
      {/if}
    </div>
  </div>
</div>
