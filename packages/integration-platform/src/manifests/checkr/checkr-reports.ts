/**
 * Checkr helpers shared by the Checkr check (this package) and the API's
 * background-check sync, so both read reports the same way.
 */
import type {
  CheckrEnvironment,
  CheckrReport,
  CompBackgroundCheckStatus,
} from './types';

export const CHECKR_API_BASE_URLS: Record<CheckrEnvironment, string> = {
  production: 'https://api.checkr.com',
  staging: 'https://api.checkr-staging.com',
};

/** A report older than this that is still pending is reported as stalled. */
export const CHECKR_STALLED_AFTER_DAYS = 30;

export function checkrEnvironment(value: unknown): CheckrEnvironment {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'staging' ? 'staging' : 'production';
}

/** Checkr uses HTTP Basic auth with the secret key as username and no password. */
export function checkrAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey.trim()}:`).toString('base64')}`;
}

export function checkrCandidateUrl(candidateId: string): string {
  return `https://dashboard.checkr.com/candidates/${candidateId}`;
}

/** Map a Checkr report onto Comp's background-check status. */
export function compStatusForCheckrReport(report: CheckrReport): CompBackgroundCheckStatus {
  switch (report.status) {
    case 'canceled':
      return 'cancelled';
    case 'pending':
      return 'in_progress';
    case 'suspended':
    case 'dispute':
      return 'in_review';
    default:
      break;
  }
  // Complete: a `consider` result counts as flagged unless the employer engaged the candidate.
  if (report.result === 'consider' && report.adjudication !== 'engaged') {
    return 'completed_with_flags';
  }
  return 'completed';
}

const reportTime = (report: CheckrReport): number => {
  const time = Date.parse(report.completed_at ?? report.created_at ?? '');
  return Number.isNaN(time) ? 0 : time;
};

/**
 * The report that represents a candidate today: the newest one that was not
 * cancelled, else the newest cancelled one.
 */
export function currentCheckrReport(reports: CheckrReport[]): CheckrReport | null {
  const sorted = [...reports].sort((a, b) => reportTime(b) - reportTime(a));
  return sorted.find((report) => report.status !== 'canceled') ?? sorted[0] ?? null;
}

export type CheckrReportVerdict =
  | { outcome: 'pass'; reason: string }
  | { outcome: 'fail'; reason: string; severity: 'low' | 'medium' | 'high' }
  | { outcome: 'skip'; reason: string };

/** Compliance verdict for one candidate's current report. */
export function evaluateCheckrReport(report: CheckrReport, now: Date): CheckrReportVerdict {
  const status = compStatusForCheckrReport(report);
  if (status === 'completed') {
    return {
      outcome: 'pass',
      reason: report.result === 'consider' ? 'Completed; employer engaged after review' : 'Completed with a clear result',
    };
  }
  if (status === 'completed_with_flags') {
    return { outcome: 'fail', reason: 'Completed with a "consider" result that has not been adjudicated', severity: 'high' };
  }
  if (status === 'in_review') {
    return { outcome: 'fail', reason: `Report is ${report.status}`, severity: 'medium' };
  }
  if (status === 'in_progress') {
    const ageDays = (now.getTime() - reportTime(report)) / 86_400_000;
    return ageDays > CHECKR_STALLED_AFTER_DAYS
      ? { outcome: 'fail', reason: `Pending for ${Math.floor(ageDays)} days`, severity: 'low' }
      : { outcome: 'skip', reason: 'In progress' };
  }
  return { outcome: 'skip', reason: 'Cancelled' };
}
