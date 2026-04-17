// Validate an OpenRouter model string by firing a minimal test chat
// completion (max_tokens=1). Returns {ok:true} on 200, {ok:false, error}
// on any non-2xx or network failure so the admin can fix the string
// before the challenge is saved and players start hitting real LLM
// failures mid-game.
//
// Special-cases:
// - llama-interp-server / llama-interp* → skipped (internal, not on OpenRouter)
// - empty string → error
//
// Called from the admin challenges form on save for both `model_name` and
// (for judge challenges) `judge_model`.

import { env } from '$env/dynamic/private';
import { json, type RequestHandler } from '@sveltejs/kit';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

function extractBearerToken(authorizationHeader: string | null): string | null {
	const m = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
	return m?.[1] ?? null;
}

function isInternalModel(model: string): boolean {
	const lower = model.toLowerCase();
	return lower === 'llama-interp-server' || lower.includes('llama-interp');
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Admin-only: verify caller has admin role.
		const accessToken = extractBearerToken(request.headers.get('authorization'));
		if (!accessToken) {
			return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
		}

		const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY;
		if (!PUBLIC_SUPABASE_URL || !serviceRoleKey) {
			return json({ ok: false, error: 'Server misconfigured' }, { status: 500 });
		}

		const supabaseAdmin = createClient(PUBLIC_SUPABASE_URL, serviceRoleKey, {
			auth: { persistSession: false, autoRefreshToken: false }
		});

		const { data: authData } = await supabaseAdmin.auth.getUser(accessToken);
		const userId = authData.user?.id;
		if (!userId) {
			return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
		}

		const { data: profile } = await supabaseAdmin
			.from('profiles')
			.select('role')
			.eq('id', userId)
			.maybeSingle();
		if (profile?.role !== 'admin') {
			return json({ ok: false, error: 'Admin role required' }, { status: 403 });
		}

		// Parse body
		const body = (await request.json()) as { model?: string };
		const model = typeof body.model === 'string' ? body.model.trim() : '';

		if (!model) {
			return json({ ok: false, error: 'Model name is empty.' }, { status: 400 });
		}

		if (isInternalModel(model)) {
			return json({
				ok: true,
				skipped: true,
				message: 'Internal model (llama-interp-server) — skipped OpenRouter validation.'
			});
		}

		const openRouterKey = env.OPENROUTER_KEY?.trim();
		if (!openRouterKey) {
			return json({
				ok: false,
				error: 'OPENROUTER_KEY missing on the server; cannot validate model.'
			}, { status: 500 });
		}

		// Fire a minimal completion. max_tokens=1 keeps it cheap.
		const testResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${openRouterKey}`
			},
			body: JSON.stringify({
				model,
				max_tokens: 1,
				messages: [{ role: 'user', content: 'hi' }]
			})
		});

		if (testResponse.ok) {
			return json({ ok: true, model });
		}

		// Try to extract a useful error message from the OpenRouter response.
		let errorText = '';
		try {
			const errBody = await testResponse.json();
			errorText = errBody?.error?.message || errBody?.message || JSON.stringify(errBody);
		} catch {
			errorText = await testResponse.text();
		}

		return json({
			ok: false,
			error: `OpenRouter returned ${testResponse.status}: ${(errorText || 'unknown error').slice(0, 300)}`,
			status: testResponse.status
		}, { status: 200 }); // return 200 so the client can read the JSON
	} catch (err: any) {
		return json({
			ok: false,
			error: err?.message || 'Validation request failed.'
		}, { status: 500 });
	}
};
