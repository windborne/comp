jest.mock('@db', () => ({ db: {} }));
jest.mock('../auth/hybrid-auth.guard', () => ({ HybridAuthGuard: class {} }));
jest.mock('../auth/permission.guard', () => ({
  PermissionGuard: class {},
  PERMISSIONS_KEY: 'permissions',
}));
jest.mock('../auth/service-token-only.guard', () => ({
  ServiceTokenOnlyGuard: class {},
}));
jest.mock('./self-hosted-scheduler.service', () => ({
  SelfHostedSchedulerService: class {},
}));

import { SchedulerController } from './scheduler.controller';
import type { SelfHostedSchedulerService } from './self-hosted-scheduler.service';

describe('SchedulerController', () => {
  const service = { listJobs: jest.fn(), runJob: jest.fn() };
  const controller = new SchedulerController(
    service as unknown as SelfHostedSchedulerService,
  );

  it('lists jobs and runs one by id', async () => {
    service.listJobs.mockReturnValue({ mode: 'self-hosted', jobs: [] });
    service.runJob.mockResolvedValue({ status: 'completed' });

    expect(controller.listJobs()).toEqual({ mode: 'self-hosted', jobs: [] });
    await expect(controller.runJob('employee-sync')).resolves.toEqual({
      status: 'completed',
    });
    expect(service.runJob).toHaveBeenCalledWith('employee-sync');
  });
});
