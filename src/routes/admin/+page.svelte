<div class="p-8 max-w-5xl mx-auto space-y-8">
  <div class="border-b border-white/10 pb-6">
    <h1 class="text-3xl font-bold tracking-tight text-white">Admin Dashboard</h1>
    <p class="text-gray-400 mt-2">Manage the competition framework infrastructure.</p>
  </div>
  
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <a href="/admin/games" class="p-6 border border-white/10 bg-slate-900/40 backdrop-blur-sm rounded-xl hover:bg-slate-800 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10 transition-all group">
      <h2 class="text-xl font-bold group-hover:text-red-400 transition-colors">Manage Games &rarr;</h2>
      <p class="text-gray-400 mt-2 leading-relaxed">Create new sessions, set time limits, specify allowed attempts, and view active competition matches.</p>
    </a>

    <a href="/admin/challenges" class="p-6 border border-white/10 bg-slate-900/40 backdrop-blur-sm rounded-xl hover:bg-slate-800 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10 transition-all group">
      <h2 class="text-xl font-bold group-hover:text-red-400 transition-colors">Manage Challenges &rarr;</h2>
      <p class="text-gray-400 mt-2 leading-relaxed">Define the prompt injection targets, choose models (gpt-4o, llama), establish secret keys and set system contexts.</p>
    </a>

    <a href="/admin/tools" class="p-6 border border-white/10 bg-slate-900/40 backdrop-blur-sm rounded-xl hover:bg-slate-800 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10 transition-all group">
      <h2 class="text-xl font-bold group-hover:text-red-400 transition-colors">Manage Tools &rarr;</h2>
      <p class="text-gray-400 mt-2 leading-relaxed">Configure the simulated JSON functions available to the LLM that attackers must trigger during tool-calling challenges.</p>
    </a>

    <a href="/admin/interp-args" class="p-6 border border-white/10 bg-slate-900/40 backdrop-blur-sm rounded-xl hover:bg-slate-800 hover:border-red-500/50 hover:shadow-lg hover:shadow-red-500/10 transition-all group">
      <h2 class="text-xl font-bold group-hover:text-red-400 transition-colors">Manage Interp Args &rarr;</h2>
      <p class="text-gray-400 mt-2 leading-relaxed">Create and manage interpretation arguments and configurations for specialized models like llama-interp-server.</p>
    </a>
  </div>
</div>
