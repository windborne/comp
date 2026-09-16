import { APIError } from 'better-auth/api';
import { db } from '@db';
import { isEmailAllowedForProvider, isSsoCallbackPath } from './sso-domain';

/**
 * better-auth database hooks that fence single sign-on identities to the
 * domain their provider proved it owns.
 *
 * Why this exists: an organization's identity provider can assert ANY email
 * address in the tokens it issues. better-auth already refuses to link such an
 * assertion to an EXISTING user unless the email is under the provider's
 * verified domain, but it will happily create a NEW user for a foreign address
 * (e.g. Acme's IdP asserting `alice@bank.com`). That stranded account would be
 * reachable by the IdP operator forever, even after the real Alice signs up.
 * These hooks close that gap before any row is written.
 */

export interface SsoProviderDomainRecord {
  providerId: string;
  domain: string;
  domainVerified: boolean;
}

export interface SsoHookDeps {
  findProvider: (providerId: string) => Promise<SsoProviderDomainRecord | null>;
  findUserEmail: (userId: string) => Promise<string | null>;
}

/**
 * Structural subset of better-auth's endpoint context that the hooks read.
 * `path` is the endpoint pattern (e.g. `/sso/callback/:providerId`) and
 * `params` the resolved route parameters.
 */
export interface SsoHookContext {
  path?: string;
  params?: Record<string, string | undefined>;
}

export const SSO_IDENTITY_ERROR_CODES = {
  PROVIDER_UNRESOLVED: 'SSO_PROVIDER_UNRESOLVED',
  DOMAIN_NOT_VERIFIED: 'SSO_DOMAIN_NOT_VERIFIED',
  EMAIL_DOMAIN_NOT_ALLOWED: 'SSO_EMAIL_DOMAIN_NOT_ALLOWED',
} as const;

function forbidden(code: string, message: string): APIError {
  return new APIError('FORBIDDEN', { code, message });
}

/** Throws unless `email` may be signed in through the given SSO provider. */
export async function assertSsoIdentityAllowed({
  email,
  providerId,
  findProvider,
}: {
  email: string;
  providerId: string | undefined;
  findProvider: SsoHookDeps['findProvider'];
}): Promise<void> {
  if (!providerId) {
    throw forbidden(
      SSO_IDENTITY_ERROR_CODES.PROVIDER_UNRESOLVED,
      'Single sign-on callback did not identify its provider',
    );
  }

  const provider = await findProvider(providerId);
  if (!provider) {
    throw forbidden(
      SSO_IDENTITY_ERROR_CODES.PROVIDER_UNRESOLVED,
      `Unknown single sign-on provider "${providerId}"`,
    );
  }

  if (!provider.domainVerified) {
    throw forbidden(
      SSO_IDENTITY_ERROR_CODES.DOMAIN_NOT_VERIFIED,
      'The single sign-on provider domain has not been verified',
    );
  }

  if (!isEmailAllowedForProvider({ email, providerDomain: provider.domain })) {
    throw forbidden(
      SSO_IDENTITY_ERROR_CODES.EMAIL_DOMAIN_NOT_ALLOWED,
      `Single sign-on identities must use an email address under the provider's verified domain (${provider.domain})`,
    );
  }
}

/**
 * `databaseHooks.user.create.before`: only runs for users created by the SSO
 * callback. Rejects foreign email domains and marks the user's email verified —
 * the IdP asserted it for a domain the organization proved it owns, so asking
 * a new employee to verify their work email would be pure friction.
 */
export function createSsoUserCreateHook(
  deps: Pick<SsoHookDeps, 'findProvider'>,
) {
  return async (user: { email: string }, ctx: SsoHookContext | null) => {
    if (!isSsoCallbackPath(ctx?.path)) return;

    await assertSsoIdentityAllowed({
      email: user.email,
      providerId: ctx?.params?.providerId,
      findProvider: deps.findProvider,
    });

    return { data: { emailVerified: true } };
  };
}

/**
 * `databaseHooks.account.create.before`: the same fence for the account row
 * that links an SSO identity to a user. Covers first-time links of existing
 * users (which better-auth already restricts) as defence in depth.
 */
export function createSsoAccountCreateHook(deps: SsoHookDeps) {
  return async (
    account: { providerId: string; userId: string },
    ctx: SsoHookContext | null,
  ) => {
    if (!isSsoCallbackPath(ctx?.path)) return;

    const email = await deps.findUserEmail(account.userId);
    if (!email) {
      throw forbidden(
        SSO_IDENTITY_ERROR_CODES.PROVIDER_UNRESOLVED,
        'Single sign-on account has no user to link to',
      );
    }

    await assertSsoIdentityAllowed({
      email,
      providerId: account.providerId,
      findProvider: deps.findProvider,
    });
  };
}

/** Production wiring: look providers and users up in the database. */
export const prismaSsoHookDeps: SsoHookDeps = {
  findProvider: (providerId) =>
    db.ssoProvider.findUnique({
      where: { providerId },
      select: { providerId: true, domain: true, domainVerified: true },
    }),
  findUserEmail: async (userId) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email ?? null;
  },
};
