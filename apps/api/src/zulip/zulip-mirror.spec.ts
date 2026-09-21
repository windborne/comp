jest.mock('./zulip-credentials', () => ({ loadZulipCredentials: jest.fn() }));
jest.mock('./zulip-client', () => ({ sendZulipDirectMessage: jest.fn() }));
jest.mock('./email-to-zulip', () => ({ emailHtmlToZulipMarkdown: jest.fn() }));

import { emailHtmlToZulipMarkdown } from './email-to-zulip';
import { sendZulipDirectMessage } from './zulip-client';
import { loadZulipCredentials } from './zulip-credentials';
import { mirrorEmailToZulip } from './zulip-mirror';

const loadMock = loadZulipCredentials as jest.Mock;
const sendMock = sendZulipDirectMessage as jest.Mock;
const convertMock = emailHtmlToZulipMarkdown as jest.Mock;

const credentials = {
  siteUrl: 'https://chat.example.com',
  botEmail: 'bot@chat.example.com',
  botApiKey: 'k',
};
const email = {
  organizationId: 'org_1',
  to: 'chris@example.com',
  subject: 'Task assigned',
  html: '<p>hi</p>',
};

describe('mirrorEmailToZulip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loadMock.mockResolvedValue(credentials);
    convertMock.mockReturnValue('**Task assigned**\n\nhi');
    sendMock.mockResolvedValue({ sent: true, messageId: 1 });
  });

  it('sends the converted email as a direct message', async () => {
    await mirrorEmailToZulip({ ...email, channel: 'system' });

    expect(loadMock).toHaveBeenCalledWith({ organizationId: 'org_1' });
    expect(convertMock).toHaveBeenCalledWith({
      subject: 'Task assigned',
      html: '<p>hi</p>',
    });
    expect(sendMock).toHaveBeenCalledWith({
      credentials,
      to: 'chris@example.com',
      content: '**Task assigned**\n\nhi',
    });
  });

  it('does nothing without an organization', async () => {
    await mirrorEmailToZulip({ ...email, organizationId: undefined });

    expect(loadMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does nothing for external channels', async () => {
    await mirrorEmailToZulip({ ...email, channel: 'trustPortal' });
    await mirrorEmailToZulip({ ...email, channel: 'marketing' });

    expect(loadMock).not.toHaveBeenCalled();
  });

  it('does nothing when Zulip is not connected', async () => {
    loadMock.mockResolvedValue(null);

    await mirrorEmailToZulip(email);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('swallows lookup failures so the email is unaffected', async () => {
    loadMock.mockRejectedValue(new Error('db down'));

    await expect(mirrorEmailToZulip(email)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
