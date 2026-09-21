import { describe, expect, it } from 'vitest';
import {
  buildZulipSettingsFormSchema,
  toSaveZulipSettingsInput,
  zulipSettingsToFormValues,
} from './zulip-settings-form';

const valid = {
  siteUrl: 'https://chat.example.com',
  botEmail: 'bot@chat.example.com',
  botApiKey: '',
  enabled: true,
};

describe('zulip settings form schema', () => {
  it('requires the bot key on first connection only', () => {
    expect(buildZulipSettingsFormSchema({ requireApiKey: true }).safeParse(valid).success).toBe(
      false,
    );
    expect(buildZulipSettingsFormSchema({ requireApiKey: false }).safeParse(valid).success).toBe(
      true,
    );
  });

  it('rejects a site URL without a protocol and a malformed bot email', () => {
    const schema = buildZulipSettingsFormSchema({ requireApiKey: false });
    expect(schema.safeParse({ ...valid, siteUrl: 'chat.example.com' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, botEmail: 'not-an-email' }).success).toBe(false);
  });
});

describe('zulipSettingsToFormValues', () => {
  it('starts enabled with empty fields when nothing is configured', () => {
    expect(
      zulipSettingsToFormValues({
        configured: false,
        enabled: false,
        siteUrl: null,
        botEmail: null,
        updatedAt: null,
      }),
    ).toEqual({ siteUrl: '', botEmail: '', botApiKey: '', enabled: true });
  });

  it('never prefills the stored key', () => {
    expect(
      zulipSettingsToFormValues({
        configured: true,
        enabled: false,
        siteUrl: 'https://chat.example.com',
        botEmail: 'bot@chat.example.com',
        updatedAt: '2026-09-21T00:00:00.000Z',
      }),
    ).toEqual({
      siteUrl: 'https://chat.example.com',
      botEmail: 'bot@chat.example.com',
      botApiKey: '',
      enabled: false,
    });
  });
});

describe('toSaveZulipSettingsInput', () => {
  it('drops an empty key so the API keeps the stored one', () => {
    expect(toSaveZulipSettingsInput(valid)).toEqual({
      siteUrl: 'https://chat.example.com',
      botEmail: 'bot@chat.example.com',
      enabled: true,
    });
    expect(toSaveZulipSettingsInput({ ...valid, botApiKey: 'k' })).toHaveProperty(
      'botApiKey',
      'k',
    );
  });
});
