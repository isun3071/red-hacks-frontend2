<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabaseClient';
  import { onMount } from 'svelte';

  type TeamMember = {
    id: string;
    user_id: string;
    role: 'leader' | 'member';
    joined_at: string;
    profiles: { username: string | null }[] | null;
  };

  let gameId = $derived($page.params.gameId);
  let teamId = $derived($page.params.teamId);
  let userId = $state('');
  let myRole = $state<'leader' | 'member' | ''>('');
  let team = $state<any>(null);
  let members = $state<TeamMember[]>([]);
  let teamNameInput = $state('');

  let loading = $state(true);
  let actionLoading = $state(false);
  let message = $state('');
  let isError = $state(false);

  const isLeader = $derived(myRole === 'leader');

  onMount(async () => {
    await bootstrap();
  });

  async function bootstrap() {
    loading = true;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      await supabase.auth.signInAnonymously();
    }

    const { data: currentUser } = await supabase.auth.getUser();
    if (!currentUser?.user) {
      message = 'Could not load your account.';
      isError = true;
      loading = false;
      return;
    }

    userId = currentUser.user.id;
    await loadTeamContext();
    loading = false;
  }

  async function loadTeamContext() {
    const { data: myMembership, error: membershipError } = await supabase
      .from('team_members')
      .select('role, teams!inner(id, name, game_id, invite_code, coins, created_at, games(id, name, is_active, start_time, end_time))')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .eq('teams.game_id', gameId)
      .maybeSingle();

    if (membershipError) {
      message = membershipError.message;
      isError = true;
      return;
    }

    if (!myMembership?.teams) {
      message = 'You are not a member of this team for this game.';
      isError = true;
      team = null;
      members = [];
      return;
    }

    myRole = myMembership.role;
    team = myMembership.teams;
    teamNameInput = team.name;

    const { data: memberRows, error: membersError } = await supabase
      .from('team_members')
      .select('id, user_id, role, joined_at, profiles(username)')
      .eq('team_id', teamId)
      .order('joined_at', { ascending: true });

    if (membersError) {
      message = membersError.message;
      isError = true;
      return;
    }

    members = (memberRows || []) as TeamMember[];
    message = '';
    isError = false;
  }

  function memberLabel(member: TeamMember) {
    if (member.user_id === userId) return 'You';
    return member.profiles?.[0]?.username || member.user_id.slice(0, 8);
  }

  async function renameTeam() {
    if (!isLeader || !teamNameInput.trim() || !team) return;
    const nextName = teamNameInput.trim();
    if (nextName === team.name) return;

    actionLoading = true;
    message = '';
    isError = false;

    const { error } = await supabase
      .from('teams')
      .update({ name: nextName })
      .eq('id', teamId);

    if (error) {
      message = error.message;
      isError = true;
      actionLoading = false;
      return;
    }

    message = 'Team name updated.';
    await loadTeamContext();
    actionLoading = false;
  }

  async function transferOwnership(targetUserId: string) {
    if (!isLeader || targetUserId === userId) return;

    actionLoading = true;
    message = '';
    isError = false;

    const { error: promoteError } = await supabase
      .from('team_members')
      .update({ role: 'leader' })
      .eq('team_id', teamId)
      .eq('user_id', targetUserId);

    if (promoteError) {
      message = promoteError.message;
      isError = true;
      actionLoading = false;
      return;
    }

    const { error: demoteError } = await supabase
      .from('team_members')
      .update({ role: 'member' })
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (demoteError) {
      message = demoteError.message;
      isError = true;
      actionLoading = false;
      return;
    }

    message = 'Ownership transferred.';
    await loadTeamContext();
    actionLoading = false;
  }

  async function removeMember(targetUserId: string) {
    if (!isLeader || targetUserId === userId) return;

    const confirmed = window.confirm('Remove this member from the team?');
    if (!confirmed) return;

    actionLoading = true;
    message = '';
    isError = false;

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', targetUserId);

    if (error) {
      message = error.message;
      isError = true;
      actionLoading = false;
      return;
    }

    message = 'Member removed.';
    await loadTeamContext();
    actionLoading = false;
  }

  async function leaveTeam() {
    if (!team) return;

    const otherMembers = members.filter((member) => member.user_id !== userId);

    if (isLeader && otherMembers.length > 0) {
      message = 'Transfer ownership before leaving this team.';
      isError = true;
      return;
    }

    actionLoading = true;
    message = '';
    isError = false;

    if (isLeader && otherMembers.length === 0) {
      const deleteConfirmed = window.confirm('You are the only member. Leave and delete this team?');
      if (!deleteConfirmed) {
        actionLoading = false;
        return;
      }

      const { error: deleteTeamError } = await supabase
        .from('teams')
        .delete()
        .eq('id', teamId);

      if (deleteTeamError) {
        message = deleteTeamError.message;
        isError = true;
        actionLoading = false;
        return;
      }

      await goto(`/game/${gameId}`);
      return;
    }

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);

    if (error) {
      message = error.message;
      isError = true;
      actionLoading = false;
      return;
    }

    await goto(`/game/${gameId}`);
  }
</script>

<div class="p-8 max-w-5xl mx-auto space-y-8">
  <div class="flex items-start justify-between border-b border-white/10 pb-6 gap-4">
    <div>
      <p class="text-xs uppercase tracking-[0.2em] text-gray-500">Team Management</p>
      <h1 class="text-3xl font-black text-white mt-2">{team?.name || 'Team'}</h1>
      {#if team?.games}
        <p class="text-gray-400 mt-2">Game: {team.games.name}</p>
      {/if}
    </div>
    <button
      class="px-4 py-2 rounded-lg border border-white/20 text-gray-200 hover:bg-white/10"
      onclick={() => goto(`/game/${gameId}`)}
      type="button"
    >
      Back to Game Hub
    </button>
  </div>

  {#if message}
    <div class="p-4 rounded-lg border {isError ? 'bg-red-500/10 border-red-500/50 text-red-300' : 'bg-green-500/10 border-green-500/50 text-green-300'}">
      {message}
    </div>
  {/if}

  {#if loading}
    <div class="text-gray-400">Loading team...</div>
  {:else if !team}
    <div class="border border-red-500/30 bg-red-500/10 text-red-300 p-4 rounded-lg">
      You do not have access to this team.
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section class="lg:col-span-1 border border-white/10 bg-slate-900/50 rounded-xl p-5 space-y-4">
        <h2 class="text-xl font-bold text-white">Team Settings</h2>
        <p class="text-sm text-gray-400">Your role: <span class="font-semibold {isLeader ? 'text-red-400' : 'text-blue-400'}">{myRole}</span></p>

        <div class="space-y-2">
          <label for="team-name" class="text-sm text-gray-300">Team Name</label>
          <input
            id="team-name"
            bind:value={teamNameInput}
            disabled={!isLeader || actionLoading}
            class="w-full bg-black/40 border border-white/10 rounded-md p-2.5 text-white disabled:opacity-60 focus:ring-2 focus:ring-red-500/40 outline-none"
          />
        </div>

        <button
          class="w-full px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-500 disabled:opacity-50"
          disabled={!isLeader || actionLoading || !teamNameInput.trim()}
          onclick={renameTeam}
          type="button"
        >
          {actionLoading ? 'Working...' : 'Rename Team'}
        </button>

        <div class="pt-3 border-t border-white/10 space-y-3">
          <p class="text-sm text-gray-400">Team Invite Code</p>
          <p class="font-mono text-red-300 text-lg tracking-[0.2em]">TEAM:{team.invite_code}</p>
          <p class="text-sm text-gray-300">Team Coins: <span class="text-red-400 font-semibold">{team.coins ?? 0}</span></p>
        </div>

        <button
          class="w-full px-4 py-2 rounded-md border border-white/20 text-gray-100 hover:bg-white/10 disabled:opacity-50"
          disabled={actionLoading}
          onclick={leaveTeam}
          type="button"
        >
          Leave Team
        </button>
      </section>

      <section class="lg:col-span-2 border border-white/10 bg-slate-900/50 rounded-xl p-5 space-y-4">
        <h2 class="text-xl font-bold text-white">Members</h2>
        <div class="divide-y divide-white/5 border border-white/10 rounded-lg overflow-hidden">
          {#each members as member}
            <div class="p-4 flex items-center justify-between gap-3">
              <div>
                <div class="text-white font-semibold">{memberLabel(member)}</div>
                <div class="text-xs text-gray-500 mt-1">{member.role === 'leader' ? 'Leader' : 'Member'}</div>
              </div>

              {#if isLeader && member.user_id !== userId}
                <div class="flex gap-2">
                  <button
                    class="px-3 py-1.5 rounded-md border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 text-sm"
                    disabled={actionLoading}
                    onclick={() => transferOwnership(member.user_id)}
                    type="button"
                  >
                    Make Leader
                  </button>
                  <button
                    class="px-3 py-1.5 rounded-md border border-red-500/40 text-red-300 hover:bg-red-500/10 text-sm"
                    disabled={actionLoading}
                    onclick={() => removeMember(member.user_id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>
