import { TASK_TEMPLATES } from '../../../task-mappings';
import type { IntegrationCheck } from '../../../types';
import {
  checkrCandidateName,
  listCheckrCandidates,
  loadCheckrReports,
  type CheckrGet,
} from '../checkr-client';
import {
  checkrAuthHeader,
  checkrCandidateUrl,
  CHECKR_API_BASE_URLS,
  checkrEnvironment,
  currentCheckrReport,
  evaluateCheckrReport,
} from '../checkr-reports';

export const checkrBackgroundChecksCheck: IntegrationCheck = {
  id: 'checkr_background_checks',
  name: 'Background checks completed in Checkr',
  description:
    "Each Checkr candidate's current report is complete with a clear or adjudicated result, and none is flagged, disputed or stalled.",
  taskMapping: TASK_TEMPLATES.employeeVerification,
  defaultSeverity: 'medium',

  run: async (ctx) => {
    const apiKey = String(
      Array.isArray(ctx.credentials.api_key) ? ctx.credentials.api_key[0] : ctx.credentials.api_key ?? '',
    );
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
    const headers = { Authorization: checkrAuthHeader(apiKey), Accept: 'application/json' };
    const baseUrl = CHECKR_API_BASE_URLS[checkrEnvironment(ctx.credentials.environment)];
    const get: CheckrGet = (pathOrUrl) => ctx.fetch(pathOrUrl, { baseUrl, headers });

    const candidates = await listCheckrCandidates(get);
    const reports = await loadCheckrReports({
      get,
      candidates,
      onError: (reportId, error) =>
        ctx.warn(`Could not read Checkr report ${reportId}`, {
          error: error instanceof Error ? error.message : String(error),
        }),
    });
    ctx.log(`Evaluating ${candidates.length} Checkr candidates`);

    const now = new Date();
    for (const candidate of candidates) {
      const report = currentCheckrReport(reports.get(candidate.id) ?? []);
      if (!report) continue; // invited, no report ordered yet
      const verdict = evaluateCheckrReport(report, now);
      if (verdict.outcome === 'skip') continue;

      const name = checkrCandidateName(candidate) || `Candidate ${candidate.id}`;
      // Personal emails stay out of evidence; the name and Checkr link identify the person.
      const evidence = {
        candidateId: candidate.id,
        candidate: name,
        reportId: report.id,
        package: report.package ?? null,
        status: report.status,
        result: report.result ?? null,
        adjudication: report.adjudication ?? null,
        createdAt: report.created_at ?? null,
        completedAt: report.completed_at ?? null,
        link: checkrCandidateUrl(candidate.id),
      };
      if (verdict.outcome === 'pass') {
        ctx.pass({
          title: `${name}: background check complete`,
          description: verdict.reason,
          resourceType: 'checkr_candidate',
          resourceId: candidate.id,
          evidence,
        });
      } else {
        ctx.fail({
          title: `${name}: background check needs attention`,
          description: verdict.reason,
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
