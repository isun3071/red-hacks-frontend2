// POST endpoint: admin resolves a pending escalation by selecting a
// verdict tier. Server recomputes payout from snapshotted inputs, credits
// the attacker up to the escrow held, and refunds the defender the
// remainder. Post-refund elimination check.

import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { calculateAttackBonus } from '$lib/bonus';
import { TIER_COEFFICIENTS, type JudgeTier } from '$lib/judge';
import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

function createSupabaseAdminClient() {
	const supabaseUrl = PUBLIC_SUPABASE_URL;
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY;
	if (!supabaseUrl || !serviceRoleKey) {
		throw new Error('Supabase admin credentials are not configured on the server.');
	}
	return createClient(supabaseUrl, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}

function extractBearerToken(authorizationHeader: string | null): string | null {
	const m = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
	return m?.[1] ?? null;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const supabaseAdmin = createSupabaseAdminClient();
		const accessToken = extractBearerToken(request.headers.get('authorization'));
		if (!accessToken) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const { data: authData } = await supabaseAdmin.auth.getUser(accessToken);
		const adminUserId = authData.user?.id;
		if (!adminUserId) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		// Verify admin role
		const { data: profile, error: profileError } = await supabaseAdmin
			.from('profiles')
			.select('role')
			.eq('id', adminUserId)
			.maybeSingle();
		if (profileError || profile?.role !== 'admin') {
			return json({ success: false, error: 'Admin role required' }, { status: 403 });
		}

		const body = (await request.json()) as { attack_id?: string; verdict?: string; note?: string };
		if (!body.attack_id || typeof body.attack_id !== 'string') {
			return json({ success: false, error: 'attack_id required' }, { status: 400 });
		}
		const validTiers: JudgeTier[] = ['none', 'structural', 'partial', 'substantial', 'full'];
		if (!body.verdict || !validTiers.includes(body.verdict as JudgeTier)) {
			return json({ success: false, error: 'verdict must be one of: ' + validTiers.join(', ') }, { status: 400 });
		}

		const verdict = body.verdict as JudgeTier;
		const coefficient = TIER_COEFFICIENTS[verdict];

		// Load the escalated attack row
		const { data: attackRow, error: attackError } = await supabaseAdmin
			.from('attacks')
			.select('id, attacker_team_id, defended_challenge_id, challenge_id, escalation_status, escrow_amount, escrow_snapshot, log, judge_reason')
			.eq('id', body.attack_id)
			.maybeSingle();

		if (attackError || !attackRow) {
			return json({ success: false, error: 'Attack not found' }, { status: 404 });
		}

		if (attackRow.escalation_status !== 'pending') {
			return json({ success: false, error: 'Attack is not pending review' }, { status: 400 });
		}

		const escrow = Math.max(0, Math.trunc(attackRow.escrow_amount ?? 0));
		const snapshot = (attackRow.escrow_snapshot ?? {}) as Record<string, number>;

		// Recompute reward from snapshotted inputs with admin's chosen coefficient
		const reward = calculateAttackBonus({
			turnCount: Number(snapshot.turn_count) || 1,
			charCount: Number(snapshot.char_count) || 0,
			attackStealCoins: Number(snapshot.attack_steal_coins) || 0,
			defenseRewardCoins: Number(snapshot.defense_reward_coins) || 0,
			coefficient
		});

		// Find the defender team id. We need it to refund.
		// If this was a PvP attack, defended_challenge_id points to a
		// defended_challenges row whose team_id is the defender.
		let defenderTeamId: string | null = null;
		if (attackRow.defended_challenge_id) {
			const { data: dc } = await supabaseAdmin
				.from('defended_challenges')
				.select('team_id')
				.eq('id', attackRow.defended_challenge_id)
				.maybeSingle();
			defenderTeamId = dc?.team_id ?? null;
		}

		if (!defenderTeamId || !attackRow.attacker_team_id) {
			return json({ success: false, error: 'Missing team references on the attack row' }, { status: 500 });
		}

		// Settle coins: attacker gets min(ruled_payout, escrow). Defender
		// gets back the remainder.
		const attackerPayout = Math.min(reward.total, escrow);
		const defenderRefund = escrow - attackerPayout;

		let attackerCoinsAfter: number | null = null;
		let defenderCoinsAfter: number | null = null;

		if (attackerPayout > 0) {
			const { data: newAtt } = await supabaseAdmin.rpc('increment_team_coins', {
				p_team_id: attackRow.attacker_team_id,
				p_delta: attackerPayout
			});
			if (typeof newAtt === 'number') attackerCoinsAfter = newAtt;
		}

		if (defenderRefund > 0) {
			const { data: newDef } = await supabaseAdmin.rpc('increment_team_coins', {
				p_team_id: defenderTeamId,
				p_delta: defenderRefund
			});
			if (typeof newDef === 'number') defenderCoinsAfter = newDef;

			// Refund may have brought them back above 0 — reactivate defenses.
			if (typeof newDef === 'number' && newDef > 0) {
				await supabaseAdmin
					.from('defended_challenges')
					.update({ is_active: true })
					.eq('team_id', defenderTeamId);
			}
		}

		// Update the attack row with the resolution
		const resolvedLog = {
			...(attackRow.log as Record<string, unknown> | null ?? {}),
			resolved_by: adminUserId,
			resolved_at: new Date().toISOString(),
			admin_note: typeof body.note === 'string' ? body.note : null,
			final_coefficient: coefficient,
			final_verdict: verdict,
			attacker_payout: attackerPayout,
			defender_refund: defenderRefund,
			attacker_coins_after: attackerCoinsAfter,
			defender_coins_after: defenderCoinsAfter
		};

		await supabaseAdmin
			.from('attacks')
			.update({
				escalation_status: 'resolved',
				judge_verdict: verdict,
				judge_coefficient: coefficient,
				judge_reason: (attackRow.judge_reason ?? '') + (body.note ? `\n\n[ADMIN] ${body.note}` : ''),
				is_successful: coefficient > 0,
				log: resolvedLog
			})
			.eq('id', body.attack_id);

		return json({
			success: true,
			verdict,
			coefficient,
			attacker_payout: attackerPayout,
			defender_refund: defenderRefund,
			attacker_coins_after: attackerCoinsAfter,
			defender_coins_after: defenderCoinsAfter
		});
	} catch (err: any) {
		return json({ success: false, error: err?.message ?? 'resolution failed' }, { status: 500 });
	}
};
