import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { db } from '@db';
import type { AuthContext } from '../auth/types';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { PERMISSIONS_KEY } from '../auth/permission.guard';
import { DeactivateMemberDto } from './dto/deactivate-member.dto';
import { PeopleDeactivateController } from './people-deactivate.controller';
import { PeopleDeactivateService } from './people-deactivate.service';
import { PeopleService } from './people.service';

jest.mock('@db', () => ({
  db: { member: { findFirst: jest.fn(), findFirstOrThrow: jest.fn() } },
  // Enums read at import time by modules PeopleService pulls in.
  BackgroundCheckStatus: { completed: 'completed', completed_with_flags: 'completed_with_flags' },
  FindingType: {},
  FindingStatus: {},
  PhaseCompletionType: {},
  TimelinePhaseStatus: {},
  TimelineStatus: {},
  Departments: {},
}));
jest.mock('../auth/auth.server', () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock('@trycompai/auth', () => ({
  statement: { member: ['create', 'read', 'update', 'delete'] },
  BUILT_IN_ROLE_PERMISSIONS: {},
}));

const mockDb = db as unknown as {
  member: { findFirst: jest.Mock; findFirstOrThrow: jest.Mock };
};

describe('PeopleDeactivateService', () => {
  const peopleService = { deleteById: jest.fn() };
  const service = new PeopleDeactivateService(
    peopleService as unknown as PeopleService,
  );
  const deactivatedMember = { id: 'mem_1', deactivated: true, isActive: false };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.member.findFirst.mockResolvedValue({ deactivated: false });
    mockDb.member.findFirstOrThrow.mockResolvedValue(deactivatedMember);
    peopleService.deleteById.mockResolvedValue({ success: true });
  });

  it('deactivates through deleteById with the given offboard date and returns the member', async () => {
    const result = await service.deactivate({
      memberId: 'mem_1',
      organizationId: 'org_1',
      callerUserId: 'usr_actor',
      offboardDate: '2026-09-10',
    });

    expect(peopleService.deleteById).toHaveBeenCalledWith('mem_1', 'org_1', 'usr_actor', {
      skipOffboarding: undefined,
      offboardDate: new Date('2026-09-10'),
    });
    expect(result).toBe(deactivatedMember);
  });

  it('leaves the offboard date to deleteById when none is given', async () => {
    await service.deactivate({ memberId: 'mem_1', organizationId: 'org_1' });

    expect(peopleService.deleteById).toHaveBeenCalledWith('mem_1', 'org_1', undefined, {
      skipOffboarding: undefined,
      offboardDate: undefined,
    });
  });

  it('rejects a member who is already deactivated', async () => {
    mockDb.member.findFirst.mockResolvedValue({ deactivated: true });

    await expect(
      service.deactivate({ memberId: 'mem_1', organizationId: 'org_1' }),
    ).rejects.toThrow(BadRequestException);
    expect(peopleService.deleteById).not.toHaveBeenCalled();
  });

  it('rejects a member from another organization', async () => {
    mockDb.member.findFirst.mockResolvedValue(null);

    await expect(
      service.deactivate({ memberId: 'mem_1', organizationId: 'org_1' }),
    ).rejects.toThrow(NotFoundException);
    expect(mockDb.member.findFirst).toHaveBeenCalledWith({
      where: { id: 'mem_1', organizationId: 'org_1' },
      select: { deactivated: true },
    });
  });

  it('rejects an offboard date combined with skipOffboarding', async () => {
    await expect(
      service.deactivate({
        memberId: 'mem_1',
        organizationId: 'org_1',
        offboardDate: '2026-09-10',
        skipOffboarding: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(peopleService.deleteById).not.toHaveBeenCalled();
  });
});

describe('PeopleDeactivateController', () => {
  const deactivateService = { deactivate: jest.fn() };
  const authContext = { userId: 'usr_actor', organizationId: 'org_1' } as AuthContext;
  let controller: PeopleDeactivateController;

  beforeEach(async () => {
    const guard = { canActivate: jest.fn().mockReturnValue(true) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PeopleDeactivateController],
      providers: [{ provide: PeopleDeactivateService, useValue: deactivateService }],
    })
      .overrideGuard(HybridAuthGuard)
      .useValue(guard)
      .overrideGuard(PermissionGuard)
      .useValue(guard)
      .compile();
    controller = module.get(PeopleDeactivateController);
    jest.clearAllMocks();
  });

  it('passes the caller and body through to the service', async () => {
    deactivateService.deactivate.mockResolvedValue({ id: 'mem_1' });

    await controller.deactivateMember(
      'mem_1',
      { offboardDate: '2026-09-10' },
      'org_1',
      authContext,
    );

    expect(deactivateService.deactivate).toHaveBeenCalledWith({
      memberId: 'mem_1',
      organizationId: 'org_1',
      callerUserId: 'usr_actor',
      offboardDate: '2026-09-10',
      skipOffboarding: undefined,
    });
  });

  it('requires member:delete, the same permission as DELETE /v1/people/:id', () => {
    const permissions = new Reflector().get(
      PERMISSIONS_KEY,
      PeopleDeactivateController.prototype.deactivateMember,
    );
    expect(permissions).toEqual([{ resource: 'member', actions: ['delete'] }]);
  });
});

describe('DeactivateMemberDto', () => {
  const errorsFor = (body: object) =>
    validate(plainToInstance(DeactivateMemberDto, body));

  it('accepts an empty body and an ISO date', async () => {
    expect(await errorsFor({})).toHaveLength(0);
    expect(await errorsFor({ offboardDate: '2026-09-10' })).toHaveLength(0);
  });

  it('rejects a malformed date', async () => {
    expect(await errorsFor({ offboardDate: 'last Tuesday' })).not.toHaveLength(0);
  });
});
