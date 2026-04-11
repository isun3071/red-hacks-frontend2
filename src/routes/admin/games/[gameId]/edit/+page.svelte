<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    computePlannedRoundMinutes,
    computeRoundsBasedEndTime,
    loadGameChallenges,
    loadGameRounds,
    replaceGameChallenges,
    replaceGameRounds,
    toDatetimeLocal,
    validateAllRounds,
    validateRoundDraft,
    type RoundDraft
  } from '$lib/adminGames';
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let gameId = $derived($page.params.gameId ?? '');

  let allChallenges = $state<any[]>([]);
  let pageLoading = $state(true);
  let saving = $state(false);
  let errorMsg = $state('');
  let successMsg = $state('');

  // Game metadata
  let name = $state('');
  let start_time = $state('');
  let end_time = $state('');
  let is_active = $state(false);
  let invite_code = $state('');
  let startTimeInput = $state<HTMLInputElement | null>(null);

  // Challenge pool selected at game level
  let selectedChallengeIds = $state<string[]>([]);

  // Round draft form state
  let roundName = $state('Round 1');
  let roundType = $state<'pvp' | 'pve'>('pvp');
  let roundRequiredDefenses = $state(1);
  let roundDurationMinutes = $state(60);
  let roundIntermissionMinutes = $state(5);
  let roundChallengeIds = $state<string[]>([]);
  let roundDrafts = $state<RoundDraft[]>([]);
  let editingRoundIndex = $state<number | null>(null);

  function allChallengeIds() {
    return allChallenges.map((challenge) => challenge.id);
  }

  function resetRoundDraftFields() {
    roundName = `Round ${roundDrafts.length + 1}`;
    roundType = 'pvp';
    roundRequiredDefenses = Math.max(1, allChallenges.length - 1 || 1);
    roundDurationMinutes = 60;
    roundIntermissionMinutes = 5;
    roundChallengeIds = allChallengeIds();
    editingRoundIndex = null;
  }

  function toggleChallengeSelection(challengeId: string) {
    if (selectedChallengeIds.includes(challengeId)) {
      selectedChallengeIds = selectedChallengeIds.filter((id) => id !== challengeId);
    } else {
      selectedChallengeIds = [...selectedChallengeIds, challengeId];
    }
  }

  function toggleRoundChallengeSelection(challengeId: string) {
    if (roundChallengeIds.includes(challengeId)) {
      roundChallengeIds = roundChallengeIds.filter((id) => id !== challengeId);
    } else {
      roundChallengeIds = [...roundChallengeIds, challengeId];
    }
  }

  function buildDraftFromForm(): RoundDraft {
    const existing = editingRoundIndex !== null
      ? roundDrafts.find((r) => r.round_index === editingRoundIndex)
      : null;
    return {
      round_index: editingRoundIndex ?? roundDrafts.length,
      name: roundName.trim(),
      type: roundType,
      required_defenses: Math.trunc(Number(roundRequiredDefenses)),
      duration_minutes: Math.trunc(Number(roundDurationMinutes)),
      intermission_minutes: Math.trunc(Number(roundIntermissionMinutes)),
      available_challenges: Array.from(new Set(roundChallengeIds)),
      is_enabled: existing ? existing.is_enabled : true
    };
  }

  function toggleRoundEnabled(roundIndex: number) {
    roundDrafts = roundDrafts.map((r) =>
      r.round_index === roundIndex ? { ...r, is_enabled: !r.is_enabled } : r
    );
  }

  /**
   * Shift game.start_time backward so the given round starts at Date.now().
   * Implemented by summing durations of all *enabled* rounds before the
   * target. Also ensures the target round itself is enabled. Writes to local
   * form state only — admin must still click Save Game to persist.
   */
  function reactivateRound(roundIndex: number) {
    // Ensure target is enabled
    roundDrafts = roundDrafts.map((r) =>
      r.round_index === roundIndex ? { ...r, is_enabled: true } : r
    );

    // Sum enabled rounds strictly before the target
    const priorMinutes = roundDrafts.reduce((total, r) => {
      if (r.round_index >= roundIndex) return total;
      if (r.is_enabled === false) return total;
      const duration = Math.max(1, Math.trunc(r.duration_minutes));
      const intermission = Math.max(0, Math.trunc(r.intermission_minutes));
      return total + duration + intermission;
    }, 0);

    const newStartMs = Date.now() - priorMinutes * 60_000;
    const d = new Date(newStartMs);
    const pad = (n: number) => n.toString().padStart(2, '0');
    start_time = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    successMsg = `Start time shifted so "${roundDrafts.find(r => r.round_index === roundIndex)?.name}" starts now. Click Save Game to apply.`;
    errorMsg = '';
  }

  function saveRoundDraft() {
    const draft = buildDraftFromForm();
    const err = validateRoundDraft(draft);
    if (err) {
      errorMsg = err;
      return;
    }

    if (editingRoundIndex !== null) {
      roundDrafts = roundDrafts.map((r) => (r.round_index === editingRoundIndex ? draft : r));
    } else {
      roundDrafts = [...roundDrafts, draft];
    }

    errorMsg = '';
    resetRoundDraftFields();
  }

  function editRoundDraft(roundIndex: number) {
    const target = roundDrafts.find((r) => r.round_index === roundIndex);
    if (!target) return;
    roundName = target.name;
    roundType = target.type;
    roundRequiredDefenses = target.required_defenses;
    roundDurationMinutes = target.duration_minutes;
    roundIntermissionMinutes = target.intermission_minutes;
    roundChallengeIds = [...target.available_challenges];
    editingRoundIndex = target.round_index;
    errorMsg = '';
  }

  function cancelRoundEdit() {
    resetRoundDraftFields();
    errorMsg = '';
  }

  function removeRoundDraft(roundIndex: number) {
    roundDrafts = roundDrafts
      .filter((draft) => draft.round_index !== roundIndex)
      .map((draft, index) => ({ ...draft, round_index: index }));
    if (editingRoundIndex === roundIndex) {
      resetRoundDraftFields();
    }
  }

  let plannedMinutes = $derived(computePlannedRoundMinutes(roundDrafts));
  let computedEnd = $derived(computeRoundsBasedEndTime(start_time, roundDrafts));

  async function saveGame() {
    saving = true;
    errorMsg = '';
    successMsg = '';

    const trimmedName = name.trim();
    if (!trimmedName) {
      errorMsg = 'Game name cannot be empty.';
      saving = false;
      return;
    }

    const startDate = new Date(start_time);
    const effectiveEnd = roundDrafts.length > 0 ? (computedEnd ?? end_time) : end_time;
    const endDate = new Date(effectiveEnd);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      errorMsg = 'Invalid start or end time.';
      saving = false;
      return;
    }

    if (endDate <= startDate) {
      errorMsg = 'End time must be after start time.';
      saving = false;
      return;
    }

    const roundValidation = validateAllRounds(roundDrafts);
    if (roundValidation) {
      errorMsg = roundValidation;
      saving = false;
      return;
    }

    const challengePool = Array.from(
      new Set([
        ...selectedChallengeIds,
        ...roundDrafts.flatMap((round) => round.available_challenges)
      ])
    );

    if (challengePool.length === 0) {
      errorMsg = 'Select at least one challenge for this game.';
      saving = false;
      return;
    }

    const { error: updateError } = await supabase
      .from('games')
      .update({
        name: trimmedName,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        is_active
      })
      .eq('id', gameId);

    if (updateError) {
      errorMsg = updateError.message;
      saving = false;
      return;
    }

    try {
      await replaceGameChallenges(supabase, gameId, challengePool);
      if (roundDrafts.length > 0) {
        await replaceGameRounds(supabase, gameId, roundDrafts);
      }
    } catch (err: any) {
      errorMsg = `Game updated, but challenges/rounds failed: ${err.message}`;
      saving = false;
      return;
    }

    successMsg = 'Game saved.';
    saving = false;
  }

  async function deleteGame() {
    if (!confirm(`Delete "${name}"? This removes the game, its rounds, teams, and all attack history. This cannot be undone.`)) return;

    saving = true;
    const { error } = await supabase.from('games').delete().eq('id', gameId);
    saving = false;

    if (error) {
      errorMsg = `Failed to delete: ${error.message}`;
      return;
    }

    goto('/admin/games');
  }

  onMount(async () => {
    const [{ data: gameRow, error: gameError }, { data: challengesData, error: challengesError }] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameId).maybeSingle(),
      supabase
        .from('challenges')
        .select('id, name, model_name, type, description')
        .order('created_at', { ascending: true })
    ]);

    if (gameError || !gameRow) {
      errorMsg = gameError?.message ?? 'Game not found.';
      pageLoading = false;
      return;
    }

    if (challengesError) {
      errorMsg = challengesError.message;
    }

    allChallenges = challengesData ?? [];

    name = gameRow.name ?? '';
    start_time = toDatetimeLocal(gameRow.start_time);
    end_time = toDatetimeLocal(gameRow.end_time);
    is_active = Boolean(gameRow.is_active);
    invite_code = gameRow.invite_code ?? '';

    try {
      selectedChallengeIds = await loadGameChallenges(supabase, gameId);
      roundDrafts = await loadGameRounds(supabase, gameId);
    } catch (err: any) {
      errorMsg = err.message ?? 'Failed to load game rounds/challenges.';
    }

    resetRoundDraftFields();
    pageLoading = false;
  });
</script>

<div class="p-8 max-w-5xl mx-auto space-y-8">
  <div class="flex items-center justify-between border-b border-white/10 pb-6">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-white">Edit Game</h1>
      {#if invite_code}
        <p class="text-gray-400">Invite code: <span class="font-mono text-red-400">{invite_code}</span></p>
      {/if}
    </div>
    <a href="/admin/games" class="px-3 py-1.5 rounded border border-white/15 text-sm text-gray-200 hover:bg-white/10">← Back to Games</a>
  </div>

  {#if pageLoading}
    <div class="text-gray-400">Loading game...</div>
  {:else}
    {#if errorMsg}
      <div class="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-md">{errorMsg}</div>
    {/if}
    {#if successMsg}
      <div class="bg-green-500/10 border border-green-500/40 text-green-300 p-4 rounded-md">{successMsg}</div>
    {/if}

    <div class="border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl space-y-4">
      <h2 class="text-xl font-semibold text-white">Metadata</h2>

      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2 col-span-2">
          <p class="text-sm font-medium text-gray-300">Name</p>
          <input bind:value={name} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
        </div>

        <div class="space-y-2 col-span-2 md:col-span-1">
          <p class="text-sm font-medium text-gray-300">Start Time</p>
          <div class="flex gap-2">
            <input
              bind:this={startTimeInput}
              type="datetime-local"
              step="60"
              value={start_time}
              onchange={(event) => { start_time = (event.currentTarget as HTMLInputElement).value; }}
              class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all"
            />
            <button type="button" class="shrink-0 px-3 rounded-md border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10" onclick={() => startTimeInput?.showPicker?.()}>Pick</button>
          </div>
        </div>
        <div class="space-y-2 col-span-2 md:col-span-1">
          <p class="text-sm font-medium text-gray-300">End Time {roundDrafts.length > 0 ? '(Auto from Rounds)' : ''}</p>
          {#if roundDrafts.length > 0}
            <div class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white/90 font-mono">
              {computedEnd ?? 'Set start time to compute end'}
            </div>
          {:else}
            <input type="datetime-local" step="60" bind:value={end_time} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
          {/if}
        </div>

        <div class="col-span-2">
          <label class="flex items-center gap-3 text-sm text-gray-200">
            <input type="checkbox" bind:checked={is_active} class="h-4 w-4" />
            <span>Active (admin-enabled — players can see this game)</span>
          </label>
          <p class="text-xs text-gray-500 mt-1">Pause by unchecking. Phase (pre-game / round-active / post-game) is computed from the time window.</p>
        </div>
      </div>
    </div>

    <!-- Challenge pool -->
    <div class="border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl space-y-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-semibold text-white">Challenges Included In This Game</h2>
        <div class="flex items-center gap-2">
          <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => selectedChallengeIds = allChallengeIds()}>Select all</button>
          <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => selectedChallengeIds = []}>Clear</button>
        </div>
      </div>
      {#if allChallenges.length === 0}
        <div class="text-sm text-gray-500 border border-white/10 rounded-lg p-3 bg-black/20">No challenges exist yet.</div>
      {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-3 border border-white/10 rounded-lg bg-black/20">
          {#each allChallenges as challenge}
            <label class="flex items-start gap-3 p-2 rounded hover:bg-white/5 cursor-pointer">
              <input type="checkbox" checked={selectedChallengeIds.includes(challenge.id)} onchange={() => toggleChallengeSelection(challenge.id)} class="mt-0.5" />
              <span class="text-sm">
                <span class="text-white font-semibold">{challenge.name ?? challenge.model_name}</span>
                <span class="text-gray-500 ml-2">{challenge.type}</span>
              </span>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Rounds editor -->
    <div class="border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold text-white">Rounds</h2>
          <p class="text-xs text-gray-500">Add, edit, or remove rounds. Changes apply on Save Game.</p>
        </div>
      </div>

      {#if editingRoundIndex !== null}
        <div class="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
          Editing Round {editingRoundIndex + 1}. <button type="button" class="underline ml-1" onclick={cancelRoundEdit}>Cancel edit</button>
        </div>
      {/if}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 border border-white/10 rounded-xl bg-black/20 p-4">
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-300">Round Name</p>
          <input bind:value={roundName} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
        </div>
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-300">Round Type</p>
          <select bind:value={roundType} class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all">
            <option value="pvp">PvP</option>
            <option value="pve">PvE</option>
          </select>
        </div>
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-300">Required Defenses</p>
          <input bind:value={roundRequiredDefenses} type="number" min="1" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
          <p class="text-xs text-gray-500">Must be &le; {Math.max(0, roundChallengeIds.length - 1)} (one less than selected).</p>
        </div>
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-300">Round Duration (minutes)</p>
          <input bind:value={roundDurationMinutes} type="number" min="1" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
        </div>
        <div class="space-y-2">
          <p class="text-sm font-medium text-gray-300">Intermission (minutes)</p>
          <input bind:value={roundIntermissionMinutes} type="number" min="0" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
        </div>
        <div class="space-y-2 md:col-span-2">
          <p class="text-sm font-medium text-gray-300">Round Challenges</p>
          {#if allChallenges.length === 0}
            <div class="text-sm text-gray-500 border border-white/10 rounded-lg p-3 bg-black/20">No challenges exist yet.</div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 border border-white/10 rounded-lg bg-black/30">
              {#each allChallenges as challenge}
                <label class="flex items-start gap-3 p-2 rounded hover:bg-white/5 cursor-pointer">
                  <input type="checkbox" checked={roundChallengeIds.includes(challenge.id)} onchange={() => toggleRoundChallengeSelection(challenge.id)} class="mt-0.5" />
                  <span class="text-sm">
                    <span class="text-white font-semibold">{challenge.name ?? challenge.model_name}</span>
                    <span class="text-gray-500 ml-2">{challenge.type}</span>
                  </span>
                </label>
              {/each}
            </div>
          {/if}
        </div>
        <div class="md:col-span-2 flex items-center justify-between gap-3 flex-wrap">
          <p class="text-xs text-gray-500">Round uses {roundChallengeIds.length} challenge(s) and requires {roundRequiredDefenses} defense(s).</p>
          <button type="button" class="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold" onclick={saveRoundDraft}>
            {editingRoundIndex !== null ? 'Save Round' : 'Add Round'}
          </button>
        </div>
      </div>

      {#if roundDrafts.length > 0}
        <div class="space-y-2">
          {#each roundDrafts as round (round.round_index)}
            <div class="flex items-center justify-between gap-3 rounded-lg border {round.is_enabled ? 'border-white/10 bg-slate-900/50' : 'border-white/5 bg-slate-950/30 opacity-60'} p-3">
              <div>
                <p class="font-semibold text-white flex items-center gap-2">
                  {round.round_index + 1}. {round.name}
                  {#if !round.is_enabled}
                    <span class="text-xs font-normal uppercase tracking-wider text-gray-500 border border-white/10 px-1.5 py-0.5 rounded">Disabled</span>
                  {/if}
                </p>
                <p class="text-xs text-gray-500 uppercase tracking-wider">{round.type} • {round.available_challenges.length} challenge(s) • {round.required_defenses} required defense(s)</p>
                <p class="text-xs text-gray-400 mt-1">{round.duration_minutes}m round • {round.intermission_minutes}m break</p>
              </div>
              <div class="flex items-center gap-2 flex-wrap justify-end">
                <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => toggleRoundEnabled(round.round_index)}>
                  {round.is_enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded border border-amber-500/40 text-xs text-amber-200 hover:bg-amber-500/10"
                  title="Shift game start_time so this round begins now. Click Save Game to persist."
                  onclick={() => reactivateRound(round.round_index)}
                >
                  Reactivate Now
                </button>
                <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => editRoundDraft(round.round_index)}>Edit</button>
                <button type="button" class="px-2.5 py-1 rounded border border-red-500/30 text-xs text-red-300 hover:bg-red-500/10" onclick={() => removeRoundDraft(round.round_index)}>Remove</button>
              </div>
            </div>
          {/each}
        </div>
        <div class="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-gray-300">
          Planned timeline: <span class="font-semibold text-white">{plannedMinutes} min</span>
          {#if computedEnd}
            · ends at <span class="font-semibold text-white">{computedEnd}</span>
          {/if}
        </div>
      {:else}
        <div class="text-sm text-gray-500 border border-white/10 rounded-lg p-3 bg-black/20">No rounds configured. Add at least one.</div>
      {/if}
    </div>

    <div class="flex items-center justify-between gap-3 pt-4 border-t border-white/10">
      <button type="button" class="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 text-sm font-bold" onclick={deleteGame} disabled={saving}>
        Delete Game
      </button>
      <button type="button" class="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold disabled:opacity-50" onclick={saveGame} disabled={saving}>
        {saving ? 'Saving...' : 'Save Game'}
      </button>
    </div>
  {/if}
</div>
