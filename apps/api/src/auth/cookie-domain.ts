/**
 * Resolve the domain better-auth should scope its session cookie to.
 *
 * Returning a domain enables `crossSubDomainCookies`, so the session set by
 * the API is sent to every host under that domain — which is what lets the
 * app and the employee portal live on sibling hostnames and still share a
 * login. Returning `undefined` leaves the cookie host-only (and switches on
 * the `local` cookie prefix), which is correct for localhost and for a
 * single-host deployment.
 *
 * Note that enabling a cookie domain also sets `secure: true` on the cookie
 * (see auth.server.ts), so `AUTH_COOKIE_DOMAIN` only works behind HTTPS.
 * Browsers silently refuse to store a Secure cookie delivered over plain HTTP,
 * which presents as "login succeeds but you are immediately logged out".
 *
 * Resolution order:
 *  1. `AUTH_COOKIE_DOMAIN` — explicit, for self-hosted deployments. A leading
 *     dot is added if missing, matching the hardcoded values below.
 *  2. The hosted trycomp.ai environments, inferred from BASE_URL.
 *  3. `undefined` — host-only cookie.
 */
export function resolveCookieDomain(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string | undefined {
  const explicit = env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit) {
    return explicit.startsWith('.') ? explicit : `.${explicit}`;
  }

  const baseUrl = env.BASE_URL || '';
  if (baseUrl.includes('staging.trycomp.ai')) {
    return '.staging.trycomp.ai';
  }
  if (baseUrl.includes('trycomp.ai')) {
    return '.trycomp.ai';
  }
  return undefined;
}
