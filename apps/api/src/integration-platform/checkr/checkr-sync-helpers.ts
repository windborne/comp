import { db } from '@db';
import {
  checkrCandidateUrl,
  currentCheckrReport,
  type CheckrCandidate,
  type CheckrReport,
} from '@trycompai/integration-platform';
import type { CheckrCandidateMatch, MatchableMember } from './checkr-candidate-matcher';

export async function loadMembersWithBackgroundChecks(organizationId: string) {
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

export type MemberWithBackgroundCheck = Awaited<
  ReturnType<typeof loadMembersWithBackgroundChecks>
>[number];

export function toMatchable(member: MemberWithBackgroundCheck): MatchableMember {
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

export function groupByMember(
  matches: CheckrCandidateMatch[],
): Map<string, CheckrCandidateMatch[]> {
  const byMember = new Map<string, CheckrCandidateMatch[]>();
  for (const match of matches) {
    const list = byMember.get(match.member.memberId) ?? [];
    list.push(match);
    byMember.set(match.member.memberId, list);
  }
  return byMember;
}

/** A member can have several Checkr candidates (re-checks): use their current report overall. */
export function pickCurrent(
  matches: CheckrCandidateMatch[],
  reports: Map<string, CheckrReport[]>,
): { match: CheckrCandidateMatch; report: CheckrReport } | null {
  const all = matches.flatMap((match) =>
    (reports.get(match.candidate.id) ?? []).map((report) => ({ match, report })),
  );
  const current = currentCheckrReport(all.map((entry) => entry.report));
  return current ? (all.find((entry) => entry.report === current) ?? null) : null;
}

/** Notes shown on the People page: no result/adjudication detail (auditors can read it). */
export function describeReport({
  candidate,
  report,
}: {
  candidate: CheckrCandidate;
  report: CheckrReport;
}): string {
  const parts = [
    `Synced from Checkr: report ${report.id}${report.package ? ` (${report.package})` : ''} is ${report.status}`,
    report.completed_at ? `completed ${report.completed_at.slice(0, 10)}` : null,
  ].filter(Boolean);
  return `${parts.join(', ')}. ${checkrCandidateUrl(candidate.id)}`;
}
