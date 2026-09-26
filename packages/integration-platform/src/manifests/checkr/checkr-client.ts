/**
 * Read-only Checkr API access, parameterised by a GET function so the check
 * (ctx.fetch) and the API's background-check sync (plain fetch) share it.
 */
import type { CheckrCandidate, CheckrList, CheckrReport } from './types';

/** GET a Checkr path (`/v1/...`) or an absolute `next_href` URL and parse JSON. */
export type CheckrGet = <T>(pathOrUrl: string) => Promise<T>;

const MAX_PAGES = 500;

/** Every candidate on the account, following Checkr's `next_href` links. */
export async function listCheckrCandidates(get: CheckrGet): Promise<CheckrCandidate[]> {
  const candidates: CheckrCandidate[] = [];
  let next: string | null = '/v1/candidates?per_page=100';
  for (let page = 0; next && page < MAX_PAGES; page++) {
    const response: CheckrList<CheckrCandidate> = await get<CheckrList<CheckrCandidate>>(next);
    candidates.push(...(response.data ?? []));
    next = response.next_href || null;
  }
  return candidates;
}

/**
 * The reports of the given candidates, keyed by candidate id. Reports that
 * cannot be read are skipped and reported through `onError`.
 */
export async function loadCheckrReports({
  get,
  candidates,
  onError,
}: {
  get: CheckrGet;
  candidates: CheckrCandidate[];
  onError?: (reportId: string, error: unknown) => void;
}): Promise<Map<string, CheckrReport[]>> {
  const byCandidate = new Map<string, CheckrReport[]>();
  for (const candidate of candidates) {
    const reports: CheckrReport[] = [];
    for (const reportId of candidate.report_ids ?? []) {
      try {
        reports.push(await get<CheckrReport>(`/v1/reports/${encodeURIComponent(reportId)}`));
      } catch (error) {
        onError?.(reportId, error);
      }
    }
    byCandidate.set(candidate.id, reports);
  }
  return byCandidate;
}

export function checkrCandidateName(candidate: CheckrCandidate): string {
  return [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim();
}
