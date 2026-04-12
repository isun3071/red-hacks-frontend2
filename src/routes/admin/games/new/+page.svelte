<script lang="ts">
  import { goto } from '$app/navigation';
  import {
    defaultStartTime,
    computeRoundsBasedEndTime,
    computePlannedRoundMinutes,
    generateInviteCode,
    replaceGameChallenges,
    replaceGameRounds,
    validateAllRounds,
    validateRoundDraft,
    type RoundDraft
  } from '$lib/adminGames';
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  let allChallenges = $state<any[]>([]);
  let loading = $state(false);
  let errorMsg = $state('');

  // Game metadata
  let name = $state('');
  let start_time = $state(defaultStartTime());
  let end_time = $state('');
  let startTimeInput = $state<HTMLInputElement | null>(null);
  let challenges_per_team = $state(5);
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
    roundRequiredDefenses = Math.max(1, Math.min(challenges_per_team, allChallenges.length - 1 || 1));
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

  function clearRoundDrafts() {
    roundDrafts = [];
    resetRoundDraftFields();
  }

  let plannedMinutes = $derived(computePlannedRoundMinutes(roundDrafts));
  let computedEnd = $derived(computeRoundsBasedEndTime(start_time, roundDrafts));

  async function createGame() {
    loading = true;
    errorMsg = '';

    if (!name.trim()) {
      errorMsg = 'Game name is required.';
      loading = false;
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
      loading = false;
      return;
    }

    // Default round if admin didn't configure any
    const roundsToSave: RoundDraft[] = roundDrafts.length > 0
      ? roundDrafts
      : [
          {
            round_index: 0,
            name: 'Round 1',
            type: 'pvp',
            required_defenses: Math.max(1, Math.min(challenges_per_team, challengePool.length - 1)),
            duration_minutes: 60,
            intermission_minutes: 5,
            available_challenges: challengePool,
            is_enabled: true
          }
        ];

    const dateTimeLocalPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    const proposedEndTime = computeRoundsBasedEndTime(start_time, roundsToSave) ?? end_time;
    if (!dateTimeLocalPattern.test(start_time) || !proposedEndTime || !dateTimeLocalPattern.test(proposedEndTime)) {
      errorMsg = 'Please select valid start and end date/time values.';
      loading = false;
      return;
    }

    if (proposedEndTime <= start_time) {
      errorMsg = 'End time must be after start time.';
      loading = false;
      return;
    }

    const roundValidation = validateAllRounds(roundsToSave);
    if (roundValidation) {
      errorMsg = roundValidation;
      loading = false;
      return;
    }

    const startDate = new Date(start_time);
    const endDate = new Date(proposedEndTime);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      errorMsg = 'Could not parse start/end time. Please reselect both values.';
      loading = false;
      return;
    }

    const { data: user } = await supabase.auth.getUser();
    const invite_code = generateInviteCode();

    const { data: createdGame, error } = await supabase
      .from('games')
      .insert([
        {
          name: name.trim(),
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          challenges_per_team,
          invite_code,
          // Paused by default — admin explicitly activates from the list or edit page.
          is_active: false,
          created_by: user?.user?.id || null
        }
      ])
      .select()
      .single();

    if (error || !createdGame) {
      errorMsg = error?.message ?? 'Failed to create game.';
      loading = false;
      return;
    }

    try {
      await replaceGameChallenges(supabase, createdGame.id, challengePool);
      await replaceGameRounds(supabase, createdGame.id, roundsToSave);
    } catch (challengeError: any) {
      errorMsg = `Game created, but round or challenge mapping failed: ${challengeError.message}`;
      loading = false;
      return;
    }

    loading = false;
    goto('/admin/games');
  }

  onMount(async () => {
    const { data, error } = await supabase
      .from('challenges')
      .select('id, name, model_name, type, description')
      .order('created_at', { ascending: true });

    if (error) {
      errorMsg = error.message;
      return;
    }

    allChallenges = data ?? [];
    selectedChallengeIds = allChallengeIds();
    roundChallengeIds = allChallengeIds();
    resetRoundDraftFields();
  });
</script>

<div class="p-8 max-w-5xl mx-auto space-y-8">
  <div class="flex items-center justify-between border-b border-white/10 pb-6">
    <div>
      <h1 class="text-4xl font-black tracking-tight text-white">Create New Game</h1>
      <p class="text-gray-400">Configure rounds and challenges, then save. Games start paused — activate them from the games list.</p>
    </div>
    <a href="/admin/games" class="px-3 py-1.5 rounded border border-white/15 text-sm text-gray-200 hover:bg-white/10">← Back to Games</a>
  </div>

  {#if errorMsg}
    <div class="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-md">{errorMsg}</div>
  {/if}

  <div class="border border-white/10 bg-slate-900/50 backdrop-blur-sm p-6 rounded-xl space-y-4 shadow-xl">
    <div class="grid grid-cols-2 gap-4">
      <div class="space-y-2 col-span-2">
        <p class="text-sm font-medium text-gray-300">Game Name</p>
        <input bind:value={name} placeholder="RedHacks 2026 Season 1" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
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
        <p class="text-xs text-gray-500">Defaults to 15 minutes from now so the round doesn't start immediately.</p>
      </div>
      <div class="space-y-2 col-span-2 md:col-span-1">
        <p class="text-sm font-medium text-gray-300">End Time (computed from rounds)</p>
        <div class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white/90 font-mono">
          {computedEnd ?? 'Add rounds to compute'}
        </div>
      </div>

      <div class="space-y-2 col-span-2 md:col-span-1">
        <p class="text-sm font-medium text-gray-300">Default Defenses Per Round</p>
        <input type="number" bind:value={challenges_per_team} min="1" max="20" class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all" />
      </div>

      <div class="space-y-3 col-span-2">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-medium text-gray-300">Challenges Included In This Game</p>
          <div class="flex items-center gap-2">
            <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => selectedChallengeIds = allChallengeIds()}>Select all</button>
            <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => selectedChallengeIds = []}>Clear</button>
          </div>
        </div>
        {#if allChallenges.length === 0}
          <div class="text-sm text-gray-500 border border-white/10 rounded-lg p-3 bg-black/20">No challenges exist yet. Create one in Admin → Challenges first.</div>
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
    </div>

    <!-- Rounds section -->
    <div class="space-y-4 col-span-2 border border-white/10 rounded-xl bg-black/20 p-4">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-gray-300">Rounds</p>
          <p class="text-xs text-gray-500">Add one or more rounds for this game. Duration drives the total game window.</p>
        </div>
        <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={clearRoundDrafts}>Clear rounds</button>
      </div>

      {#if editingRoundIndex !== null}
        <div class="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
          Editing Round {editingRoundIndex + 1}. <button type="button" class="underline ml-1" onclick={cancelRoundEdit}>Cancel</button>
        </div>
      {/if}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <p class="text-xs text-gray-500">Round uses {roundChallengeIds.length} challenge(s) and requires {roundRequiredDefenses} defense(s).</p>
        <button type="button" class="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-semibold" onclick={saveRoundDraft} disabled={allChallenges.length === 0}>
          {editingRoundIndex !== null ? 'Save Round' : 'Add Round'}
        </button>
      </div>

      {#if roundDrafts.length > 0}
        <div class="space-y-3 border-t border-white/10 pt-4">
          <p class="text-sm font-medium text-gray-300">Draft Rounds</p>
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
                <div class="flex items-center gap-2">
                  <button type="button" class="px-2.5 py-1 rounded border border-white/15 text-xs text-gray-200 hover:bg-white/10" onclick={() => toggleRoundEnabled(round.round_index)}>
                    {round.is_enabled ? 'Disable' : 'Enable'}
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
        </div>
      {/if}
    </div>

    <button onclick={createGame} disabled={loading || !name || !start_time || (selectedChallengeIds.length === 0 && roundDrafts.length === 0) || allChallenges.length === 0} class="w-full bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded-lg font-bold disabled:opacity-50 mt-6 transition-all">
      {loading ? 'Creating...' : 'Create Game (Paused)'}
    </button>
  </div>
</div>
