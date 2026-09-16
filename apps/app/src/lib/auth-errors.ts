/**
 * Human-readable copy for the errors better-auth reports back to the sign-in
 * page. OAuth/SSO failures arrive as `?error=<code>` on the errorCallbackURL;
 * the `sign-in/sso` request itself fails with an HTTP status.
 *
 * Only known codes are mapped — the query string is attacker-controlled, so
 * unknown values fall back to a generic message instead of being echoed.
 */

const GENERIC_SIGN_IN_ERROR = 'Sign-in failed. Please try again.';

function normalizeErrorCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const KNOWN_AUTH_ERRORS: Array<{ matches: (code: string) => boolean; message: string }> = [
  {
    matches: (code) => code === 'account_not_linked' || code === 'unable_to_link_account',
    message:
      'This email already has a Comp AI account that cannot be linked to single sign-on automatically. Sign in the way you did before, or contact your administrator.',
  },
  {
    matches: (code) => code === 'signup_disabled',
    message: 'Your organization does not allow new accounts through single sign-on.',
  },
  {
    matches: (code) => code.includes('verified_domain') || code === 'sso_email_domain_not_allowed',
    message:
      "Your identity provider returned an email address outside your organization's verified domain. Contact your administrator.",
  },
  {
    matches: (code) =>
      code.includes('domain_has_not_been_verified') || code === 'sso_domain_not_verified',
    message:
      'Single sign-on for your email domain has not been verified yet. Ask your administrator to finish the setup.',
  },
  {
    matches: (code) => code === 'invalid_provider' || code === 'unable_to_create_user',
    message:
      'Your identity provider returned an error. Ask your administrator to check the single sign-on configuration.',
  },
  {
    matches: (code) => code === 'discovery_failed',
    message:
      "Comp AI could not reach your identity provider's configuration. Try again later or contact your administrator.",
  },
  {
    matches: (code) => code === 'invalid_state' || code === 'state_mismatch',
    message: 'Your sign-in session expired. Please try again.',
  },
  {
    matches: (code) =>
      code === 'access_denied' || code === 'login_required' || code === 'interaction_required',
    message: 'Sign-in was cancelled at your identity provider.',
  },
];

/** Message for an `?error=` code on the sign-in page, or null when there is none. */
export function getAuthErrorMessage(error: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(error) ? error[0] : error;
  if (!raw || !raw.trim()) return null;

  const code = normalizeErrorCode(raw);
  const known = KNOWN_AUTH_ERRORS.find((entry) => entry.matches(code));
  return known?.message ?? GENERIC_SIGN_IN_ERROR;
}

/** Message for a failed `signIn.sso` request (before any redirect happened). */
export function getSsoSignInErrorMessage(
  error: { status?: number; message?: string | null } | null | undefined,
): string {
  if (error?.status === 404) {
    return 'No single sign-on provider is set up for this email domain. Ask your administrator, or sign in another way.';
  }
  if (error?.status === 401) {
    return 'Single sign-on for this email domain has not been verified yet. Ask your administrator to finish the setup.';
  }
  if (error?.status === 400 && error.message) {
    return error.message;
  }
  return 'Could not start single sign-on. Please try again.';
}
