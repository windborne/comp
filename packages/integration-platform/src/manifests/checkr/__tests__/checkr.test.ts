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
  async function run({
    candidates,
    reports,
    linked,
    credentials = { api_key: 'sk_live' },
  }: {
    candidates: CheckrCandidate[];
    reports: Record<string, CheckrReport>;
    linked: string[] | null;
    credentials?: Record<string, string>;
  }) {
    const passed: CheckResult[] = [];
    const failed: CheckResult[] = [];
    const calls: Array<{ path: string; baseUrl?: string; auth?: string }> = [];
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const ctx = {
      credentials,
      variables: {},
      connectionId: 'conn_1',
      organizationId: 'org_1',
      metadata: linked ? { checkr: { linkedCandidateIds: linked, syncedAt: '2026-09-25T08:00:00Z' } } : {},
      log: () => {},
      warn: () => {},
      error: () => {},
      pass: (r: CheckResult) => passed.push(r),
      fail: (r: CheckResult) => failed.push(r),
      fetch: (async (path: string, options?: { baseUrl?: string; headers?: Record<string, string> }) => {
        calls.push({ path, baseUrl: options?.baseUrl, auth: options?.headers?.Authorization });
        const id = path.split('/').pop() ?? '';
        if (path.startsWith('/v1/candidates/')) return byId.get(id);
        if (!reports[id]) throw new Error('HTTP 404');
        return reports[id];
      }) as CheckContext['fetch'],
    } as unknown as CheckContext;
    await checkrBackgroundChecksCheck.run(ctx);
    return { passed, failed, calls };
  }

  it('evaluates only candidates linked to employees, without result details in evidence', async () => {
    const { passed, failed, calls } = await run({
      candidates: [
        { id: 'cand_clear', first_name: 'Ada', last_name: 'L', email: 'ada@personal.test', report_ids: ['r1'] },
        { id: 'cand_flag', first_name: 'Bo', report_ids: ['r2'] },
        { id: 'cand_applicant', first_name: 'Never', last_name: 'Hired', report_ids: ['r3'] },
      ],
      reports: {
        r1: report({ id: 'r1' }),
        r2: report({ id: 'r2', result: 'consider', adjudication: 'pre_adverse_action' }),
        r3: report({ id: 'r3', result: 'consider' }),
      },
      linked: ['cand_clear', 'cand_flag'],
    });

    expect(passed.map((r) => r.resourceId)).toEqual(['cand_clear']);
    expect(failed.map((r) => r.resourceId)).toEqual(['cand_flag']);
    expect(calls.some((c) => c.path.includes('cand_applicant') || c.path.endsWith('/r3'))).toBe(false);
    const allOutput = JSON.stringify([...passed, ...failed]);
    for (const leaked of ['ada@personal.test', 'consider', 'adverse']) expect(allOutput).not.toContain(leaked);
    expect(calls[0]).toMatchObject({ baseUrl: 'https://api.checkr.com', auth: checkrAuthHeader('sk_live') });
  });

  it('records nothing for a staging (test mode) connection', async () => {
    const { passed, failed, calls } = await run({
      candidates: [{ id: 'c', report_ids: ['r1'] }],
      reports: { r1: report({ id: 'r1' }) },
      linked: ['c'],
      credentials: { api_key: 'sk_test', environment: 'staging' },
    });
    expect([passed.length, failed.length, calls.length]).toEqual([0, 0, 0]);
  });

  it('asks for a sync when no candidates have been linked yet', async () => {
    const { failed, calls } = await run({ candidates: [], reports: {}, linked: null });
    expect(failed[0].title).toBe('Checkr background checks have not been synced yet');
    expect(calls).toEqual([]);
  });

  it('fails the run when no API key is stored', async () => {
    const { failed } = await run({ candidates: [], reports: {}, linked: [], credentials: {} });
    expect(failed[0].title).toBe('Checkr API key missing');
  });
});
