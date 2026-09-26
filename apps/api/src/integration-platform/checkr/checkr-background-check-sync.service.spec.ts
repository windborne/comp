import { db } from '@db';
import type { CheckrCandidate, CheckrReport } from '@trycompai/integration-platform';
import type { AttachmentsService } from '../../attachments/attachments.service';
import type { CredentialVaultService } from '../services/credential-vault.service';
import { createCheckrGet } from './checkr-api';
import { CheckrBackgroundCheckSyncService } from './checkr-background-check-sync.service';

jest.mock('@db', () => ({
  db: {
    integrationConnection: { findFirst: jest.fn() },
    member: { findMany: jest.fn() },
    backgroundCheckRequest: { update: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
    attachment: { findFirst: jest.fn() },
  },
  AttachmentEntityType: { background_check: 'background_check' },
}));
jest.mock('./checkr-api', () => ({ createCheckrGet: jest.fn() }));

const mockDb = db as unknown as {
  integrationConnection: { findFirst: jest.Mock };
  member: { findMany: jest.Mock };
  backgroundCheckRequest: { update: jest.Mock; create: jest.Mock; findUniqueOrThrow: jest.Mock };
  attachment: { findFirst: jest.Mock };
};

type Record_ = {
  id: string;
  status: string;
  employeeEmail: string;
  requesterNotes: string | null;
  identityBackgroundCheckId: string | null;
  externalProvider: string | null;
  externalCandidateId: string | null;
  externalReportId: string | null;
};
const record = (overrides: Partial<Record_>): Record_ => ({
  id: 'bcr_1',
  status: 'completed',
  employeeEmail: 'ada@gmail.test',
  requesterNotes: null,
  identityBackgroundCheckId: null,
  externalProvider: null,
  externalCandidateId: null,
  externalReportId: null,
  ...overrides,
});
const member = (id: string, records: Record_[] = [], deactivated = false) => ({
  id,
  deactivated,
  user: { email: `${id}@windborne.test`, name: null },
  backgroundCheckRequests: records,
});
const report = (overrides: Partial<CheckrReport>): CheckrReport => ({
  id: 'rep_1',
  status: 'complete',
  result: 'clear',
  created_at: '2026-06-01T00:00:00Z',
  completed_at: '2026-06-03T00:00:00Z',
  ...overrides,
});

function setup({
  members,
  candidates,
  reports,
}: {
  members: ReturnType<typeof member>[];
  candidates: CheckrCandidate[];
  reports: Record<string, CheckrReport>;
}) {
  mockDb.integrationConnection.findFirst.mockResolvedValue({ id: 'icn_1', organization: { name: 'WindBorne' } });
  mockDb.member.findMany.mockResolvedValue(members);
  mockDb.backgroundCheckRequest.findUniqueOrThrow.mockResolvedValue({ id: 'bcr_new' });
  mockDb.attachment.findFirst.mockResolvedValue(null);
  (createCheckrGet as jest.Mock).mockReturnValue(async (path: string) => {
    if (path.startsWith('/v1/candidates')) return { data: candidates, next_href: null };
    return reports[path.split('/').pop() ?? ''];
  });
  const attachments = { uploadAttachment: jest.fn().mockResolvedValue({}) };
  const vault = { getDecryptedCredentials: jest.fn().mockResolvedValue({ api_key: 'sk' }) };
  const service = new CheckrBackgroundCheckSyncService(
    vault as unknown as CredentialVaultService,
    attachments as unknown as AttachmentsService,
  );
  return { service, attachments };
}

describe('CheckrBackgroundCheckSyncService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a record for a new hire matched by email and attaches a summary PDF', async () => {
    const { service, attachments } = setup({
      members: [member('new')],
      candidates: [{ id: 'cand_1', email: 'new@windborne.test', first_name: 'New', last_name: 'Hire', report_ids: ['rep_1'] }],
      reports: { rep_1: report({}) },
    });

    const summary = await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(mockDb.backgroundCheckRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        memberId: 'new',
        status: 'completed',
        externalProvider: 'checkr',
        externalCandidateId: 'cand_1',
        externalReportId: 'rep_1',
        employeeName: 'New Hire',
      }),
    });
    expect(attachments.uploadAttachment).toHaveBeenCalledWith(
      'org_1',
      'bcr_new',
      'background_check',
      expect.objectContaining({ fileName: 'checkr-rep_1-completed.pdf', fileType: 'application/pdf' }),
    );
    expect(summary).toMatchObject({ created: 1, reportsAttached: 1, matched: 1 });
  });

  it('takes over a Drata-imported record linked by its Checkr case id', async () => {
    const { service } = setup({
      members: [member('m1', [record({ requesterNotes: 'Imported from Drata. Checkr case cand_1 completed 2026-06-03' })])],
      candidates: [{ id: 'cand_1', email: 'someone@gmail.test', report_ids: ['rep_1'] }],
      reports: { rep_1: report({ result: 'consider' }) },
    });

    const summary = await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(mockDb.backgroundCheckRequest.update).toHaveBeenCalledWith({
      where: { id: 'bcr_1' },
      data: expect.objectContaining({ status: 'completed_with_flags', externalCandidateId: 'cand_1' }),
    });
    expect(summary.updated).toBe(1);
  });

  it('never touches Comp-run or manually uploaded checks', async () => {
    const { service } = setup({
      members: [
        member('vendor', [record({ id: 'bcr_v', identityBackgroundCheckId: 'idv_1' })]),
        member('manual', [record({ id: 'bcr_m', requesterNotes: 'Uploaded by HR' })]),
      ],
      candidates: [
        { id: 'c1', email: 'vendor@windborne.test', report_ids: ['r1'] },
        { id: 'c2', email: 'manual@windborne.test', report_ids: ['r2'] },
      ],
      reports: { r1: report({ id: 'r1' }), r2: report({ id: 'r2' }) },
    });

    const summary = await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(mockDb.backgroundCheckRequest.update).not.toHaveBeenCalled();
    expect(mockDb.backgroundCheckRequest.create).not.toHaveBeenCalled();
    expect(summary.skipped).toEqual({ 'check run through Comp': 1, 'manually managed record': 1 });
  });

  it('leaves unchanged reports alone and never lets a cancelled re-run undo a completed check', async () => {
    const { service } = setup({
      members: [
        member('same', [record({ externalProvider: 'checkr', externalCandidateId: 'c1', externalReportId: 'r1' })]),
        member('rerun', [record({ id: 'bcr_r', externalProvider: 'checkr', externalCandidateId: 'c2', externalReportId: 'r_old' })]),
      ],
      candidates: [
        { id: 'c1', report_ids: ['r1'] },
        { id: 'c2', report_ids: ['r2'] },
      ],
      reports: { r1: report({ id: 'r1' }), r2: report({ id: 'r2', status: 'canceled', result: null }) },
    });

    const summary = await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(mockDb.backgroundCheckRequest.update).not.toHaveBeenCalled();
    expect(summary.unchanged).toBe(2);
  });

  it('counts active members still without a completed check and lists unmatched candidates', async () => {
    const { service } = setup({
      members: [member('checked', [record({})]), member('missing'), member('former', [], true)],
      candidates: [{ id: 'c_unknown', first_name: 'Nobody', email: 'x@gmail.test' }],
      reports: {},
    });

    const summary = await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(summary.activeMembersWithoutCompletedCheck).toBe(1);
    expect(summary.unmatched).toEqual([{ candidateId: 'c_unknown', name: 'Nobody' }]);
  });
});
