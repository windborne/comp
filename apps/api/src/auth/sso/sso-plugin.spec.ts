// @better-auth/sso is ESM-only; the plugin factory itself is exercised through
// the auth server, not here. These tests cover the membership provisioning
// that runs on every SSO login.
jest.mock('@better-auth/sso', () => ({ sso: jest.fn(() => ({ id: 'sso' })) }));
jest.mock('@db', () => ({ db: {} }));

import {
  provisionSsoMembership,
  SSO_DEFAULT_MEMBER_ROLE,
  type SsoMembershipRepository,
} from './sso-plugin';

function makeRepository(
  existing: { id: string } | null = null,
): SsoMembershipRepository {
  return {
    findMembership: jest.fn(() => Promise.resolve(existing)),
    createMembership: jest.fn(() => Promise.resolve()),
  };
}

const user = { id: 'usr_1', email: 'bob@acme.com' };
const provider = {
  organizationId: 'org_1',
  domain: 'acme.com',
  domainVerified: true,
};

describe('provisionSsoMembership', () => {
  it('adds a first-time SSO user to the provider organization as an employee', async () => {
    const repository = makeRepository();

    await expect(
      provisionSsoMembership({ user, provider, repository }),
    ).resolves.toBe('created');
    expect(repository.createMembership).toHaveBeenCalledWith({
      organizationId: 'org_1',
      userId: 'usr_1',
      role: SSO_DEFAULT_MEMBER_ROLE,
    });
    expect(SSO_DEFAULT_MEMBER_ROLE).toBe('employee');
  });

  it('is idempotent: an existing membership (active or deactivated) is left alone', async () => {
    const repository = makeRepository({ id: 'mem_1' });

    await expect(
      provisionSsoMembership({ user, provider, repository }),
    ).resolves.toBe('existing');
    expect(repository.createMembership).not.toHaveBeenCalled();
  });

  it('skips providers that are not attached to an organization', async () => {
    const repository = makeRepository();

    await expect(
      provisionSsoMembership({
        user,
        provider: { ...provider, organizationId: null },
        repository,
      }),
    ).resolves.toBe('skipped');
    expect(repository.findMembership).not.toHaveBeenCalled();
  });

  it('never grants membership through an unverified domain', async () => {
    const repository = makeRepository();

    await expect(
      provisionSsoMembership({
        user,
        provider: { ...provider, domainVerified: false },
        repository,
      }),
    ).resolves.toBe('skipped');
    expect(repository.createMembership).not.toHaveBeenCalled();
  });

  it('never grants membership to an email outside the provider domain', async () => {
    const repository = makeRepository();

    await expect(
      provisionSsoMembership({
        user: { ...user, email: 'alice@bank.com' },
        provider,
        repository,
      }),
    ).resolves.toBe('skipped');
    expect(repository.createMembership).not.toHaveBeenCalled();
  });
});
