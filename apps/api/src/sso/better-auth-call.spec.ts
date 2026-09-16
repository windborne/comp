import { ForbiddenException, HttpException } from '@nestjs/common';
import {
  callBetterAuth,
  mapBetterAuthError,
  toBetterAuthHeaders,
} from './better-auth-call';

describe('toBetterAuthHeaders', () => {
  it('forwards only the session credentials', () => {
    const headers = toBetterAuthHeaders({
      cookie: 'better-auth.session_token=abc',
      authorization: 'Bearer tok',
      'x-api-key': 'should-not-leak',
      host: 'api.trycomp.ai',
    });

    expect(headers.get('cookie')).toBe('better-auth.session_token=abc');
    expect(headers.get('authorization')).toBe('Bearer tok');
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('host')).toBeNull();
  });

  it('copes with requests that carry no credentials', () => {
    const headers = toBetterAuthHeaders({});
    expect([...headers.keys()]).toEqual([]);
  });
});

describe('mapBetterAuthError', () => {
  it('keeps the better-auth status, message and code', () => {
    const mapped = mapBetterAuthError({
      statusCode: 422,
      message: 'SSO provider with this providerId already exists',
      body: {
        message: 'SSO provider with this providerId already exists',
        code: 'EXISTS',
      },
    });

    expect(mapped.getStatus()).toBe(422);
    expect(mapped.getResponse()).toEqual({
      statusCode: 422,
      message: 'SSO provider with this providerId already exists',
      code: 'EXISTS',
    });
  });

  it('falls back to 500 for out-of-range statuses and unknown errors', () => {
    expect(
      mapBetterAuthError({ statusCode: 42, message: 'weird' }).getStatus(),
    ).toBe(500);
    expect(mapBetterAuthError(new Error('boom')).getStatus()).toBe(500);
    // Internal details are not leaked for unknown failures.
    expect(mapBetterAuthError(new Error('boom')).getResponse()).toEqual({
      statusCode: 500,
      message: 'Single sign-on request failed',
    });
  });

  it('passes Nest exceptions through untouched', () => {
    const original = new ForbiddenException('nope');
    expect(mapBetterAuthError(original)).toBe(original);
  });
});

describe('callBetterAuth', () => {
  it('returns the result on success and maps thrown errors', async () => {
    await expect(callBetterAuth(() => Promise.resolve('ok'))).resolves.toBe(
      'ok',
    );

    const failing = callBetterAuth(() =>
      Promise.reject(
        Object.assign(new Error('Provider not found'), {
          statusCode: 404,
          body: { message: 'Provider not found' },
        }),
      ),
    );
    await expect(failing).rejects.toBeInstanceOf(HttpException);
    await expect(failing).rejects.toMatchObject({ status: 404 });
  });
});
