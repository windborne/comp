import {
  checkrCandidateName,
  type CheckrCandidate,
} from '@trycompai/integration-platform';

export interface MatchableMember {
  memberId: string;
  email: string;
  name: string | null;
  /** The member's existing background-check record, if any. */
  record: {
    employeeEmail: string;
    externalCandidateId: string | null;
    requesterNotes: string | null;
  } | null;
}

export type CheckrMatchMethod = 'linked' | 'drata' | 'email' | 'name';

export interface CheckrCandidateMatch {
  candidate: CheckrCandidate;
  member: MatchableMember;
  method: CheckrMatchMethod;
}

const norm = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();
const normName = (value: string | null | undefined): string =>
  norm(value).replace(/[^a-z]+/g, ' ').trim();

/**
 * Link Checkr candidates to Comp members. Checkr usually holds the personal
 * email a candidate used, so beyond a stored link it also uses the Checkr
 * candidate id recorded by the Drata import ("Checkr case <id>"), the personal
 * email already on the member's record, Checkr's custom_id, and finally an
 * exact name that belongs to exactly one member.
 */
export function matchCheckrCandidates({
  candidates,
  members,
}: {
  candidates: CheckrCandidate[];
  members: MatchableMember[];
}): { matches: CheckrCandidateMatch[]; unmatched: CheckrCandidate[] } {
  const byLinkedId = new Map<string, MatchableMember>();
  const byEmail = new Map<string, MatchableMember>();
  const byName = new Map<string, MatchableMember | null>();
  for (const member of members) {
    if (member.record?.externalCandidateId) {
      byLinkedId.set(member.record.externalCandidateId, member);
    }
    for (const email of [member.email, member.record?.employeeEmail]) {
      if (norm(email)) byEmail.set(norm(email), member);
    }
    const name = normName(member.name);
    if (name) byName.set(name, byName.has(name) ? null : member); // null = ambiguous
  }

  const matches: CheckrCandidateMatch[] = [];
  const unmatched: CheckrCandidate[] = [];
  for (const candidate of candidates) {
    const drataTag = `Checkr case ${candidate.id}`;
    const found =
      pick(byLinkedId.get(candidate.id), 'linked') ??
      pick(members.find((m) => m.record?.requesterNotes?.includes(drataTag)), 'drata') ??
      pick(byEmail.get(norm(candidate.email)) ?? byEmail.get(norm(candidate.custom_id)), 'email') ??
      pick(byName.get(normName(checkrCandidateName(candidate))) ?? undefined, 'name');
    if (found) matches.push({ candidate, ...found });
    else unmatched.push(candidate);
  }
  return { matches, unmatched };
}

function pick(
  member: MatchableMember | undefined,
  method: CheckrMatchMethod,
): { member: MatchableMember; method: CheckrMatchMethod } | null {
  return member ? { member, method } : null;
}
