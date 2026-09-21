jest.mock('@db', () => ({
  db: {
    zulipIntegration: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));
jest.mock('./zulip-credentials', () => ({
  encryptBotApiKey: jest.fn((key: string) => `enc(${key})`),
  isEncryptionConfigured: jest.fn(() => true),
  loadZulipCredentials: jest.fn(),
}));
jest.mock('./zulip-client', () => ({
  ...jest.requireActual('./zulip-client'),
  sendZulipDirectMessage: jest.fn(),
}));

import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { db } from '@db';
import { sendZulipDirectMessage } from './zulip-client';
import {
  isEncryptionConfigured,
  loadZulipCredentials,
} from './zulip-credentials';
import { ZulipService } from './zulip.service';

const mockedDb = db as unknown as {
  zulipIntegration: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
};
const sendMock = sendZulipDirectMessage as jest.Mock;
const loadMock = loadZulipCredentials as jest.Mock;
const encryptionConfiguredMock = isEncryptionConfigured as jest.Mock;

const stored = {
  id: 'zul_1',
  organizationId: 'org_1',
  siteUrl: 'https://chat.example.com',
  botEmail: 'bot@chat.example.com',
  botApiKey: 'enc(old)',
  enabled: true,
  createdAt: new Date('2026-09-20T00:00:00Z'),
  updatedAt: new Date('2026-09-21T00:00:00Z'),
};

describe('ZulipService', () => {
  const service = new ZulipService();

  beforeEach(() => {
    jest.clearAllMocks();
    encryptionConfiguredMock.mockReturnValue(true);
    mockedDb.zulipIntegration.upsert.mockImplementation(({ create, update }) =>
      Promise.resolve({ ...stored, ...create, ...update }),
    );
  });

  it('reports an unconfigured organization without secrets', async () => {
    mockedDb.zulipIntegration.findUnique.mockResolvedValue(null);

    await expect(service.getSettings('org_1')).resolves.toEqual({
      configured: false,
      enabled: false,
      siteUrl: null,
      botEmail: null,
      updatedAt: null,
    });
  });

  it('returns the connection without the bot key', async () => {
    mockedDb.zulipIntegration.findUnique.mockResolvedValue(stored);

    const view = await service.getSettings('org_1');

    expect(view).toEqual({
      configured: true,
      enabled: true,
      siteUrl: 'https://chat.example.com',
      botEmail: 'bot@chat.example.com',
      updatedAt: '2026-09-21T00:00:00.000Z',
    });
    expect(JSON.stringify(view)).not.toContain('enc(');
  });

  it('requires the bot key when connecting for the first time', async () => {
    mockedDb.zulipIntegration.findUnique.mockResolvedValue(null);

    await expect(
      service.upsertSettings({
        organizationId: 'org_1',
        dto: {
          siteUrl: 'https://chat.example.com',
          botEmail: 'bot@chat.example.com',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockedDb.zulipIntegration.upsert).not.toHaveBeenCalled();
  });

  it('refuses to store a key without ENCRYPTION_KEY', async () => {
    mockedDb.zulipIntegration.findUnique.mockResolvedValue(null);
    encryptionConfiguredMock.mockReturnValue(false);

    await expect(
      service.upsertSettings({
        organizationId: 'org_1',
        dto: {
          siteUrl: 'https://chat.example.com',
          botEmail: 'bot@chat.example.com',
          botApiKey: 'new',
        },
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('creates the connection with a normalized URL and an encrypted key', async () => {
    mockedDb.zulipIntegration.findUnique.mockResolvedValue(null);

    const view = await service.upsertSettings({
      organizationId: 'org_1',
      dto: {
        siteUrl: 'https://chat.example.com/',
        botEmail: ' Bot@Chat.example.com ',
        botApiKey: 'new',
      },
    });

    expect(mockedDb.zulipIntegration.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
      create: {
        organizationId: 'org_1',
        siteUrl: 'https://chat.example.com',
        botEmail: 'bot@chat.example.com',
        botApiKey: 'enc(new)',
        enabled: true,
      },
      update: {
        siteUrl: 'https://chat.example.com',
        botEmail: 'bot@chat.example.com',
        botApiKey: 'enc(new)',
        enabled: true,
      },
    });
    expect(view.configured).toBe(true);
  });

  it('keeps the stored key and enabled flag when they are omitted on update', async () => {
    mockedDb.zulipIntegration.findUnique.mockResolvedValue({
      ...stored,
      enabled: false,
    });

    await service.upsertSettings({
      organizationId: 'org_1',
      dto: {
        siteUrl: 'https://chat.example.com',
        botEmail: 'bot@chat.example.com',
      },
    });

    const call = mockedDb.zulipIntegration.upsert.mock.calls[0][0];
    expect(call.update.botApiKey).toBe('enc(old)');
    expect(call.update.enabled).toBe(false);
  });

  it('removes the connection', async () => {
    mockedDb.zulipIntegration.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.removeSettings('org_1')).resolves.toEqual({
      success: true,
    });
    expect(mockedDb.zulipIntegration.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
    });
  });

  it('rejects a test message when Zulip is not connected', async () => {
    loadMock.mockResolvedValue(null);

    await expect(
      service.sendTestMessage({
        organizationId: 'org_1',
        email: 'chris@example.com',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sends the test message to the given address, even when mirroring is disabled', async () => {
    const credentials = {
      siteUrl: 'https://chat.example.com',
      botEmail: 'b',
      botApiKey: 'k',
    };
    loadMock.mockResolvedValue(credentials);
    sendMock.mockResolvedValue({ sent: true, messageId: 7 });

    await expect(
      service.sendTestMessage({
        organizationId: 'org_1',
        email: 'chris@example.com',
      }),
    ).resolves.toEqual({ sent: true, messageId: 7 });
    expect(loadMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      includeDisabled: true,
    });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ credentials, to: 'chris@example.com' }),
    );
  });
});
