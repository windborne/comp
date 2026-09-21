import {
  employeeSyncPath,
  isLoopbackConfigured,
  loopbackBaseUrl,
  runCheckForTask,
  syncEmployees,
} from './loopback-client';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('loopback client', () => {
  const originalEnv = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SERVICE_TOKEN_TRIGGER: 'svc-token',
      PORT: '4444',
    };
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('is configured only when the Trigger service token is set', () => {
    expect(isLoopbackConfigured()).toBe(true);
    expect(loopbackBaseUrl()).toBe('http://127.0.0.1:4444');
    delete process.env.SERVICE_TOKEN_TRIGGER;
    expect(isLoopbackConfigured()).toBe(false);
  });

  it('maps built-in providers to their sync routes and others to the dynamic route', () => {
    expect(employeeSyncPath('google-workspace')).toBe(
      '/v1/integrations/sync/google-workspace/employees',
    );
    expect(employeeSyncPath('okta')).toBe(
      '/v1/integrations/sync/dynamic/okta/employees',
    );
  });

  it('calls the run-check endpoint with the service token and org header', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        totalPassing: 3,
        totalFindings: 1,
        taskStatus: 'failed',
      }),
    );

    const result = await runCheckForTask({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      connectionId: 'conn_1',
      checkId: 'two-factor-auth',
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        totalFindings: 1,
        taskStatus: 'failed',
      }),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://127.0.0.1:4444/v1/integrations/tasks/tsk_1/run-check',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['x-service-token']).toBe('svc-token');
    expect(headers['x-organization-id']).toBe('org_1');
    expect(JSON.parse(init.body as string)).toEqual({
      connectionId: 'conn_1',
      checkId: 'two-factor-auth',
    });
  });

  it('surfaces the API error message on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ message: 'Connection is not active' }, 400),
    );

    await expect(
      syncEmployees({
        organizationId: 'org_1',
        connectionId: 'conn_1',
        providerSlug: 'google-workspace',
      }),
    ).rejects.toThrow('Connection is not active');
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'http://127.0.0.1:4444/v1/integrations/sync/google-workspace/employees?connectionId=conn_1',
    );
  });

  it('refuses to call without a service token', async () => {
    delete process.env.SERVICE_TOKEN_TRIGGER;
    await expect(
      runCheckForTask({
        organizationId: 'o',
        taskId: 't',
        connectionId: 'c',
        checkId: 'x',
      }),
    ).rejects.toThrow('SERVICE_TOKEN_TRIGGER');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
