import { createHmac, timingSafeEqual } from 'node:crypto';

/** The header Subtraq signs every webhook call with: `t=<seconds>,v1=<hex>`. */
export const SIGNATURE_HEADER = 'x-subtraq-signature';

/** Beyond five minutes, a call is refused: a captured call cannot be replayed later. */
export const TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * Checks a Subtraq webhook call, exactly as Subtraq documents it: the signature
 * is an HMAC-SHA256, keyed with the subscription secret, of
 * `"<timestamp>.<raw body>"`.
 *
 * The raw body is required: a body parsed and serialized again may differ by a
 * single character and fail the check.
 */
export function verifySignature(
	secret: string,
	header: string | undefined,
	rawBody: string,
	nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
	if (!secret || !header) return false;

	const parts = new Map<string, string>();
	for (const piece of header.split(',')) {
		const i = piece.indexOf('=');
		if (i > 0) parts.set(piece.slice(0, i).trim(), piece.slice(i + 1).trim());
	}
	const timestamp = Number(parts.get('t'));
	const received = parts.get('v1');
	if (!Number.isFinite(timestamp) || !received) return false;
	if (Math.abs(nowSeconds - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) return false;

	const expected = createHmac('sha256', secret)
		.update(`${timestamp}.${rawBody}`, 'utf8')
		.digest('hex');
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(received, 'utf8');
	return a.length === b.length && timingSafeEqual(a, b);
}
