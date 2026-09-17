import nodemailer from 'nodemailer';
import { isSmtpConfigured, sendEmailViaSmtp } from './smtp';

jest.mock('nodemailer', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-message-id' });
  return {
    __esModule: true,
    default: { createTransport: jest.fn(() => ({ sendMail })) },
  };
});

// createTransport returns the same `sendMail` closure every call, so this handle
// stays valid regardless of the module-level transporter cache in smtp.ts.
const sendMailMock = (nodemailer.createTransport as unknown as jest.Mock)()
  .sendMail as jest.Mock;

const SMTP_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'SMTP_FROM_SYSTEM',
  'SMTP_FROM_MARKETING',
  'SMTP_FROM_TRUST_PORTAL',
];

describe('smtp', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMailMock.mockResolvedValue({ messageId: 'smtp-message-id' });
    process.env = { ...originalEnv };
    for (const key of SMTP_KEYS) delete process.env[key];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isSmtpConfigured', () => {
    it('is false when SMTP_HOST is unset', () => {
      expect(isSmtpConfigured()).toBe(false);
    });

    it('is true when SMTP_HOST is set', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      expect(isSmtpConfigured()).toBe(true);
    });
  });

  describe('sendEmailViaSmtp', () => {
    it('throws when no From address is configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';

      await expect(
        sendEmailViaSmtp({
          to: 'user@example.com',
          subject: 'Hello',
          html: '<p>hi</p>',
        }),
      ).rejects.toThrow(/SMTP_FROM/);
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('sends via nodemailer and returns the messageId', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_FROM = 'Comp AI <noreply@example.com>';

      const result = await sendEmailViaSmtp({
        to: 'user@example.com',
        subject: 'One-Time Password',
        html: '<p>123456</p>',
      });

      expect(result).toEqual({ id: 'smtp-message-id' });
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Comp AI <noreply@example.com>',
          to: 'user@example.com',
          subject: 'One-Time Password',
          html: '<p>123456</p>',
        }),
      );
    });

    it('prefers the system From override for the system channel', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_FROM = 'default@example.com';
      process.env.SMTP_FROM_SYSTEM = 'system@example.com';

      await sendEmailViaSmtp({
        to: 'user@example.com',
        subject: 'System notice',
        html: '<p>x</p>',
        channel: 'system',
      });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'system@example.com' }),
      );
    });

    it('falls back to SMTP_FROM when no channel override is set', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_FROM = 'default@example.com';

      await sendEmailViaSmtp({
        to: 'user@example.com',
        subject: 'Marketing',
        html: '<p>x</p>',
        channel: 'marketing',
      });

      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'default@example.com' }),
      );
    });
  });
});
