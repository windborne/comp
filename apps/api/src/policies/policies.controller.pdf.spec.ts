import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { db } from '@db';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { ActingUserResolver } from '../auth/acting-user.service';
import { PoliciesController } from './policies.controller';
import { PoliciesService } from './policies.service';

// The PDF routes must use the shared client from app/s3 (which carries
// APP_AWS_ENDPOINT + credentials), not a bare S3Client — a bare client ignores
// a self-hosted MinIO endpoint and every upload/view fails with a 500.
const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();
const mockS3Module: { s3Client: { send: jest.Mock } | null; BUCKET_NAME: string | undefined } = {
  s3Client: { send: mockSend },
  BUCKET_NAME: 'app-bucket',
};
jest.mock('../app/s3', () => ({
  get s3Client() {
    return mockS3Module.s3Client;
  },
  get BUCKET_NAME() {
    return mockS3Module.BUCKET_NAME;
  },
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({
  statement: { policy: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));
jest.mock('@db', () => ({
  db: {
    policy: { findFirst: jest.fn(), update: jest.fn() },
    policyVersion: { findFirst: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
  Frequency: { yearly: 'yearly' },
  PolicyStatus: { draft: 'draft', published: 'published' },
  BackgroundCheckStatus: { completed: 'completed', completed_with_flags: 'completed_with_flags' },
  FindingType: {},
  FindingStatus: {},
  PhaseCompletionType: {},
  TimelinePhaseStatus: {},
  TimelineStatus: {},
}));
jest.mock('@trigger.dev/sdk', () => ({
  auth: { createPublicToken: jest.fn() },
  tasks: { trigger: jest.fn() },
}));
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }));
jest.mock('ai', () => ({ streamText: jest.fn(), convertToModelMessages: jest.fn() }));

const mockDb = db as unknown as {
  policy: { findFirst: jest.Mock; update: jest.Mock };
  policyVersion: { findFirst: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};

describe('PoliciesController PDF storage', () => {
  let controller: PoliciesController;
  const orgId = 'org_123';

  beforeEach(async () => {
    const guard = { canActivate: jest.fn().mockReturnValue(true) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PoliciesController],
      providers: [
        { provide: PoliciesService, useValue: {} },
        { provide: ActingUserResolver, useValue: { resolve: jest.fn() } },
      ],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue(guard)
      .overrideGuard(PermissionGuard)
      .useValue(guard)
      .compile();

    controller = module.get(PoliciesController);
    jest.clearAllMocks();
    mockS3Module.s3Client = { send: mockSend };
    mockS3Module.BUCKET_NAME = 'app-bucket';
    mockDb.$transaction.mockResolvedValue([]);
  });

  describe('uploadPolicyPdf', () => {
    const body = {
      versionId: 'pv_1',
      fileName: 'policy.pdf',
      fileType: 'application/pdf',
      fileData: Buffer.from('%PDF-1.4').toString('base64'),
    };

    it('stores the file through the shared S3 client and bucket', async () => {
      mockDb.policy.findFirst.mockResolvedValue({
        id: 'pol_1',
        status: 'draft',
        pdfUrl: null,
        currentVersionId: 'pv_1',
        pendingVersionId: null,
      });
      mockDb.policyVersion.findFirst.mockResolvedValue({ id: 'pv_1', pdfUrl: null, version: 1 });

      const result = await controller.uploadPolicyPdf('pol_1', undefined, body, orgId);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const put = mockSend.mock.calls[0][0];
      expect(put.input.Bucket).toBe('app-bucket');
      expect(put.input.Key).toMatch(/^org_123\/policies\/pol_1\/v1-\d+-policy\.pdf$/);
      expect(result).toEqual({ data: { s3Key: put.input.Key } });
    });

    it('rejects when file storage is not configured', async () => {
      mockS3Module.s3Client = null;

      await expect(controller.uploadPolicyPdf('pol_1', undefined, body, orgId)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('deletePolicyPdf', () => {
    it('rejects when file storage is not configured', async () => {
      mockS3Module.BUCKET_NAME = undefined;

      await expect(controller.deletePolicyPdf('pol_1', orgId)).rejects.toThrow(BadRequestException);
      expect(mockDb.policy.findFirst).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['getPdfSignedUrl' as const],
    ['getPdfUrl' as const],
  ])('%s', (method) => {
    it('signs with the shared S3 client', async () => {
      mockDb.policy.findFirst.mockResolvedValue({ pdfUrl: 'org_123/policies/pol_1/v1.pdf' });
      mockGetSignedUrl.mockResolvedValue('https://minio.example/signed');

      const result = await controller[method]('pol_1', orgId);

      expect(result).toEqual({ url: 'https://minio.example/signed' });
      const [client, command] = mockGetSignedUrl.mock.calls[0];
      expect(client).toBe(mockS3Module.s3Client);
      expect(command.input).toMatchObject({
        Bucket: 'app-bucket',
        Key: 'org_123/policies/pol_1/v1.pdf',
      });
    });

    it('returns no URL when file storage is not configured', async () => {
      mockDb.policy.findFirst.mockResolvedValue({ pdfUrl: 'org_123/policies/pol_1/v1.pdf' });
      mockS3Module.s3Client = null;

      await expect(controller[method]('pol_1', orgId)).resolves.toEqual({ url: null });
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });
  });
});
