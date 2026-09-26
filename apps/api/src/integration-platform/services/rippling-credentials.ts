/**
 * The bearer token for Rippling's REST API. Connections made with a
 * customer-created API key store it as `api_key`; older OAuth connections store
 * `access_token`. Both are sent the same way (`Authorization: Bearer <token>`).
 */
export function getRipplingBearerToken(
  credentials: Record<string, unknown> | null | undefined,
): string | null {
  for (const field of ['api_key', 'access_token'] as const) {
    const value = credentials?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
