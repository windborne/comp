import { z } from 'zod';

/**
 * Calls the API's own integration endpoints from inside the API process, the
 * way the Trigger.dev workers call them from outside: with the Trigger service
 * token and an organization header. Reusing the endpoints keeps the scheduled
 * runs identical to manual runs (same credential refresh, persistence and task
 * status rules) without a second implementation.
 */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function loopbackServiceToken(): string | undefined {
  return process.env.SERVICE_TOKEN_TRIGGER || undefined;
}

export function loopbackBaseUrl(): string {
  return `http://127.0.0.1:${process.env.PORT ?? 3333}`;
}

export function isLoopbackConfigured(): boolean {
  return Boolean(loopbackServiceToken());
}

export async function callInternalApi<T>({
  method,
  path,
  organizationId,
  body,
  schema,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  method: 'POST';
  path: string;
  organizationId: string;
  body?: Record<string, unknown>;
  schema: z.ZodType<T>;
  timeoutMs?: number;
}): Promise<T> {
  const token = loopbackServiceToken();
  if (!token) {
    throw new Error('SERVICE_TOKEN_TRIGGER is not configured');
  }
  const response = await fetch(`${loopbackBaseUrl()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-service-token': token,
      'x-organization-id': organizationId,
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      json && typeof json === 'object' && 'message' in json
        ? String(json.message)
        : `HTTP ${response.status}`;
    throw new Error(`${method} ${path} failed: ${message}`);
  }
  return schema.parse(json);
}

const runCheckForTaskResponse = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    accountsRun: z.number().optional(),
    totalPassing: z.number().optional(),
    totalFindings: z.number().optional(),
    hadErrors: z.boolean().optional(),
    taskStatus: z.string().nullable().optional(),
  })
  .passthrough();
export type RunCheckForTaskResponse = z.infer<typeof runCheckForTaskResponse>;

/** Runs one check for a task against every active account of its provider. */
export function runCheckForTask({
  organizationId,
  taskId,
  connectionId,
  checkId,
}: {
  organizationId: string;
  taskId: string;
  connectionId: string;
  checkId: string;
}): Promise<RunCheckForTaskResponse> {
  return callInternalApi({
    method: 'POST',
    path: `/v1/integrations/tasks/${taskId}/run-check`,
    organizationId,
    body: { connectionId, checkId },
    schema: runCheckForTaskResponse,
  });
}

const runConnectionChecksResponse = z
  .object({ checkRunId: z.string().optional() })
  .passthrough();

/** Runs all of a connection's checks (the "Run checks" button). */
export function runConnectionChecks({
  organizationId,
  connectionId,
}: {
  organizationId: string;
  connectionId: string;
}): Promise<z.infer<typeof runConnectionChecksResponse>> {
  return callInternalApi({
    method: 'POST',
    path: `/v1/integrations/checks/connections/${connectionId}/run`,
    organizationId,
    schema: runConnectionChecksResponse,
  });
}

const ensureValidCredentialsResponse = z
  .object({ success: z.boolean().optional(), error: z.string().optional() })
  .passthrough();

export function ensureValidCredentials({
  organizationId,
  connectionId,
  forceRefresh,
}: {
  organizationId: string;
  connectionId: string;
  forceRefresh: boolean;
}): Promise<z.infer<typeof ensureValidCredentialsResponse>> {
  return callInternalApi({
    method: 'POST',
    path: `/v1/integrations/connections/${connectionId}/ensure-valid-credentials`,
    organizationId,
    body: { forceRefresh },
    schema: ensureValidCredentialsResponse,
    timeoutMs: 60 * 1000,
  });
}

/** Built-in providers have dedicated sync routes; everything else is dynamic. */
export function employeeSyncPath(providerSlug: string): string {
  switch (providerSlug) {
    case 'google-workspace':
    case 'rippling':
    case 'jumpcloud':
      return `/v1/integrations/sync/${providerSlug}/employees`;
    default:
      return `/v1/integrations/sync/dynamic/${encodeURIComponent(providerSlug)}/employees`;
  }
}

const employeeSyncResponse = z
  .object({
    success: z.boolean().optional(),
    imported: z.number().optional(),
    reactivated: z.number().optional(),
    deactivated: z.number().optional(),
    skipped: z.number().optional(),
    errors: z.number().optional(),
  })
  .passthrough();
export type EmployeeSyncResponse = z.infer<typeof employeeSyncResponse>;

export function syncEmployees({
  organizationId,
  connectionId,
  providerSlug,
}: {
  organizationId: string;
  connectionId: string;
  providerSlug: string;
}): Promise<EmployeeSyncResponse> {
  const path = `${employeeSyncPath(providerSlug)}?connectionId=${encodeURIComponent(connectionId)}`;
  return callInternalApi({
    method: 'POST',
    path,
    organizationId,
    schema: employeeSyncResponse,
  });
}

export function syncDevices({
  organizationId,
  connectionId,
  providerSlug,
}: {
  organizationId: string;
  connectionId: string;
  providerSlug: string;
}): Promise<Record<string, unknown>> {
  const path = `/v1/integrations/sync/dynamic/${encodeURIComponent(providerSlug)}/devices?connectionId=${encodeURIComponent(connectionId)}`;
  return callInternalApi({
    method: 'POST',
    path,
    organizationId,
    schema: z.object({}).passthrough(),
  });
}
