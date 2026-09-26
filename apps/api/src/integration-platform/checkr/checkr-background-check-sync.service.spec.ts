import { db } from '@db';
import type { CheckrCandidate, CheckrReport } from '@trycompai/integration-platform';
import type { AttachmentsService } from '../../attachments/attachments.service';
import type { CredentialVaultService } from '../services/credential-vault.service';
import { createCheckrGet } from './checkr-api';
import { CheckrBackgroundCheckSyncService } from './checkr-background-check-sync.service';

jest.mock('@db', () => ({
  db: {
    integrationConnection: { findFirst: jest.fn(), update: jest.fn() },
    member: { findMany: jest.fn() },
    backgroundCheckRequest: { update: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
    attachment: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() },
  },
  AttachmentEntityType: { background_check: 'background_check' },
}));
jest.mock('./checkr-api', () => ({ createCheckrGet: jest.fn() }));

const mockDb = db as unknown as {
  integrationConnection: { findFirst: jest.Mock; update: jest.Mock };
  member: { findMany: jest.Mock };
  backgroundCheckRequest: { update: jest.Mock; create: jest.Mock; findUniqueOrThrow: jest.Mock };
  attachment: { findFirst: jest.Mock };
  auditLog: { create: jest.Mock };
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
const member = (id: string, records: Record_[] = [], deactivated = false, name: string | null = null) => ({
  id,
  deactivated,
  user: { email: `${id}@windborne.test`, name },
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
  credentials = { api_key: 'sk' },
}: {
  members: ReturnType<typeof member>[];
  candidates: CheckrCandidate[];
  reports: Record<string, CheckrReport>;
  credentials?: Record<string, string>;
}) {
  mockDb.integrationConnection.findFirst.mockResolvedValue({
    id: 'icn_1',
    metadata: { disabledChecks: ['x'] },
    organization: { name: 'WindBorne' },
  });
  mockDb.member.findMany.mockResolvedValue(members);
  mockDb.backgroundCheckRequest.findUniqueOrThrow.mockResolvedValue({ id: 'bcr_new' });
  mockDb.attachment.findFirst.mockResolvedValue(null);
  (createCheckrGet as jest.Mock).mockReturnValue(async (path: string) => {
    if (path.startsWith('/v1/candidates')) return { data: candidates, next_href: null };
    return reports[path.split('/').pop() ?? ''];
  });
  const attachments = { uploadAttachment: jest.fn().mockResolvedValue({}) };
  const vault = { getDecryptedCredentials: jest.fn().mockResolvedValue(credentials) };
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
      undefined, // scheduler run: no acting user
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
    // Counts and ids only: never-hired applicants' names stay out of the response.
    expect(summary.unmatched).toEqual({ count: 1, candidateIds: ['c_unknown'] });
  });

  it('never writes a name-only match, even over a linked record', async () => {
    const { service } = setup({
      members: [
        member('alex', [record({ externalProvider: 'checkr', externalCandidateId: 'c_alex', externalReportId: 'r_alex' })], false, 'Alex Kim'),
      ],
      candidates: [
        { id: 'c_alex', report_ids: ['r_alex'] },
        { id: 'c_other_alex', first_name: 'Alex', last_name: 'Kim', email: 'applicant@gmail.test', report_ids: ['r_new'] },
      ],
      reports: {
        r_alex: report({ id: 'r_alex' }),
        r_new: report({ id: 'r_new', created_at: '2026-09-01T00:00:00Z', completed_at: '2026-09-02T00:00:00Z', result: 'consider' }),
      },
    });

    const summary = await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(mockDb.backgroundCheckRequest.update).not.toHaveBeenCalled();
    expect(summary.needsConfirmation).toEqual({ count: 1, candidateIds: ['c_other_alex'] });
    expect(summary.unchanged).toBe(1);
  });

  it('writes nothing for a staging (test mode) connection', async () => {
    const { service, attachments } = setup({
      members: [member('new')],
      candidates: [{ id: 'cand_1', email: 'new@windborne.test', report_ids: ['rep_1'] }],
      reports: { rep_1: report({}) },
      credentials: { api_key: 'sk_test', environment: 'staging' },
    });

    const summary = await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(summary).toMatchObject({ testMode: true, matched: 1, created: 0 });
    expect(mockDb.backgroundCheckRequest.create).not.toHaveBeenCalled();
    expect(mockDb.integrationConnection.update).not.toHaveBeenCalled();
    expect(attachments.uploadAttachment).not.toHaveBeenCalled();
  });

  it('records linked candidates of active members on the connection, keeping other metadata', async () => {
    const { service } = setup({
      members: [member('active'), member('former', [], true)],
      candidates: [
        { id: 'c_active', email: 'active@windborne.test', report_ids: ['r1'] },
        { id: 'c_former', email: 'former@windborne.test', report_ids: ['r2'] },
      ],
      reports: { r1: report({ id: 'r1' }), r2: report({ id: 'r2' }) },
    });

    await service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });

    expect(mockDb.integrationConnection.update).toHaveBeenCalledWith({
      where: { id: 'icn_1' },
      data: {
        metadata: {
          disabledChecks: ['x'],
          checkr: { linkedCandidateIds: ['c_active'], syncedAt: expect.any(String) },
        },
      },
    });
  });

  it('writes a per-member audit row for a person-run sync, and none for the scheduler', async () => {
    const setupArgs = {
      members: [member('new')],
      candidates: [{ id: 'cand_1', email: 'new@windborne.test', report_ids: ['rep_1'] }],
      reports: { rep_1: report({}) },
    };
    const { service } = setup(setupArgs);
    await service.sync({ organizationId: 'org_1', connectionId: 'icn_1', actor: { userId: 'usr_1', memberId: 'mem_admin' } });
    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        userId: 'usr_1',
        memberId: 'mem_admin',
        entityType: 'people',
        entityId: 'new',
        description: 'synced background check from Checkr: none to completed',
      }),
    });

    jest.clearAllMocks();
    const { service: scheduled } = setup(setupArgs);
    await scheduled.sync({ organizationId: 'org_1', connectionId: 'icn_1' });
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuses a second sync of the same connection while one is running', async () => {
    const { service } = setup({ members: [], candidates: [], reports: {} });
    const first = service.sync({ organizationId: 'org_1', connectionId: 'icn_1' });
    await expect(service.sync({ organizationId: 'org_1', connectionId: 'icn_1' })).rejects.toThrow(
      'already running',
    );
    await first;
    await expect(service.sync({ organizationId: 'org_1', connectionId: 'icn_1' })).resolves.toMatchObject({ success: true });
  });
});
