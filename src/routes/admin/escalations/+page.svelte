<script lang="ts">
  import { supabase } from '$lib/supabaseClient';
  import { TIER_COEFFICIENTS, type JudgeTier } from '$lib/judge';
  import { onMount } from 'svelte';

  type EscalationRow = {
    id: string;
    attacker_team_id: string;
    defended_challenge_id: string | null;
    challenge_id: string | null;
    judge_verdict: string | null;
    judge_reason: string | null;
    escalation_status: string | null;
    escrow_amount: number | null;
    escrow_snapshot: any;
    log: any;
    created_at: string;
    attacker_team?: { id: string; name: string } | null;
    defender_team?: { id: string; name: string; coins: number } | null;
    challenge?: { id: string; name: string | null; model_name: string; type: string; judge_rubric: any } | null;
    defender_system_prompt?: string | null;
    transcript?: Array<{ role: string; content: string }>;
  };

  let escalations = $state<EscalationRow[]>([]);
  let loading = $state(true);
  let resolveMessage = $state('');
  let resolveError = $state(false);
  let selectedVerdict = $state<Record<string, JudgeTier>>({});
  let adminNotes = $state<Record<string, string>>({});
  let resolvingId = $state('');

  async function load() {
    loading = true;
    resolveMessage = '';

    const { data: rows, error } = await supabase
      .from('attacks')
      .select('id, attacker_team_id, defended_challenge_id, challenge_id, judge_verdict, judge_reason, escalation_status, escrow_amount, escrow_snapshot, log, created_at')
      .eq('escalation_status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      resolveMessage = error.message;
      resolveError = true;
      loading = false;
      return;
    }

    // Hydrate each row with team, defender, challenge, transcript info
    const hydrated: EscalationRow[] = [];
    for (const row of rows ?? []) {
      const [attackerTeam, defendedChallenge] = await Promise.all([
        supabase.from('teams').select('id, name').eq('id', row.attacker_team_id).maybeSingle(),
        row.defended_challenge_id
          ? supabase
              .from('defended_challenges')
              .select('id, team_id, system_prompt, teams(id, name, coins), challenges(id, name, model_name, type, judge_rubric)')
              .eq('id', row.defended_challenge_id)
              .maybeSingle()
          : Promise.resolve({ data: null })
      ]);

      const dc: any = defendedChallenge.data;
      const defenderTeam = dc?.teams ? (Array.isArray(dc.teams) ? dc.teams[0] : dc.teams) : null;
      const challenge = dc?.challenges ? (Array.isArray(dc.challenges) ? dc.challenges[0] : dc.challenges) : null;

      // Pull transcript from the latest attacks rows for this attacker/target
      // that preceded this escalated end-attack call. We approximate by
      // reading all attack rows with matching team + defended_challenge_id,
      // created before this one.
      const { data: transcriptRows } = await supabase
        .from('attacks')
        .select('log, created_at')
        .eq('attacker_team_id', row.attacker_team_id)
        .eq('defended_challenge_id', row.defended_challenge_id ?? '')
        .lt('created_at', row.created_at)
        .order('created_at', { ascending: true });

      const transcript: Array<{ role: string; content: string }> = [];
      for (const tr of transcriptRows ?? []) {
        const log = (tr as any).log;
        if (log?.latest_prompt) transcript.push({ role: 'user', content: String(log.latest_prompt) });
        if (log?.assistant_message) transcript.push({ role: 'assistant', content: String(log.assistant_message) });
      }

      hydrated.push({
        ...(row as any),
        attacker_team: attackerTeam.data,
        defender_team: defenderTeam,
        challenge,
        defender_system_prompt: dc?.system_prompt ?? null,
        transcript
      });
    }

    escalations = hydrated;
    loading = false;
  }

  async function resolveEscalation(row: EscalationRow) {
    const verdict = selectedVerdict[row.id];
    if (!verdict) {
      resolveMessage = 'Select a verdict tier first.';
      resolveError = true;
      return;
    }

    resolvingId = row.id;
    resolveMessage = '';
    resolveError = false;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        resolveMessage = 'Your session expired. Sign in again.';
        resolveError = true;
        return;
      }

      const response = await fetch('/admin/escalations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          attack_id: row.id,
          verdict,
          note: adminNotes[row.id] ?? ''
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        resolveMessage = data?.error || 'Resolution failed.';
        resolveError = true;
        return;
      }

      resolveMessage = `Resolved as ${verdict} (${data.coefficient}x). Attacker got ${data.attacker_payout}, defender refunded ${data.defender_refund}.`;
      resolveError = false;
      await load();
    } catch (err: any) {
      resolveMessage = err?.message || 'Resolution request failed.';
      resolveError = true;
    } finally {
      resolvingId = '';
    }
  }

  onMount(() => { void load(); });
</script>

<div class="p-8 max-w-5xl mx-auto space-y-6">
  <div class="flex items-center justify-between border-b border-white/10 pb-6">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-white">Escalations</h1>
      <p class="text-gray-400">Pending judge escalations awaiting admin review.</p>
    </div>
    <div class="flex items-center gap-2">
      <a href="/admin" class="px-3 py-1.5 rounded border border-white/15 text-sm text-gray-200 hover:bg-white/10">← Admin</a>
      <button onclick={load} disabled={loading} class="px-3 py-1.5 rounded border border-white/15 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-50">Refresh</button>
    </div>
  </div>

  {#if resolveMessage}
    <div class="p-3 rounded-md border {resolveError ? 'bg-red-500/10 border-red-500/40 text-red-400' : 'bg-green-500/10 border-green-500/40 text-green-300'}">
      {resolveMessage}
    </div>
  {/if}

  {#if loading}
    <div class="text-gray-400">Loading escalations...</div>
  {:else if escalations.length === 0}
    <div class="border border-white/10 bg-slate-900/40 p-10 rounded-xl text-center text-gray-400">
      No pending escalations. 🎉
    </div>
  {:else}
    <div class="space-y-6">
      {#each escalations as row (row.id)}
        <div class="border border-amber-500/30 bg-slate-900/50 rounded-xl p-6 space-y-4 shadow-xl">
          <div class="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 class="font-bold text-white text-xl">
                {row.challenge?.name ?? row.challenge?.model_name ?? '(challenge)'}
                <span class="ml-2 text-xs font-normal text-amber-400 uppercase tracking-wider border border-amber-500/40 px-1.5 py-0.5 rounded">pending</span>
              </h2>
              <p class="text-xs text-gray-400 mt-1 font-mono">
                {row.attacker_team?.name ?? '(attacker team)'} → {row.defender_team?.name ?? '(defender)'}
              </p>
              <p class="text-xs text-gray-500 mt-1">Submitted {new Date(row.created_at).toLocaleString()}</p>
            </div>
            <div class="text-right">
              <p class="font-mono text-xs text-gray-400">Escrow</p>
              <p class="font-bold text-amber-300 font-mono">{row.escrow_amount ?? 0} coins held</p>
              <p class="text-[10px] text-gray-500 font-mono mt-1">Defender now: {row.defender_team?.coins ?? 0}</p>
            </div>
          </div>

          {#if row.judge_reason}
            <div class="px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-gray-300">
              <span class="font-semibold text-gray-200">Judge failure reason:</span> {row.judge_reason}
            </div>
          {/if}

          {#if row.challenge?.judge_rubric}
            <details class="bg-black/30 rounded-lg border border-white/10 p-3 text-sm">
              <summary class="cursor-pointer text-gray-300 font-semibold">Rubric</summary>
              <pre class="mt-2 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(row.challenge.judge_rubric, null, 2)}</pre>
            </details>
          {/if}

          {#if row.defender_system_prompt}
            <details class="bg-black/30 rounded-lg border border-white/10 p-3 text-sm">
              <summary class="cursor-pointer text-gray-300 font-semibold">Defender system prompt</summary>
              <pre class="mt-2 text-xs font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">{row.defender_system_prompt}</pre>
            </details>
          {/if}

          {#if row.transcript && row.transcript.length > 0}
            <details class="bg-black/30 rounded-lg border border-white/10 p-3 text-sm" open>
              <summary class="cursor-pointer text-gray-300 font-semibold">Transcript ({row.transcript.length} turn(s))</summary>
              <div class="mt-2 space-y-2 max-h-96 overflow-y-auto">
                {#each row.transcript as msg}
                  <div class="rounded p-2 text-xs {msg.role === 'user' ? 'bg-red-500/5 border border-red-500/20 text-red-200' : 'bg-white/5 border border-white/10 text-gray-200'}">
                    <div class="uppercase text-[10px] tracking-wider mb-1 {msg.role === 'user' ? 'text-red-300' : 'text-gray-400'}">{msg.role}</div>
                    <div class="whitespace-pre-wrap font-mono">{msg.content}</div>
                  </div>
                {/each}
              </div>
            </details>
          {/if}

          <div class="pt-3 border-t border-white/10 space-y-3">
            <p class="text-sm font-semibold text-gray-300">Your verdict</p>
            <div class="grid grid-cols-5 gap-2">
              {#each ['none', 'structural', 'partial', 'substantial', 'full'] as tier}
                <button
                  type="button"
                  onclick={() => selectedVerdict = { ...selectedVerdict, [row.id]: tier as JudgeTier }}
                  class="px-2 py-2 rounded-lg text-xs font-bold uppercase border transition-colors {selectedVerdict[row.id] === tier ? 'bg-red-600 border-red-500 text-white' : 'bg-black/40 border-white/10 text-gray-300 hover:bg-white/10'}"
                >
                  {tier}<br /><span class="text-[10px] opacity-70">×{TIER_COEFFICIENTS[tier as JudgeTier]}</span>
                </button>
              {/each}
            </div>
            <textarea
              bind:value={adminNotes[row.id]}
              placeholder="Optional admin note (visible in attack log)"
              class="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-white text-sm focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none placeholder:text-gray-600"
            ></textarea>
            <button
              onclick={() => resolveEscalation(row)}
              disabled={!selectedVerdict[row.id] || resolvingId === row.id}
              class="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-lg font-bold disabled:opacity-50"
            >
              {resolvingId === row.id ? 'Resolving...' : 'Settle attack with this verdict'}
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
