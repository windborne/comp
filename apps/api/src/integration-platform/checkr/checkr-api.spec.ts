import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { createCheckrGet } from './checkr-api';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createCheckrGet', () => {
  it('calls the production API with Basic auth (key as username)', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { data: [] }));
    const get = createCheckrGet({ api_key: 'sk_live' }, fetchImpl);

    await expect(get('/v1/candidates?per_page=100')).resolves.toEqual({ data: [] });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.checkr.com/v1/candidates?per_page=100');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('sk_live:').toString('base64')}`);
  });

  it('uses the staging API for a staging connection and follows its next_href', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {}));
    const get = createCheckrGet({ api_key: 'sk_test', environment: 'staging' }, fetchImpl);

    await get('https://api.checkr-staging.com/v1/candidates?page=2');
    expect(String(fetchImpl.mock.calls[0][0])).toBe('https://api.checkr-staging.com/v1/candidates?page=2');
  });

  it('never sends the key to another host', async () => {
    const fetchImpl = jest.fn();
    const get = createCheckrGet({ api_key: 'sk_live' }, fetchImpl);

    await expect(get('https://evil.example/v1/candidates')).rejects.toThrow(BadGatewayException);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('explains a rejected key and requires one to be stored', async () => {
    const get = createCheckrGet({ api_key: 'sk_bad' }, jest.fn().mockResolvedValue(jsonResponse(401, {})));
    await expect(get('/v1/candidates')).rejects.toThrow(BadRequestException);
    expect(() => createCheckrGet({})).toThrow(BadRequestException);
  });
});
