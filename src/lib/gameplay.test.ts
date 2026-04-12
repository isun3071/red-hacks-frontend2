import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	calculateRoundTimeline,
	getRoundRuntimeContext,
	isGameActive,
	isGameJoinable,
	resolveRoundType,
	type GameRound,
	type GameWindow
} from './gameplay'

// ---------- fixtures ----------

function makeRound(overrides: Partial<GameRound> = {}): GameRound {
	return {
		game_id: 'game-1',
		round_index: 0,
		name: 'Round',
		type: 'pvp',
		required_defenses: 1,
		available_challenges: [],
		duration_minutes: 10,
		intermission_minutes: 2,
		...overrides
	}
}

function makeGameWindow(overrides: Partial<GameWindow> = {}): GameWindow {
	return {
		is_active: true,
		start_time: '2026-01-01T00:00:00.000Z',
		end_time: '2026-01-01T12:00:00.000Z',
		...overrides
	}
}

const GAME_START_ISO = '2026-01-01T00:00:00.000Z'
const GAME_START_MS = Date.parse(GAME_START_ISO)
const GAME_END_ISO = '2026-01-01T12:00:00.000Z'
const GAME_END_MS = Date.parse(GAME_END_ISO)
const MIN = 60_000

// ---------- isGameActive ----------

describe('isGameActive', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('returns false when is_active is false even inside the window', () => {
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameActive({
				is_active: false,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(false)
	})

	it('returns true when active and now is inside the window', () => {
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameActive({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(true)
	})

	it('returns false when now is before start_time', () => {
		vi.setSystemTime(new Date('2025-12-31T23:59:59.000Z'))
		expect(
			isGameActive({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(false)
	})

	it('returns false when now is after end_time', () => {
		vi.setSystemTime(new Date('2026-01-01T12:00:01.000Z'))
		expect(
			isGameActive({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(false)
	})

	it('returns false when start_time is not a valid ISO string', () => {
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameActive({
				is_active: true,
				start_time: 'not-a-date',
				end_time: GAME_END_ISO
			})
		).toBe(false)
	})

	it('returns false when end_time is not a valid ISO string', () => {
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameActive({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: 'not-a-date'
			})
		).toBe(false)
	})
})

// ---------- isGameJoinable ----------

describe('isGameJoinable', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('returns false when is_active is false', () => {
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameJoinable({
				is_active: false,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(false)
	})

	it('returns true when active and now is inside the window', () => {
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameJoinable({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(true)
	})

	it('returns true when now is BEFORE start_time (pre-game joining allowed)', () => {
		// This is the key difference from isGameActive: pre-game is joinable.
		vi.setSystemTime(new Date('2025-12-31T12:00:00.000Z'))
		expect(
			isGameJoinable({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(true)
	})

	it('returns false after end_time (no late joins on finished games)', () => {
		vi.setSystemTime(new Date('2026-01-01T12:00:01.000Z'))
		expect(
			isGameJoinable({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: GAME_END_ISO
			})
		).toBe(false)
	})

	it('returns false when end_time is not a valid ISO string', () => {
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameJoinable({
				is_active: true,
				start_time: GAME_START_ISO,
				end_time: 'not-a-date'
			})
		).toBe(false)
	})

	it('ignores start_time being invalid — only end_time matters for joinability', () => {
		// Defensive: if only end_time is good, we can still determine whether
		// the game is finished. start_time parse failures shouldn't block joins.
		vi.setSystemTime(new Date('2026-01-01T06:00:00.000Z'))
		expect(
			isGameJoinable({
				is_active: true,
				start_time: 'not-a-date',
				end_time: GAME_END_ISO
			})
		).toBe(true)
	})
})

// ---------- calculateRoundTimeline ----------

describe('calculateRoundTimeline', () => {
	it('returns [] for empty rounds', () => {
		expect(calculateRoundTimeline(GAME_START_ISO, [])).toEqual([])
	})

	it('returns [] for an invalid gameStartIso', () => {
		expect(calculateRoundTimeline('not-a-date', [makeRound()])).toEqual([])
	})

	it('computes startMs, endMs, and intermissionEndMs for a single round', () => {
		const round = makeRound({ duration_minutes: 10, intermission_minutes: 2 })
		const [entry] = calculateRoundTimeline(GAME_START_ISO, [round])

		expect(entry.startMs).toBe(GAME_START_MS)
		expect(entry.endMs).toBe(GAME_START_MS + 10 * MIN)
		expect(entry.intermissionEndMs).toBe(GAME_START_MS + 12 * MIN)
		expect(entry.round).toBe(round)
	})

	it('sorts rounds by round_index and chains them cursor-style', () => {
		const rounds = [
			makeRound({ round_index: 2, name: 'three', duration_minutes: 3, intermission_minutes: 0 }),
			makeRound({ round_index: 0, name: 'one', duration_minutes: 5, intermission_minutes: 1 }),
			makeRound({ round_index: 1, name: 'two', duration_minutes: 4, intermission_minutes: 2 })
		]
		const timeline = calculateRoundTimeline(GAME_START_ISO, rounds)

		expect(timeline.map((entry) => entry.round.name)).toEqual(['one', 'two', 'three'])

		// round 0: start → +5 min round, then +1 min intermission
		expect(timeline[0].startMs).toBe(GAME_START_MS)
		expect(timeline[0].endMs).toBe(GAME_START_MS + 5 * MIN)
		expect(timeline[0].intermissionEndMs).toBe(GAME_START_MS + 6 * MIN)

		// round 1 starts where round 0's intermission ended
		expect(timeline[1].startMs).toBe(timeline[0].intermissionEndMs)
		expect(timeline[1].endMs).toBe(timeline[1].startMs + 4 * MIN)
		expect(timeline[1].intermissionEndMs).toBe(timeline[1].endMs + 2 * MIN)

		// round 2 starts where round 1's intermission ended
		expect(timeline[2].startMs).toBe(timeline[1].intermissionEndMs)
		expect(timeline[2].endMs).toBe(timeline[2].startMs + 3 * MIN)
		expect(timeline[2].intermissionEndMs).toBe(timeline[2].endMs) // zero intermission
	})

	it('defaults null duration_minutes to the minimum of 1', () => {
		const [entry] = calculateRoundTimeline(GAME_START_ISO, [
			makeRound({ duration_minutes: null, intermission_minutes: 0 })
		])
		expect(entry.endMs - entry.startMs).toBe(1 * MIN)
	})

	it('defaults null intermission_minutes to 0', () => {
		const [entry] = calculateRoundTimeline(GAME_START_ISO, [
			makeRound({ duration_minutes: 5, intermission_minutes: null })
		])
		expect(entry.intermissionEndMs).toBe(entry.endMs)
	})

	it('clamps negative durations up to the minimum of 1 minute', () => {
		const [entry] = calculateRoundTimeline(GAME_START_ISO, [
			makeRound({ duration_minutes: -5, intermission_minutes: 0 })
		])
		expect(entry.endMs - entry.startMs).toBe(1 * MIN)
	})

	it('truncates fractional minutes', () => {
		const [entry] = calculateRoundTimeline(GAME_START_ISO, [
			makeRound({ duration_minutes: 2.9, intermission_minutes: 0 })
		])
		expect(entry.endMs - entry.startMs).toBe(2 * MIN)
	})

	it('omits rounds flagged is_enabled: false from the timeline', () => {
		const rounds = [
			makeRound({ round_index: 0, name: 'one', duration_minutes: 5, intermission_minutes: 0, is_enabled: true }),
			makeRound({ round_index: 1, name: 'two', duration_minutes: 5, intermission_minutes: 0, is_enabled: false }),
			makeRound({ round_index: 2, name: 'three', duration_minutes: 5, intermission_minutes: 0, is_enabled: true })
		]
		const timeline = calculateRoundTimeline(GAME_START_ISO, rounds)
		expect(timeline.map((entry) => entry.round.name)).toEqual(['one', 'three'])
	})

	it('disabled rounds do not advance the cursor — enabled rounds are chained adjacently', () => {
		const rounds = [
			makeRound({ round_index: 0, name: 'one', duration_minutes: 10, intermission_minutes: 0, is_enabled: true }),
			makeRound({ round_index: 1, name: 'two', duration_minutes: 99, intermission_minutes: 99, is_enabled: false }),
			makeRound({ round_index: 2, name: 'three', duration_minutes: 10, intermission_minutes: 0, is_enabled: true })
		]
		const timeline = calculateRoundTimeline(GAME_START_ISO, rounds)
		expect(timeline).toHaveLength(2)
		// round three starts where round one ended, NOT after round two's
		// 99-minute window (which is disabled and must not count).
		expect(timeline[1].startMs).toBe(timeline[0].endMs)
	})

	it('only excludes is_enabled: false — true, undefined, and null all count as enabled', () => {
		// Filter is `is_enabled !== false`, so:
		//   true      → included (explicit opt-in)
		//   undefined → included (legacy row without the column)
		//   null      → included (defensive against DB null vs. missing)
		//   false     → excluded (the only way to disable)
		const rounds = [
			makeRound({ round_index: 0, name: 'explicit-true', is_enabled: true }),
			makeRound({ round_index: 1, name: 'legacy-undef', is_enabled: undefined }),
			makeRound({ round_index: 2, name: 'null-kept', is_enabled: null }),
			makeRound({ round_index: 3, name: 'false-dropped', is_enabled: false })
		]
		const timeline = calculateRoundTimeline(GAME_START_ISO, rounds)
		expect(timeline.map((entry) => entry.round.name)).toEqual(['explicit-true', 'legacy-undef', 'null-kept'])
	})
})

// ---------- getRoundRuntimeContext ----------

describe('getRoundRuntimeContext', () => {
	it('returns no-rounds phase when start_time is invalid', () => {
		const ctx = getRoundRuntimeContext(
			makeGameWindow({ start_time: 'not-a-date' }),
			[],
			GAME_START_MS + 60 * MIN
		)
		expect(ctx.phase).toBe('no-rounds')
		expect(ctx.gameActive).toBe(false)
		expect(ctx.currentRound).toBeNull()
		expect(ctx.nextRound).toBeNull()
		expect(ctx.timeline).toEqual([])
		expect(ctx.timeRemainingSeconds).toBeNull()
	})

	describe('empty rounds', () => {
		it('is pre-game before startMs, with countdown to game start', () => {
			const ctx = getRoundRuntimeContext(makeGameWindow(), [], GAME_START_MS - 30_000)
			expect(ctx.phase).toBe('pre-game')
			expect(ctx.gameActive).toBe(false)
			expect(ctx.timeRemainingSeconds).toBe(30)
		})

		it('is post-game when is_active is false', () => {
			const ctx = getRoundRuntimeContext(
				makeGameWindow({ is_active: false }),
				[],
				GAME_START_MS + 60 * MIN
			)
			expect(ctx.phase).toBe('post-game')
			expect(ctx.gameActive).toBe(false)
		})

		it('is post-game when now is past end_time', () => {
			const ctx = getRoundRuntimeContext(makeGameWindow(), [], GAME_END_MS + 60_000)
			expect(ctx.phase).toBe('post-game')
		})

		it('is no-rounds with gameActive true when inside the window', () => {
			const ctx = getRoundRuntimeContext(makeGameWindow(), [], GAME_START_MS + 60 * MIN)
			expect(ctx.phase).toBe('no-rounds')
			expect(ctx.gameActive).toBe(true)
		})
	})

	describe('non-empty rounds', () => {
		const rounds = [
			makeRound({ round_index: 0, name: 'one', duration_minutes: 10, intermission_minutes: 2 }),
			makeRound({ round_index: 1, name: 'two', duration_minutes: 10, intermission_minutes: 2 })
		]

		it('is post-game when is_active is false', () => {
			const ctx = getRoundRuntimeContext(
				makeGameWindow({ is_active: false }),
				rounds,
				GAME_START_MS + 5 * MIN
			)
			expect(ctx.phase).toBe('post-game')
		})

		it('is post-game when now is past end_time', () => {
			const ctx = getRoundRuntimeContext(makeGameWindow(), rounds, GAME_END_MS + 60_000)
			expect(ctx.phase).toBe('post-game')
		})

		it('is pre-game with next round set to the first round', () => {
			const ctx = getRoundRuntimeContext(makeGameWindow(), rounds, GAME_START_MS - 10_000)
			expect(ctx.phase).toBe('pre-game')
			expect(ctx.nextRound?.name).toBe('one')
			expect(ctx.timeRemainingSeconds).toBe(10)
		})

		it('is round-active when now is inside round 0 duration', () => {
			const ctx = getRoundRuntimeContext(makeGameWindow(), rounds, GAME_START_MS + 3 * MIN)
			expect(ctx.phase).toBe('round-active')
			expect(ctx.currentRound?.name).toBe('one')
			expect(ctx.nextRound?.name).toBe('two')
			// round 0 ends at +10 min; we are at +3 min → 7 min = 420 sec remaining
			expect(ctx.timeRemainingSeconds).toBe(7 * 60)
		})

		it('is intermission between round 0 end and intermission end, still reporting round 0 as current', () => {
			// round 0 ends at +10 min, intermission ends at +12 min. Sample at +11 min.
			const ctx = getRoundRuntimeContext(makeGameWindow(), rounds, GAME_START_MS + 11 * MIN)
			expect(ctx.phase).toBe('intermission')
			expect(ctx.currentRound?.name).toBe('one')
			expect(ctx.nextRound?.name).toBe('two')
			expect(ctx.timeRemainingSeconds).toBe(60)
		})

		it('has nextRound: null when the final round is active', () => {
			// round 1 is the last round: starts at +12 min, ends at +22 min. Sample at +15 min.
			const ctx = getRoundRuntimeContext(makeGameWindow(), rounds, GAME_START_MS + 15 * MIN)
			expect(ctx.phase).toBe('round-active')
			expect(ctx.currentRound?.name).toBe('two')
			expect(ctx.nextRound).toBeNull()
		})

		it('falls through to post-game when now is after all rounds but still before game end', () => {
			// rounds total 24 minutes of activity; sample at +30 min, game end is +12 hr.
			const ctx = getRoundRuntimeContext(makeGameWindow(), rounds, GAME_START_MS + 30 * MIN)
			expect(ctx.phase).toBe('post-game')
			expect(ctx.currentRound).toBeNull()
			expect(ctx.nextRound).toBeNull()
		})

		it('disabled middle round is skipped: phase computed as if it did not exist', () => {
			// Enabled round 0 (0–10 min), disabled round 1 (would be 12–22 min),
			// enabled round 2 (now slotted at 12–22 min because 1 was skipped).
			const mixedRounds = [
				makeRound({ round_index: 0, name: 'one', duration_minutes: 10, intermission_minutes: 2, is_enabled: true }),
				makeRound({ round_index: 1, name: 'two', duration_minutes: 10, intermission_minutes: 2, is_enabled: false }),
				makeRound({ round_index: 2, name: 'three', duration_minutes: 10, intermission_minutes: 2, is_enabled: true })
			]
			// Sample at +15 min — in the real schedule this would be round 1's
			// territory, but round 1 is disabled and round 2 (named "three")
			// has been promoted into that slot.
			const ctx = getRoundRuntimeContext(makeGameWindow(), mixedRounds, GAME_START_MS + 15 * MIN)
			expect(ctx.phase).toBe('round-active')
			expect(ctx.currentRound?.name).toBe('three')
			expect(ctx.nextRound).toBeNull()
		})
	})
})

// ---------- resolveRoundType ----------

describe('resolveRoundType', () => {
	it('returns the default fallback "pvp" when roundInfo is null', () => {
		expect(resolveRoundType(null)).toBe('pvp')
	})

	it('returns the given fallback when roundInfo is null', () => {
		expect(resolveRoundType(null, 'pve')).toBe('pve')
	})

	it('returns "pvp" when the round type is "pvp"', () => {
		expect(resolveRoundType(makeRound({ type: 'pvp' }))).toBe('pvp')
	})

	it('returns "pve" when the round type is "pve"', () => {
		expect(resolveRoundType(makeRound({ type: 'pve' }))).toBe('pve')
	})

	it('returns fallback when the round type is not pvp or pve', () => {
		const bad = { ...makeRound(), type: 'weird' as unknown as 'pvp' }
		expect(resolveRoundType(bad, 'pve')).toBe('pve')
	})
})
