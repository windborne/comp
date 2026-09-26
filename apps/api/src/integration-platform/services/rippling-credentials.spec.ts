import { getRipplingBearerToken } from './rippling-credentials';

describe('getRipplingBearerToken', () => {
  it('uses the API key of an API-key connection', () => {
    expect(getRipplingBearerToken({ api_key: ' rk_live_123 ' })).toBe('rk_live_123');
  });

  it('falls back to the access token of a legacy OAuth connection', () => {
    expect(getRipplingBearerToken({ access_token: 'oauth-token', refresh_token: 'r' })).toBe(
      'oauth-token',
    );
  });

  it('prefers the API key when both are present', () => {
    expect(getRipplingBearerToken({ api_key: 'key', access_token: 'old' })).toBe('key');
  });

  it('returns null when neither is usable', () => {
    expect(getRipplingBearerToken(null)).toBeNull();
    expect(getRipplingBearerToken({ api_key: '  ', access_token: ['not', 'a', 'string'] })).toBeNull();
  });
});
