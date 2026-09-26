import { AttachmentEntityType, BackgroundCheckStatus, db } from '@db';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  checkrCandidateName,
  checkrCandidateUrl,
  compStatusForCheckrReport,
  currentCheckrReport,
  listCheckrCandidates,
  loadCheckrReports,
  type CheckrCandidate,
  type CheckrReport,
} from '@trycompai/integration-platform';
import { AttachmentsService } from '../../attachments/attachments.service';
import { CredentialVaultService } from '../services/credential-vault.service';
import { createCheckrGet } from './checkr-api';
import {
  matchCheckrCandidates,
  type CheckrCandidateMatch,
  type MatchableMember,
} from './checkr-candidate-matcher';
import { buildCheckrReportPdf } from './checkr-report-pdf';

export const CHECKR_PROVIDER = 'checkr';
const DRATA_IMPORT_TAG = 'Imported from Drata';
const COMPLETE: BackgroundCheckStatus[] = ['completed', 'completed_with_flags'];

export interface CheckrSyncSummary {
  success: true;
  candidates: number;
  matched: number;
  created: number;
  updated: number;
  unchanged: number;
  reportsAttached: number;
  skipped: Record<string, number>;
  unmatched: Array<{ candidateId: string; name: string }>;
  activeMembersWithoutCompletedCheck: number;
}

type MemberRow = Awaited<ReturnType<typeof loadMembers>>[number];

async function loadMembers(organizationId: string) {
  return db.member.findMany({
    where: { organizationId },
    select: {
      id: true,
      deactivated: true,
      user: { select: { email: true, name: true } },
      backgroundCheckRequests: {
        select: {
          id: true,
          status: true,
          employeeEmail: true,
          requesterNotes: true,
          identityBackgroundCheckId: true,
          externalProvider: true,
          externalCandidateId: true,
          externalReportId: true,
        },
      },
    },
  });
}

@Injectable()
export class CheckrBackgroundCheckSyncService {
  private readonly logger = new Logger(CheckrBackgroundCheckSyncService.name);

  constructor(
    private readonly credentialVault: CredentialVaultService,
    private readonly attachments: AttachmentsService,
  ) {}

  /** Bring every matched member's background-check record in line with Checkr. */
  async sync({
    organizationId,
    connectionId,
  }: {
    organizationId: string;
    connectionId: string;
  }): Promise<CheckrSyncSummary> {
    const connection = await db.integrationConnection.findFirst({
      where: { id: connectionId, organizationId, provider: { slug: CHECKR_PROVIDER } },
      select: { id: true, organization: { select: { name: true } } },
    });
    if (!connection) throw new NotFoundException('Checkr connection not found');

    const credentials = await this.credentialVault.getDecryptedCredentials(connectionId);
    const get = createCheckrGet(credentials);
    const candidates = await listCheckrCandidates(get);
    const members = await loadMembers(organizationId);
    const { matches, unmatched } = matchCheckrCandidates({
      candidates,
      members: members.map(toMatchable),
    });

    const byMember = groupByMember(matches);
    const reports = await loadCheckrReports({
      get,
      candidates: matches.map((m) => m.candidate),
      onError: (reportId, error) =>
        this.logger.warn(`Could not read Checkr report ${reportId}: ${String(error)}`),
    });

    const summary: CheckrSyncSummary = {
      success: true,
      candidates: candidates.length,
      matched: byMember.size,
      created: 0,
      updated: 0,
      unchanged: 0,
      reportsAttached: 0,
      skipped: {},
      unmatched: unmatched.map((c) => ({ candidateId: c.id, name: checkrCandidateName(c) })),
      activeMembersWithoutCompletedCheck: 0,
    };
    const skip = (reason: string) => (summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1);
    const membersById = new Map(members.map((m) => [m.id, m]));

    for (const [memberId, memberMatches] of byMember) {
      const member = membersById.get(memberId);
      if (!member) continue;
      const current = pickCurrent(memberMatches, reports);
      if (!current) {
        skip('no report ordered yet');
        continue;
      }
      const outcome = await this.applyReport({
        organizationId,
        organizationName: connection.organization.name,
        member,
        ...current,
      });
      if (outcome === 'created' || outcome === 'updated' || outcome === 'unchanged') summary[outcome]++;
      else skip(outcome);
      if (outcome === 'created' || outcome === 'updated') {
        summary.reportsAttached += (await this.attachSummaryIfComplete({
          organizationId,
          organizationName: connection.organization.name,
          member,
          ...current,
        }))
          ? 1
          : 0;
      }
    }

    const refreshed = await loadMembers(organizationId);
    summary.activeMembersWithoutCompletedCheck = refreshed.filter(
      (m) => !m.deactivated && !m.backgroundCheckRequests.some((r) => COMPLETE.includes(r.status)),
    ).length;
    return summary;
  }

  private async applyReport({
    organizationId,
    member,
    match,
    report,
  }: {
    organizationId: string;
    organizationName: string;
    member: MemberRow;
    match: CheckrCandidateMatch;
    report: CheckrReport;
  }): Promise<'created' | 'updated' | 'unchanged' | string> {
    const existing = member.backgroundCheckRequests[0] ?? null;
    if (existing?.identityBackgroundCheckId) return 'check run through Comp';
    const managed =
      existing?.externalProvider === CHECKR_PROVIDER ||
      existing?.requesterNotes?.startsWith(DRATA_IMPORT_TAG);
    if (existing && !managed) return 'manually managed record';

    const status = compStatusForCheckrReport(report);
    // Never let a cancelled re-run undo a completed check.
    if (existing && status === 'cancelled' && COMPLETE.includes(existing.status)) return 'unchanged';
    if (existing?.externalReportId === report.id && existing.status === status) return 'unchanged';

    const { candidate } = match;
    const data = {
      status,
      employeeName: checkrCandidateName(candidate) || member.user.name || member.user.email,
      employeeEmail: candidate.email?.trim().toLowerCase() || existing?.employeeEmail || member.user.email,
      externalProvider: CHECKR_PROVIDER,
      externalCandidateId: candidate.id,
      externalReportId: report.id,
      requesterNotes: describeReport({ candidate, report, matchedByName: match.method === 'name' }),
      reportSyncedAt: new Date(report.completed_at ?? report.created_at ?? Date.now()),
      lastSyncedAt: new Date(),
    };
    if (existing) {
      await db.backgroundCheckRequest.update({ where: { id: existing.id }, data });
      return 'updated';
    }
    await db.backgroundCheckRequest.create({ data: { ...data, organizationId, memberId: member.id } });
    return 'created';
  }

  /** Attach a summary PDF once per report + status; the People page shows it as the report. */
  private async attachSummaryIfComplete({
    organizationId,
    organizationName,
    member,
    match,
    report,
  }: {
    organizationId: string;
    organizationName: string;
    member: MemberRow;
    match: CheckrCandidateMatch;
    report: CheckrReport;
  }): Promise<boolean> {
    const status = compStatusForCheckrReport(report);
    if (!COMPLETE.includes(status)) return false;
    const record = await db.backgroundCheckRequest.findUniqueOrThrow({
      where: { organizationId_memberId: { organizationId, memberId: member.id } },
      select: { id: true },
    });
    const fileName = `checkr-${report.id}-${status}.pdf`;
    const already = await db.attachment.findFirst({
      where: { organizationId, entityId: record.id, entityType: AttachmentEntityType.background_check, name: fileName },
      select: { id: true },
    });
    if (already) return false;
    const pdf = await buildCheckrReportPdf({
      organizationName,
      memberEmail: member.user.email,
      candidateId: match.candidate.id,
      candidateName: checkrCandidateName(match.candidate),
      report,
      compStatus: status,
    });
    await this.attachments.uploadAttachment(organizationId, record.id, AttachmentEntityType.background_check, {
      fileName,
      fileType: 'application/pdf',
      fileData: pdf.toString('base64'),
    });
    return true;
  }
}

function toMatchable(member: MemberRow): MatchableMember {
  const record = member.backgroundCheckRequests[0] ?? null;
  return {
    memberId: member.id,
    email: member.user.email,
    name: member.user.name,
    record: record
      ? {
          employeeEmail: record.employeeEmail,
          externalCandidateId: record.externalCandidateId,
          requesterNotes: record.requesterNotes,
        }
      : null,
  };
}

function groupByMember(matches: CheckrCandidateMatch[]): Map<string, CheckrCandidateMatch[]> {
  const byMember = new Map<string, CheckrCandidateMatch[]>();
  for (const match of matches) {
    const list = byMember.get(match.member.memberId) ?? [];
    list.push(match);
    byMember.set(match.member.memberId, list);
  }
  return byMember;
}

/** A member can have several Checkr candidates (re-checks): use their current report overall. */
function pickCurrent(
  matches: CheckrCandidateMatch[],
  reports: Map<string, CheckrReport[]>,
): { match: CheckrCandidateMatch; report: CheckrReport } | null {
  const all = matches.flatMap((match) => (reports.get(match.candidate.id) ?? []).map((report) => ({ match, report })));
  const current = currentCheckrReport(all.map((entry) => entry.report));
  return current ? (all.find((entry) => entry.report === current) ?? null) : null;
}

function describeReport({
  candidate,
  report,
  matchedByName,
}: {
  candidate: CheckrCandidate;
  report: CheckrReport;
  matchedByName: boolean;
}): string {
  const parts = [
    `Synced from Checkr: report ${report.id}${report.package ? ` (${report.package})` : ''} is ${report.status}`,
    report.result ? `result ${report.result}` : null,
    report.adjudication ? `adjudication ${report.adjudication}` : null,
    report.completed_at ? `completed ${report.completed_at.slice(0, 10)}` : null,
  ].filter(Boolean);
  const note = matchedByName ? ' Linked to this person by name; check it is the right candidate.' : '';
  return `${parts.join(', ')}. ${checkrCandidateUrl(candidate.id)}${note}`;
}
