import { describe, expect, it } from 'bun:test';
import type { CheckContext, CheckResult } from '../../../types';
import { checkrBackgroundChecksCheck } from '../checks/background-checks';
import {
  checkrAuthHeader,
  compStatusForCheckrReport,
  currentCheckrReport,
  evaluateCheckrReport,
} from '../checkr-reports';
import type { CheckrCandidate, CheckrReport } from '../types';

const report = (overrides: Partial<CheckrReport>): CheckrReport => ({
  id: 'rep_1',
  status: 'complete',
  result: 'clear',
  created_at: '2026-06-01T00:00:00Z',
  completed_at: '2026-06-03T00:00:00Z',
  ...overrides,
});

describe('checkr report rules', () => {
  it('sends the key as the Basic auth username with an empty password', () => {
    expect(checkrAuthHeader(' sk_123 ')).toBe(`Basic ${Buffer.from('sk_123:').toString('base64')}`);
  });

  it.each([
    [{ status: 'complete', result: 'clear' }, 'completed'],
    [{ status: 'complete', result: 'consider', adjudication: 'engaged' }, 'completed'],
    [{ status: 'complete', result: 'consider', adjudication: null }, 'completed_with_flags'],
    [{ status: 'pending', result: null }, 'in_progress'],
    [{ status: 'suspended' }, 'in_review'],
    [{ status: 'dispute' }, 'in_review'],
    [{ status: 'canceled' }, 'cancelled'],
  ] as const)('maps %o to %s', (fields, expected) => {
    expect(compStatusForCheckrReport(report(fields))).toBe(expected);
  });

  it('prefers the newest report that was not cancelled', () => {
    const current = currentCheckrReport([
      report({ id: 'old', completed_at: '2025-01-01T00:00:00Z' }),
      report({ id: 'cancelled', status: 'canceled', completed_at: null, created_at: '2026-09-01T00:00:00Z' }),
      report({ id: 'new', completed_at: '2026-06-03T00:00:00Z' }),
    ]);
    expect(current?.id).toBe('new');
    expect(currentCheckrReport([])).toBeNull();
  });

  it('only fails pending reports once they stall', () => {
    const now = new Date('2026-09-25T00:00:00Z');
    expect(evaluateCheckrReport(report({ status: 'pending', result: null, created_at: '2026-09-20T00:00:00Z', completed_at: null }), now).outcome).toBe('skip');
    expect(evaluateCheckrReport(report({ status: 'pending', result: null, created_at: '2026-07-01T00:00:00Z', completed_at: null }), now).outcome).toBe('fail');
  });
});

describe('checkrBackgroundChecksCheck', () => {
  async function run(
    candidates: CheckrCandidate[],
    reports: Record<string, CheckrReport>,
    credentials: Record<string, string> = { api_key: 'sk_live' },
  ) {
    const passed: CheckResult[] = [];
    const failed: CheckResult[] = [];
    const calls: Array<{ path: string; baseUrl?: string; auth?: string }> = [];
    const ctx = {
      credentials,
      variables: {},
      connectionId: 'conn_1',
      organizationId: 'org_1',
      log: () => {},
      warn: () => {},
      error: () => {},
      pass: (r: CheckResult) => passed.push(r),
      fail: (r: CheckResult) => failed.push(r),
      fetch: (async (path: string, options?: { baseUrl?: string; headers?: Record<string, string> }) => {
        calls.push({ path, baseUrl: options?.baseUrl, auth: options?.headers?.Authorization });
        if (path.startsWith('/v1/candidates')) return { data: candidates, next_href: null };
        const id = path.split('/').pop() ?? '';
        if (!reports[id]) throw new Error('HTTP 404');
        return reports[id];
      }) as CheckContext['fetch'],
    } as unknown as CheckContext;
    await checkrBackgroundChecksCheck.run(ctx);
    return { passed, failed, calls };
  }

  it('passes clear reports, fails flagged ones and skips candidates without a report', async () => {
    const { passed, failed, calls } = await run(
      [
        { id: 'cand_clear', first_name: 'Ada', last_name: 'L', email: 'ada@personal.test', report_ids: ['r1'] },
        { id: 'cand_flag', first_name: 'Bo', report_ids: ['r2'] },
        { id: 'cand_invited', first_name: 'Cy', report_ids: [] },
      ],
      { r1: report({ id: 'r1' }), r2: report({ id: 'r2', result: 'consider' }) },
    );

    expect(passed.map((r) => r.resourceId)).toEqual(['cand_clear']);
    expect(failed.map((r) => r.resourceId)).toEqual(['cand_flag']);
    expect(JSON.stringify(passed[0].evidence)).not.toContain('ada@personal.test');
    expect(calls[0]).toMatchObject({ baseUrl: 'https://api.checkr.com', auth: checkrAuthHeader('sk_live') });
  });

  it('uses the staging API for a staging connection', async () => {
    const { calls } = await run([], {}, { api_key: 'sk_test', environment: 'staging' });
    expect(calls[0].baseUrl).toBe('https://api.checkr-staging.com');
  });

  it('fails the run when no API key is stored', async () => {
    const { failed } = await run([], {}, {});
    expect(failed[0].title).toBe('Checkr API key missing');
  });
});
