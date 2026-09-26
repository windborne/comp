import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import { checkrCandidateName, loadCheckrReports, type CheckrGet } from '../checkr-client';
import {
  checkrAuthHeader,
  checkrCandidateUrl,
  CHECKR_API_BASE_URLS,
  checkrEnvironment,
  currentCheckrReport,
  evaluateCheckrReport,
  readCheckrLinkedCandidateIds,
} from '../checkr-reports';
import type { CheckrCandidate } from '../types';

const credential = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/**
 * Evaluates only the Checkr candidates the background-check sync linked to the
 * organization's active members (connection metadata), never applicants who
 * were not hired. Evidence carries a pass/fail verdict, not the report's
 * result or adjudication, because check evidence is readable by auditors.
 */
export const checkrBackgroundChecksCheck: IntegrationCheck = {
  id: 'checkr_background_checks',
  name: 'Background checks completed in Checkr',
  description:
    "Each current employee's Checkr report is complete and cleared, and none is flagged, disputed, suspended or stalled.",
  taskMapping: TASK_TEMPLATES.employeeVerification,
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const apiKey = credential(ctx.credentials.api_key);
    if (!apiKey) {
      ctx.fail({
        title: 'Checkr API key missing',
        description: 'The connection has no Checkr API key.',
        resourceType: 'integration',
        resourceId: ctx.connectionId,
        severity: 'high',
        remediation: 'Reconnect Checkr with a secret API key from Account Settings > Developer Settings.',
      });
      return;
    }
    const environment = checkrEnvironment(ctx.credentials.environment);
    if (environment === 'staging') {
      ctx.log('Checkr is connected in Staging (test mode): no compliance results are recorded.');
      return;
    }
    const linkedIds = readCheckrLinkedCandidateIds(ctx.metadata);
    if (!linkedIds) {
      ctx.fail({
        title: 'Checkr background checks have not been synced yet',
        description: 'The daily Checkr sync links candidates to employees; it has not run for this connection.',
        resourceType: 'integration',
        resourceId: ctx.connectionId,
        severity: 'low',
        remediation: 'Wait for the daily sync, or run POST /v1/integrations/sync/checkr/background-checks for this connection.',
      });
      return;
    }

    const base = new URL(CHECKR_API_BASE_URLS[environment]);
    const headers = { Authorization: checkrAuthHeader(apiKey), Accept: 'application/json' };
    const get: CheckrGet = (pathOrUrl) => {
      if (new URL(pathOrUrl, base).origin !== base.origin) {
        throw new Error('Refusing to send the Checkr key to another host');
      }
      return ctx.fetch(pathOrUrl, { baseUrl: base.origin, headers });
    };

    const candidates: CheckrCandidate[] = [];
    for (const id of linkedIds) {
      try {
        candidates.push(await get<CheckrCandidate>(`/v1/candidates/${encodeURIComponent(id)}`));
      } catch (error) {
        ctx.warn(`Could not read Checkr candidate ${id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const reports = await loadCheckrReports({
      get,
      candidates,
      onError: (reportId, error) =>
        ctx.warn(`Could not read Checkr report ${reportId}`, {
          error: error instanceof Error ? error.message : String(error),
        }),
    });
    ctx.log(`Evaluating ${candidates.length} Checkr candidates linked to current employees`);

    const now = new Date();
    for (const candidate of candidates) {
      const report = currentCheckrReport(reports.get(candidate.id) ?? []);
      if (!report) continue;
      const verdict = evaluateCheckrReport(report, now);
      if (verdict.outcome === 'skip') continue;

      const name = checkrCandidateName(candidate) || `Candidate ${candidate.id}`;
      const evidence = {
        candidateId: candidate.id,
        candidate: name,
        reportId: report.id,
        package: report.package ?? null,
        completedAt: report.completed_at ?? null,
        link: checkrCandidateUrl(candidate.id),
      };
      if (verdict.outcome === 'pass') {
        ctx.pass({
          title: `${name}: background check complete`,
          description: 'The current Checkr report is complete and cleared.',
          resourceType: 'checkr_candidate',
          resourceId: candidate.id,
          evidence,
        });
      } else {
        ctx.fail({
          title: `${name}: background check needs attention`,
          description: 'The current Checkr report is not complete and cleared. Review it in Checkr.',
          resourceType: 'checkr_candidate',
          resourceId: candidate.id,
          severity: verdict.severity,
          remediation: `Open ${evidence.link} in Checkr and complete, adjudicate or re-order the report.`,
          evidence,
        });
      }
    }
  },
};
