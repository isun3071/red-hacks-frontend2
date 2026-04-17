// Proxy endpoint that fetches the OpenRouter model catalog once every 10
// minutes and hands a trimmed list to the admin UI. The admin page uses
// this to:
//   - populate a <datalist> for autocomplete on model-name fields
//   - validate typed model strings against OpenRouter's catalog
//
// OpenRouter's /api/v1/models endpoint is public, so no API key is
// strictly required for the fetch. The server-side cache keeps us from
// hammering them on every admin page load.
//
// Admin role required to call this endpoint so it can't be abused as an
// open proxy.

import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { json, type RequestHandler } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 10 * 60 * 1000;

type CachedModel = {
	id: string;
	name: string | null;
	context_length: number | null;
	pricing: { prompt?: string; completion?: string } | null;
};

let cache: { expiresAt: number; models: CachedModel[] } | null = null;

function extractBearerToken(authorizationHeader: string | null): string | null {
	const m = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
	return m?.[1] ?? null;
}

async function requireAdmin(accessToken: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY;
	if (!PUBLIC_SUPABASE_URL || !serviceRoleKey) {
		return { ok: false, status: 500, error: 'Server misconfigured' };
	}
	const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, serviceRoleKey, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
	const { data: authData } = await supabaseAdmin.auth.getUser(accessToken);
	const userId = authData.user?.id;
	if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };

	const { data: profile } = await supabaseAdmin
		.from('profiles')
		.select('role')
		.eq('id', userId)
		.maybeSingle();
	if (profile?.role !== 'admin') return { ok: false, status: 403, error: 'Admin role required' };
	return { ok: true };
}

export const GET: RequestHandler = async ({ request }) => {
	const accessToken = extractBearerToken(request.headers.get('authorization'));
	if (!accessToken) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

	const adminCheck = await requireAdmin(accessToken);
	if (!adminCheck.ok) return json({ ok: false, error: adminCheck.error }, { status: adminCheck.status });

	// Serve from cache if fresh
	if (cache && Date.now() < cache.expiresAt) {
		return json({ ok: true, cached: true, models: cache.models, fetched_at: cache.expiresAt - CACHE_TTL_MS });
	}

	try {
		// Public endpoint, but send auth anyway to keep higher rate limits if they apply to our account.
		const openRouterKey = env.OPENROUTER_KEY?.trim();
		const headers: Record<string, string> = { 'Content-Type': 'application/json' };
		if (openRouterKey) headers.Authorization = `Bearer ${openRouterKey}`;

		const response = await fetch('https://openrouter.ai/api/v1/models', { headers });
		if (!response.ok) {
			return json({ ok: false, error: `OpenRouter /models returned ${response.status}` }, { status: 502 });
		}

		const body = await response.json();
		const rawList = Array.isArray(body?.data) ? body.data : [];
		const models: CachedModel[] = rawList
			.map((m: any) => ({
				id: typeof m?.id === 'string' ? m.id : '',
				name: typeof m?.name === 'string' ? m.name : null,
				context_length: Number.isFinite(Number(m?.context_length)) ? Number(m.context_length) : null,
				pricing: m?.pricing
					? {
							prompt: typeof m.pricing.prompt === 'string' ? m.pricing.prompt : undefined,
							completion: typeof m.pricing.completion === 'string' ? m.pricing.completion : undefined
						}
					: null
			}))
			.filter((m: CachedModel) => m.id.length > 0)
			.sort((a: CachedModel, b: CachedModel) => a.id.localeCompare(b.id));

		cache = { expiresAt: Date.now() + CACHE_TTL_MS, models };
		return json({ ok: true, cached: false, models, fetched_at: Date.now() });
	} catch (err: any) {
		return json({ ok: false, error: err?.message ?? 'Failed to fetch model list' }, { status: 500 });
	}
};
