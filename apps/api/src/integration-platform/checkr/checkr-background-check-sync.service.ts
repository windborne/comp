import { AttachmentEntityType, BackgroundCheckStatus, db, type Prisma } from '@db';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  checkrCandidateName,
  checkrEnvironment,
  CHECKR_METADATA_KEY,
  compStatusForCheckrReport,
  listCheckrCandidates,
  loadCheckrReports,
  type CheckrConnectionMetadata,
  type CheckrReport,
} from '@trycompai/integration-platform';
import { AttachmentsService } from '../../attachments/attachments.service';
import { CredentialVaultService } from '../services/credential-vault.service';
import { createCheckrGet } from './checkr-api';
import { matchCheckrCandidates, type CheckrCandidateMatch } from './checkr-candidate-matcher';
import { buildCheckrReportPdf } from './checkr-report-pdf';
import {
  describeReport,
  groupByMember,
  loadMembersWithBackgroundChecks,
  pickCurrent,
  toMatchable,
  type MemberWithBackgroundCheck,
} from './checkr-sync-helpers';

export const CHECKR_PROVIDER = 'checkr';
const DRATA_IMPORT_TAG = 'Imported from Drata';
const COMPLETE: BackgroundCheckStatus[] = ['completed', 'completed_with_flags'];
const MAX_LISTED_IDS = 50;

/** Who ran the sync, for per-member audit rows (null for the daily scheduler). */
export type CheckrSyncActor = { userId: string; memberId: string | null } | null;

export interface CheckrSyncSummary {
  success: true;
  /** Staging (test-mode) key: matched only, nothing written. */
  testMode: boolean;
  candidates: number;
  matched: number;
  created: number;
  updated: number;
  unchanged: number;
  reportsAttached: number;
  skipped: Record<string, number>;
  /** Linked by name only: never written. Set the candidate's custom_id in Checkr to their work email. */
  needsConfirmation: { count: number; candidateIds: string[] };
  unmatched: { count: number; candidateIds: string[] };
  activeMembersWithoutCompletedCheck: number;
}

type Current = { match: CheckrCandidateMatch; report: CheckrReport };

@Injectable()
export class CheckrBackgroundCheckSyncService {
  private readonly logger = new Logger(CheckrBackgroundCheckSyncService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly credentialVault: CredentialVaultService,
    private readonly attachments: AttachmentsService,
  ) {}

  /** Bring every linked member's background-check record in line with Checkr. */
  async sync({
    organizationId,
    connectionId,
    actor = null,
  }: {
    organizationId: string;
    connectionId: string;
    actor?: CheckrSyncActor;
  }): Promise<CheckrSyncSummary> {
    if (this.running.has(connectionId)) {
      throw new ConflictException('A Checkr sync is already running for this connection');
    }
    this.running.add(connectionId);
    try {
      return await this.run({ organizationId, connectionId, actor });
    } finally {
      this.running.delete(connectionId);
    }
  }

  private async run({
    organizationId,
    connectionId,
    actor,
  }: {
    organizationId: string;
    connectionId: string;
    actor: CheckrSyncActor;
  }): Promise<CheckrSyncSummary> {
    const connection = await db.integrationConnection.findFirst({
      where: { id: connectionId, organizationId, provider: { slug: CHECKR_PROVIDER } },
      select: { id: true, metadata: true, organization: { select: { name: true } } },
    });
    if (!connection) throw new NotFoundException('Checkr connection not found');

    const credentials = await this.credentialVault.getDecryptedCredentials(connectionId);
    const testMode = checkrEnvironment(credentials?.environment) === 'staging';
    const get = createCheckrGet(credentials);
    const candidates = await listCheckrCandidates(get);
    const members = await loadMembersWithBackgroundChecks(organizationId);
    const { matches, unmatched } = matchCheckrCandidates({ candidates, members: members.map(toMatchable) });
    // A name-only match could be a different person with the same name: never write it.
    const nameOnly = matches.filter((m) => m.method === 'name');
    const byMember = groupByMember(matches.filter((m) => m.method !== 'name'));

    const summary: CheckrSyncSummary = {
      success: true,
      testMode,
      candidates: candidates.length,
      matched: byMember.size,
      created: 0,
      updated: 0,
      unchanged: 0,
      reportsAttached: 0,
      skipped: {},
      needsConfirmation: listed(nameOnly.map((m) => m.candidate.id)),
      unmatched: listed(unmatched.map((c) => c.id)),
      activeMembersWithoutCompletedCheck: 0,
    };
    if (testMode) return summary; // Test data must never look like real evidence.

    const reports = await loadCheckrReports({
      get,
      candidates: [...byMember.values()].flat().map((m) => m.candidate),
      onError: (reportId, error) => this.logger.warn(`Could not read Checkr report ${reportId}: ${String(error)}`),
    });
    const skip = (reason: string) => (summary.skipped[reason] = (summary.skipped[reason] ?? 0) + 1);
    const membersById = new Map(members.map((m) => [m.id, m]));
    const linkedCandidateIds: string[] = [];

    for (const [memberId, memberMatches] of byMember) {
      const member = membersById.get(memberId);
      if (!member) continue;
      const current = pickCurrent(memberMatches, reports);
      if (!current) {
        skip('no report ordered yet');
        continue;
      }
      if (!member.deactivated) linkedCandidateIds.push(current.match.candidate.id);
      const outcome = await this.applyReport({ organizationId, member, actor, ...current });
      if (outcome === 'created' || outcome === 'updated' || outcome === 'unchanged') summary[outcome]++;
      else skip(outcome);
      if (outcome === 'created' || outcome === 'updated') {
        const attached = await this.attachSummaryIfComplete({
          organizationId,
          organizationName: connection.organization.name,
          member,
          actor,
          ...current,
        });
        if (attached) summary.reportsAttached++;
      }
    }

    await this.recordLinkedCandidates({ connectionId, metadata: connection.metadata, linkedCandidateIds });
    const refreshed = await loadMembersWithBackgroundChecks(organizationId);
    summary.activeMembersWithoutCompletedCheck = refreshed.filter(
      (m) => !m.deactivated && !m.backgroundCheckRequests.some((r) => COMPLETE.includes(r.status)),
    ).length;
    return summary;
  }

  private async applyReport({
    organizationId,
    member,
    actor,
    match,
    report,
  }: Current & {
    organizationId: string;
    member: MemberWithBackgroundCheck;
    actor: CheckrSyncActor;
  }): Promise<string> {
    const existing = member.backgroundCheckRequests[0] ?? null;
    if (existing?.identityBackgroundCheckId) return 'check run through Comp';
    const managed =
      existing?.externalProvider === CHECKR_PROVIDER || existing?.requesterNotes?.startsWith(DRATA_IMPORT_TAG);
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
      requesterNotes: describeReport({ candidate, report }),
      reportSyncedAt: new Date(report.completed_at ?? report.created_at ?? Date.now()),
      lastSyncedAt: new Date(),
    };
    if (existing) await db.backgroundCheckRequest.update({ where: { id: existing.id }, data });
    else await db.backgroundCheckRequest.create({ data: { ...data, organizationId, memberId: member.id } });

    if (actor) {
      await db.auditLog.create({
        data: {
          organizationId,
          userId: actor.userId,
          memberId: actor.memberId,
          entityType: 'people',
          entityId: member.id,
          description: `synced background check from Checkr: ${existing?.status ?? 'none'} to ${status}`,
          data: { action: 'update', field: 'backgroundCheck', source: CHECKR_PROVIDER, oldValue: existing?.status ?? null, newValue: status, reportId: report.id },
        },
      });
    }
    return existing ? 'updated' : 'created';
  }

  /** Attach a summary PDF once per report + status; the People page shows it as the report. */
  private async attachSummaryIfComplete({
    organizationId,
    organizationName,
    member,
    actor,
    match,
    report,
  }: Current & {
    organizationId: string;
    organizationName: string;
    member: MemberWithBackgroundCheck;
    actor: CheckrSyncActor;
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
    await this.attachments.uploadAttachment(
      organizationId,
      record.id,
      AttachmentEntityType.background_check,
      { fileName, fileType: 'application/pdf', fileData: pdf.toString('base64') },
      actor?.userId,
    );
    return true;
  }

  /** The Checkr check reads these so it only evaluates current employees. */
  private async recordLinkedCandidates({
    connectionId,
    metadata,
    linkedCandidateIds,
  }: {
    connectionId: string;
    metadata: Prisma.JsonValue;
    linkedCandidateIds: string[];
  }): Promise<void> {
    const checkr: CheckrConnectionMetadata = { linkedCandidateIds, syncedAt: new Date().toISOString() };
    const base = typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata) ? metadata : {};
    await db.integrationConnection.update({
      where: { id: connectionId },
      data: { metadata: { ...base, [CHECKR_METADATA_KEY]: { ...checkr } } },
    });
  }
}

function listed(ids: string[]): { count: number; candidateIds: string[] } {
  return { count: ids.length, candidateIds: ids.slice(0, MAX_LISTED_IDS) };
}
