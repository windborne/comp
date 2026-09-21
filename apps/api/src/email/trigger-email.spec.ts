import { render } from '@react-email/render';
import { tasks } from '@trigger.dev/sdk';
import type { ReactElement } from 'react';
import { mirrorEmailToZulip } from '../zulip/zulip-mirror';
import { isSmtpConfigured, sendEmailViaSmtp } from './smtp';
import { triggerEmail } from './trigger-email';

jest.mock('@react-email/render', () => ({
  __esModule: true,
  render: jest.fn(),
}));

jest.mock('@trigger.dev/sdk', () => ({
  __esModule: true,
  tasks: { trigger: jest.fn() },
}));

jest.mock('./smtp', () => ({
  __esModule: true,
  isSmtpConfigured: jest.fn(),
  sendEmailViaSmtp: jest.fn(),
}));

jest.mock('../zulip/zulip-mirror', () => ({
  __esModule: true,
  mirrorEmailToZulip: jest.fn(),
}));

const renderMock = render as jest.Mock;
const triggerMock = tasks.trigger as jest.Mock;
const isSmtpConfiguredMock = isSmtpConfigured as jest.Mock;
const sendEmailViaSmtpMock = sendEmailViaSmtp as jest.Mock;
const mirrorEmailToZulipMock = mirrorEmailToZulip as jest.Mock;

// render is mocked, so the element's actual shape is irrelevant here.
const react = {} as unknown as ReactElement;

describe('triggerEmail', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.TRIGGER_SECRET_KEY;
    renderMock.mockResolvedValue('<html>email</html>');
    triggerMock.mockResolvedValue({ id: 'trigger-handle-id' });
    sendEmailViaSmtpMock.mockResolvedValue({ id: 'smtp-message-id' });
    isSmtpConfiguredMock.mockReturnValue(false);
    mirrorEmailToZulipMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses the Trigger.dev task when TRIGGER_SECRET_KEY is set', async () => {
    process.env.TRIGGER_SECRET_KEY = 'tr_secret';

    const result = await triggerEmail({
      to: 'user@example.com',
      subject: 'Subject',
      react,
    });

    expect(result).toEqual({ id: 'trigger-handle-id' });
    expect(triggerMock).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Subject',
        html: '<html>email</html>',
        channel: 'default',
      }),
    );
    expect(sendEmailViaSmtpMock).not.toHaveBeenCalled();
  });

  it('falls back to SMTP when Trigger.dev is not configured but SMTP is', async () => {
    isSmtpConfiguredMock.mockReturnValue(true);

    const result = await triggerEmail({
      to: 'user@example.com',
      subject: 'One-Time Password',
      react,
      system: true,
    });

    expect(result).toEqual({ id: 'smtp-message-id' });
    expect(sendEmailViaSmtpMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'One-Time Password',
        html: '<html>email</html>',
        channel: 'system',
      }),
    );
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('throws when no transport is configured', async () => {
    isSmtpConfiguredMock.mockReturnValue(false);

    await expect(
      triggerEmail({ to: 'user@example.com', subject: 'Subject', react }),
    ).rejects.toThrow(/No email transport configured/);
    expect(triggerMock).not.toHaveBeenCalled();
    expect(sendEmailViaSmtpMock).not.toHaveBeenCalled();
  });

  it('mirrors the rendered email to Zulip for the organization', async () => {
    isSmtpConfiguredMock.mockReturnValue(true);

    await triggerEmail({
      to: 'user@example.com',
      subject: 'Task assigned',
      react,
      organizationId: 'org_1',
      system: true,
    });

    expect(mirrorEmailToZulipMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      to: 'user@example.com',
      subject: 'Task assigned',
      html: '<html>email</html>',
      channel: 'system',
    });
  });

  it('still mirrors to Zulip when the email transport fails', async () => {
    isSmtpConfiguredMock.mockReturnValue(true);
    sendEmailViaSmtpMock.mockRejectedValue(new Error('smtp down'));

    await expect(
      triggerEmail({
        to: 'user@example.com',
        subject: 'S',
        react,
        organizationId: 'org_1',
      }),
    ).rejects.toThrow('smtp down');
    expect(mirrorEmailToZulipMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a rejected Zulip mirror and returns the email result', async () => {
    isSmtpConfiguredMock.mockReturnValue(true);
    mirrorEmailToZulipMock.mockRejectedValue(new Error('zulip exploded'));

    await expect(
      triggerEmail({
        to: 'user@example.com',
        subject: 'S',
        react,
        organizationId: 'org_1',
      }),
    ).resolves.toEqual({ id: 'smtp-message-id' });
  });
});
