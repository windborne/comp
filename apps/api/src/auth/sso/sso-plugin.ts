import { sso } from '@better-auth/sso';
import { db } from '@db';
import {
  SSO_DOMAIN_VERIFICATION_TOKEN_PREFIX,
  isEmailAllowedForProvider,
} from './sso-domain';

/**
 * Role granted to users the SSO flow adds to the provider's organization.
 * `employee` is portal-only: it lets staff sign policies and complete training
 * without handing out compliance-app access. Admins promote people from the
 * People page as usual.
 */
export const SSO_DEFAULT_MEMBER_ROLE = 'employee';

export interface SsoMembershipRepository {
  findMembership: (params: {
    organizationId: string;
    userId: string;
  }) => Promise<{ id: string } | null>;
  createMembership: (params: {
    organizationId: string;
    userId: string;
    role: string;
  }) => Promise<void>;
}

export interface ProvisionSsoMembershipInput {
  user: { id: string; email: string };
  provider: {
    organizationId?: string | null | undefined;
    domain: string;
    domainVerified?: boolean | undefined;
  };
  repository: SsoMembershipRepository;
}

export type ProvisionSsoMembershipResult = 'created' | 'existing' | 'skipped';

/**
 * Idempotently adds an SSO user to their provider's organization. Runs on
 * every SSO login, so an existing membership (including a deactivated one —
 * offboarded people must not be silently re-activated) is left untouched.
 */
export async function provisionSsoMembership({
  user,
  provider,
  repository,
}: ProvisionSsoMembershipInput): Promise<ProvisionSsoMembershipResult> {
  const organizationId = provider.organizationId;
  if (!organizationId) return 'skipped';

  // Defence in depth: the plugin refuses sign-in for unverified domains and the
  // database hooks fence foreign emails, but membership is the valuable part.
  if (provider.domainVerified !== true) return 'skipped';
  if (
    !isEmailAllowedForProvider({
      email: user.email,
      providerDomain: provider.domain,
    })
  ) {
    return 'skipped';
  }

  const existing = await repository.findMembership({
    organizationId,
    userId: user.id,
  });
  if (existing) return 'existing';

  await repository.createMembership({
    organizationId,
    userId: user.id,
    role: SSO_DEFAULT_MEMBER_ROLE,
  });
  return 'created';
}

export const prismaSsoMembershipRepository: SsoMembershipRepository = {
  findMembership: ({ organizationId, userId }) =>
    db.member.findFirst({
      where: { organizationId, userId },
      select: { id: true },
    }),
  createMembership: async ({ organizationId, userId, role }) => {
    await db.member.create({ data: { organizationId, userId, role } });
  },
};

/**
 * OIDC single sign-on for the app and the employee portal.
 *
 * Providers are registered per organization through the NestJS SSO API
 * (apps/api/src/sso), which layers Comp AI RBAC and audit logging on top of the
 * plugin's own endpoints. Sign-in is by email: the plugin resolves the provider
 * from the email domain, so the same flow serves every frontend.
 */
export function createSsoPlugin() {
  return sso({
    // An org must prove it owns a domain (DNS TXT record) before anyone can
    // sign in through its provider. Without this, registering `victim.com`
    // would let an attacker's IdP mint sessions for victim.com addresses.
    domainVerification: {
      enabled: true,
      tokenPrefix: SSO_DOMAIN_VERIFICATION_TOKEN_PREFIX,
    },
    // Membership is provisioned by `provisionUser` below. The plugin's own
    // provisioning is off: its roles ("member"/"admin") don't exist in Comp AI,
    // and it would also auto-join Google/Microsoft sign-ins whose email happens
    // to match a verified domain — SSO membership should come from SSO logins.
    organizationProvisioning: { disabled: true },
    provisionUserOnEveryLogin: true,
    provisionUser: async ({ user, provider }) => {
      await provisionSsoMembership({
        user: { id: user.id, email: user.email },
        provider,
        repository: prismaSsoMembershipRepository,
      });
    },
  });
}
