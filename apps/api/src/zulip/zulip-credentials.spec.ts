jest.mock('@db', () => ({
  db: { zulipIntegration: { findUnique: jest.fn() } },
}));

import { db } from '@db';
import {
  decryptBotApiKey,
  encryptBotApiKey,
  isEncryptionConfigured,
  loadZulipCredentials,
} from './zulip-credentials';

const findUnique = (
  db as unknown as { zulipIntegration: { findUnique: jest.Mock } }
).zulipIntegration.findUnique;

describe('zulip credentials', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ENCRYPTION_KEY: 'unit-test-encryption-key',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('round-trips the bot key through encryption', () => {
    const stored = encryptBotApiKey('bot-secret');

    expect(stored).not.toContain('bot-secret');
    expect(JSON.parse(stored)).toEqual(
      expect.objectContaining({
        encrypted: expect.any(String),
        iv: expect.any(String),
      }),
    );
    expect(decryptBotApiKey(stored)).toBe('bot-secret');
  });

  it('reports whether ENCRYPTION_KEY is set', () => {
    expect(isEncryptionConfigured()).toBe(true);
    delete process.env.ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
  });

  it('returns null when the organization has no Zulip integration', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      loadZulipCredentials({ organizationId: 'org_1' }),
    ).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
    });
  });

  it('skips disabled integrations unless asked to include them', async () => {
    findUnique.mockResolvedValue({
      siteUrl: 'https://chat.example.com',
      botEmail: 'bot@chat.example.com',
      botApiKey: encryptBotApiKey('bot-secret'),
      enabled: false,
    });

    await expect(
      loadZulipCredentials({ organizationId: 'org_1' }),
    ).resolves.toBeNull();
    await expect(
      loadZulipCredentials({ organizationId: 'org_1', includeDisabled: true }),
    ).resolves.toEqual({
      siteUrl: 'https://chat.example.com',
      botEmail: 'bot@chat.example.com',
      botApiKey: 'bot-secret',
    });
  });
});
