// Shared types and pure helpers for the admin games flows.
// Used by /admin/games, /admin/games/new, /admin/games/[gameId]/edit.

import type { SupabaseClient } from '@supabase/supabase-js'

export type RoundDraft = {
	round_index: number
	name: string
	type: 'pvp' | 'pve'
	required_defenses: number
	duration_minutes: number
	intermission_minutes: number
	available_challenges: string[]
	is_enabled: boolean
}

export function defaultStartTime(offsetMinutes = 15): string {
	const d = new Date(Date.now() + offsetMinutes * 60 * 1000)
	const pad = (n: number) => n.toString().padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function toDatetimeLocal(isoString: string | null | undefined): string {
	if (!isoString) return ''
	const d = new Date(isoString)
	if (Number.isNaN(d.getTime())) return ''
	const pad = (n: number) => n.toString().padStart(2, '0')
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function generateInviteCode(): string {
	return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export function computePlannedRoundMinutes(rounds: RoundDraft[]): number {
	// Disabled rounds don't contribute to the schedule, matching the runtime
	// phase computation that filters them out.
	return rounds.reduce((total, round) => {
		if (round.is_enabled === false) return total
		const duration = Math.max(1, Math.trunc(Number(round.duration_minutes) || 0))
		const intermission = Math.max(0, Math.trunc(Number(round.intermission_minutes) || 0))
		return total + duration + intermission
	}, 0)
}

export function computeRoundsBasedEndTime(startIsoLike: string, rounds: RoundDraft[]): string | null {
	if (!startIsoLike || rounds.length === 0) return null
	const startMs = new Date(startIsoLike).getTime()
	if (Number.isNaN(startMs)) return null
	const plannedMinutes = computePlannedRoundMinutes(rounds)
	const endMs = startMs + plannedMinutes * 60_000
	const endDate = new Date(endMs)
	const pad = (n: number) => n.toString().padStart(2, '0')
	return `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`
}

export type RoundValidationError = { roundName: string; message: string }

/**
 * Validate a single round draft against the gameplay invariants enforced by the
 * rounds table: at least one challenge, and required_defenses <= n - 1.
 * Returns an error string or null if valid.
 */
export function validateRoundDraft(round: RoundDraft): string | null {
	const trimmedName = round.name.trim()
	if (!trimmedName) return 'Round name cannot be empty.'

	const n = round.available_challenges.length
	if (n < 1) {
		return `Round "${trimmedName}" must include at least one challenge.`
	}

	const defenses = Number(round.required_defenses)
	if (!Number.isInteger(defenses) || defenses <= 0) {
		return `Round "${trimmedName}": required defenses must be a positive whole number.`
	}

	if (defenses >= n) {
		return `Round "${trimmedName}" requires ${defenses} defenses but only has ${n} challenge(s). Required defenses must be at most ${n - 1} so teams always have something to attack.`
	}

	const duration = Number(round.duration_minutes)
	if (!Number.isInteger(duration) || duration <= 0) {
		return `Round "${trimmedName}": duration must be a positive whole number of minutes.`
	}

	const intermission = Number(round.intermission_minutes)
	if (!Number.isInteger(intermission) || intermission < 0) {
		return `Round "${trimmedName}": intermission must be a non-negative whole number of minutes.`
	}

	return null
}

export function validateAllRounds(rounds: RoundDraft[]): string | null {
	for (const round of rounds) {
		const err = validateRoundDraft(round)
		if (err) return err
	}
	return null
}

export async function replaceGameChallenges(
	supabase: SupabaseClient,
	gameId: string,
	challengeIds: string[]
): Promise<void> {
	const uniqueChallengeIds = Array.from(new Set(challengeIds))

	const { error: deleteError } = await supabase
		.from('game_challenges')
		.delete()
		.eq('game_id', gameId)

	if (deleteError) throw deleteError

	if (uniqueChallengeIds.length === 0) return

	const rows = uniqueChallengeIds.map((challengeId) => ({
		game_id: gameId,
		challenge_id: challengeId
	}))

	const { error: insertError } = await supabase.from('game_challenges').insert(rows)
	if (insertError) throw insertError
}

export async function replaceGameRounds(
	supabase: SupabaseClient,
	gameId: string,
	roundsToSave: RoundDraft[]
): Promise<void> {
	const normalizedRounds = roundsToSave
		.map((round, index) => ({
			round_index: index,
			name: round.name.trim(),
			type: round.type,
			required_defenses: Math.max(1, Math.trunc(round.required_defenses)),
			duration_minutes: Math.max(1, Math.trunc(round.duration_minutes)),
			intermission_minutes: Math.max(0, Math.trunc(round.intermission_minutes)),
			available_challenges: Array.from(new Set(round.available_challenges)),
			is_enabled: round.is_enabled !== false
		}))
		.filter((round) => round.name.length > 0)

	const { error: deleteError } = await supabase.from('rounds').delete().eq('game_id', gameId)
	if (deleteError) throw deleteError

	if (normalizedRounds.length === 0) return

	const { error: insertError } = await supabase.from('rounds').insert(
		normalizedRounds.map((round) => ({
			game_id: gameId,
			round_index: round.round_index,
			name: round.name,
			type: round.type,
			required_defenses: round.required_defenses,
			duration_minutes: round.duration_minutes,
			intermission_minutes: round.intermission_minutes,
			available_challenges: round.available_challenges,
			is_enabled: round.is_enabled
		}))
	)

	if (insertError) throw insertError
}

export async function loadGameRounds(
	supabase: SupabaseClient,
	gameId: string
): Promise<RoundDraft[]> {
	const { data, error } = await supabase
		.from('rounds')
		.select('round_index, name, type, required_defenses, duration_minutes, intermission_minutes, available_challenges, is_enabled')
		.eq('game_id', gameId)
		.order('round_index', { ascending: true })

	if (error) throw error

	return (data ?? []).map((row: any, index: number) => ({
		round_index: index,
		name: row.name ?? `Round ${index + 1}`,
		type: row.type === 'pve' ? 'pve' : 'pvp',
		required_defenses: Math.max(1, Math.trunc(row.required_defenses ?? 1)),
		duration_minutes: Math.max(1, Math.trunc(row.duration_minutes ?? 60)),
		intermission_minutes: Math.max(0, Math.trunc(row.intermission_minutes ?? 0)),
		available_challenges: Array.isArray(row.available_challenges) ? row.available_challenges : [],
		is_enabled: row.is_enabled !== false
	}))
}

export async function loadGameChallenges(
	supabase: SupabaseClient,
	gameId: string
): Promise<string[]> {
	const { data, error } = await supabase
		.from('game_challenges')
		.select('challenge_id')
		.eq('game_id', gameId)

	if (error) throw error
	return (data ?? []).map((row: any) => row.challenge_id)
}
