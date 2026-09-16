// The hooks throw better-auth APIErrors so the OIDC callback turns them into a
// redirect with an error code. better-auth's dist is ESM-only, so stub the class
// with the same shape (status, body.code, body.message) for Jest.
jest.mock('better-auth/api', () => ({
  APIError: class APIError extends Error {
    status: string;
    body: { code?: string; message?: string };
    constructor(status: string, body: { code?: string; message?: string }) {
      super(body.message);
      this.status = status;
      this.body = body;
    }
  },
}));
jest.mock('@db', () => ({ db: {} }));

import {
  assertSsoIdentityAllowed,
  createSsoAccountCreateHook,
  createSsoUserCreateHook,
  SSO_IDENTITY_ERROR_CODES,
  type SsoHookDeps,
} from './sso-hooks';

const verifiedAcme = {
  providerId: 'acme',
  domain: 'acme.com',
  domainVerified: true,
};

function makeDeps(overrides: Partial<SsoHookDeps> = {}): SsoHookDeps {
  return {
    findProvider: jest.fn((providerId: string) =>
      Promise.resolve(providerId === 'acme' ? verifiedAcme : null),
    ),
    findUserEmail: jest.fn(() => Promise.resolve('bob@acme.com')),
    ...overrides,
  };
}

const callbackCtx = {
  path: '/sso/callback/:providerId',
  params: { providerId: 'acme' },
};

async function errorCode(
  promise: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return (error as { body?: { code?: string } }).body?.code;
  }
}

describe('assertSsoIdentityAllowed', () => {
  it('passes for an email under the verified provider domain', async () => {
    const deps = makeDeps();
    await expect(
      assertSsoIdentityAllowed({
        email: 'bob@mail.acme.com',
        providerId: 'acme',
        findProvider: deps.findProvider,
      }),
    ).resolves.toBeUndefined();
  });

  it('fails closed when the callback carries no provider id', async () => {
    const deps = makeDeps();
    expect(
      await errorCode(
        assertSsoIdentityAllowed({
          email: 'bob@acme.com',
          providerId: undefined,
          findProvider: deps.findProvider,
        }),
      ),
    ).toBe(SSO_IDENTITY_ERROR_CODES.PROVIDER_UNRESOLVED);
  });

  it('rejects unknown providers', async () => {
    const deps = makeDeps();
    expect(
      await errorCode(
        assertSsoIdentityAllowed({
          email: 'bob@acme.com',
          providerId: 'ghost',
          findProvider: deps.findProvider,
        }),
      ),
    ).toBe(SSO_IDENTITY_ERROR_CODES.PROVIDER_UNRESOLVED);
  });

  it('rejects providers whose domain is not verified yet', async () => {
    const deps = makeDeps({
      findProvider: () =>
        Promise.resolve({ ...verifiedAcme, domainVerified: false }),
    });
    expect(
      await errorCode(
        assertSsoIdentityAllowed({
          email: 'bob@acme.com',
          providerId: 'acme',
          findProvider: deps.findProvider,
        }),
      ),
    ).toBe(SSO_IDENTITY_ERROR_CODES.DOMAIN_NOT_VERIFIED);
  });

  it('rejects a foreign email asserted by the provider (account pre-hijack)', async () => {
    const deps = makeDeps();
    expect(
      await errorCode(
        assertSsoIdentityAllowed({
          email: 'alice@bank.com',
          providerId: 'acme',
          findProvider: deps.findProvider,
        }),
      ),
    ).toBe(SSO_IDENTITY_ERROR_CODES.EMAIL_DOMAIN_NOT_ALLOWED);
  });
});

describe('createSsoUserCreateHook', () => {
  it('ignores users created outside the SSO callback (magic link, Google, …)', async () => {
    const deps = makeDeps();
    const hook = createSsoUserCreateHook(deps);

    await expect(
      hook(
        { email: 'anyone@anywhere.com' },
        { path: '/callback/google', params: {} },
      ),
    ).resolves.toBeUndefined();
    await expect(
      hook({ email: 'anyone@anywhere.com' }, null),
    ).resolves.toBeUndefined();
    expect(deps.findProvider).not.toHaveBeenCalled();
  });

  it('marks SSO-created users as email verified', async () => {
    const hook = createSsoUserCreateHook(makeDeps());

    await expect(hook({ email: 'bob@acme.com' }, callbackCtx)).resolves.toEqual(
      {
        data: { emailVerified: true },
      },
    );
  });

  it('blocks creation of a user with a foreign email', async () => {
    const hook = createSsoUserCreateHook(makeDeps());

    expect(
      await errorCode(hook({ email: 'alice@bank.com' }, callbackCtx)),
    ).toBe(SSO_IDENTITY_ERROR_CODES.EMAIL_DOMAIN_NOT_ALLOWED);
  });
});

describe('createSsoAccountCreateHook', () => {
  it('ignores social provider accounts', async () => {
    const deps = makeDeps();
    const hook = createSsoAccountCreateHook(deps);

    await expect(
      hook(
        { providerId: 'google', userId: 'usr_1' },
        { path: '/callback/google', params: {} },
      ),
    ).resolves.toBeUndefined();
    expect(deps.findUserEmail).not.toHaveBeenCalled();
  });

  it('allows linking an existing user whose email is under the provider domain', async () => {
    const hook = createSsoAccountCreateHook(makeDeps());

    await expect(
      hook({ providerId: 'acme', userId: 'usr_1' }, callbackCtx),
    ).resolves.toBeUndefined();
  });

  it('blocks linking when the user email is outside the provider domain', async () => {
    const hook = createSsoAccountCreateHook(
      makeDeps({ findUserEmail: () => Promise.resolve('alice@bank.com') }),
    );

    expect(
      await errorCode(
        hook({ providerId: 'acme', userId: 'usr_1' }, callbackCtx),
      ),
    ).toBe(SSO_IDENTITY_ERROR_CODES.EMAIL_DOMAIN_NOT_ALLOWED);
  });

  it('fails closed when the user cannot be resolved', async () => {
    const hook = createSsoAccountCreateHook(
      makeDeps({ findUserEmail: () => Promise.resolve(null) }),
    );

    expect(
      await errorCode(
        hook({ providerId: 'acme', userId: 'usr_x' }, callbackCtx),
      ),
    ).toBe(SSO_IDENTITY_ERROR_CODES.PROVIDER_UNRESOLVED);
  });
});
