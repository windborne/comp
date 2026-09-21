import {
  normalizeZulipSiteUrl,
  sendZulipDirectMessage,
  truncateForZulip,
  ZULIP_MAX_MESSAGE_LENGTH,
} from './zulip-client';

const credentials = {
  siteUrl: 'https://chat.example.com/',
  botEmail: 'comp-bot@chat.example.com',
  botApiKey: 'secret-key',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('normalizeZulipSiteUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeZulipSiteUrl(' https://chat.example.com// ')).toBe(
      'https://chat.example.com',
    );
  });
});

describe('truncateForZulip', () => {
  it('keeps short content and shortens long content to the Zulip limit', () => {
    expect(truncateForZulip('hello')).toBe('hello');
    const long = 'x'.repeat(ZULIP_MAX_MESSAGE_LENGTH + 50);
    const truncated = truncateForZulip(long);
    expect(truncated).toHaveLength(ZULIP_MAX_MESSAGE_LENGTH);
    expect(truncated.endsWith('…')).toBe(true);
  });
});

describe('sendZulipDirectMessage', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('posts a private message to the recipient with bot basic auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 'success', id: 42 }));

    const result = await sendZulipDirectMessage({
      credentials,
      to: 'chris@example.com',
      content: '**Hi**',
    });

    expect(result).toEqual({ sent: true, messageId: 42 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://chat.example.com/api/v1/messages');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('comp-bot@chat.example.com:secret-key').toString('base64')}`,
    );
    const body = init.body as URLSearchParams;
    expect(body.get('type')).toBe('private');
    expect(body.get('to')).toBe(JSON.stringify(['chris@example.com']));
    expect(body.get('content')).toBe('**Hi**');
  });

  it('reports Zulip error responses without throwing', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          result: 'error',
          msg: "Invalid email 'nobody@example.com'",
          code: 'BAD_REQUEST',
        },
        400,
      ),
    );

    await expect(
      sendZulipDirectMessage({
        credentials,
        to: 'nobody@example.com',
        content: 'x',
      }),
    ).resolves.toEqual({
      sent: false,
      reason: "Invalid email 'nobody@example.com'",
    });
  });

  it('falls back to the HTTP status when the body is not Zulip JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(
      sendZulipDirectMessage({
        credentials,
        to: 'a@example.com',
        content: 'x',
      }),
    ).resolves.toEqual({ sent: false, reason: 'HTTP 502' });
  });

  it('reports network failures without throwing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      sendZulipDirectMessage({
        credentials,
        to: 'a@example.com',
        content: 'x',
      }),
    ).resolves.toEqual({ sent: false, reason: 'ECONNREFUSED' });
  });
});
