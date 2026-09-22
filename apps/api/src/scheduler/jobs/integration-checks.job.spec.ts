jest.mock('@db', () => ({
  db: { task: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock('../../integration-platform/scheduling/due-tasks', () => ({
  discoverDueIntegrationTasks: jest.fn(),
}));
jest.mock('../../integration-platform/scheduling/failure-emails', () => ({
  sendBundledFailureEmails: jest.fn(),
}));
jest.mock('../../integration-platform/scheduling/sync-targets', () => ({
  findDeviceSyncTargets: jest.fn(),
}));
jest.mock('../loopback-client', () => ({
  runCheckForTask: jest.fn(),
  syncDevices: jest.fn(),
}));

import { db } from '@db';
import { discoverDueIntegrationTasks } from '../../integration-platform/scheduling/due-tasks';
import { sendBundledFailureEmails } from '../../integration-platform/scheduling/failure-emails';
import { findDeviceSyncTargets } from '../../integration-platform/scheduling/sync-targets';
import { runCheckForTask, syncDevices } from '../loopback-client';
import {
  combineTaskStatus,
  runIntegrationChecksJob,
} from './integration-checks.job';

const mockedDb = db as unknown as {
  task: { findUnique: jest.Mock; update: jest.Mock };
};
const discoverMock = discoverDueIntegrationTasks as jest.Mock;
const emailMock = sendBundledFailureEmails as jest.Mock;
const deviceTargetsMock = findDeviceSyncTargets as jest.Mock;
const runCheckMock = runCheckForTask as jest.Mock;
const syncDevicesMock = syncDevices as jest.Mock;
const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

const task = {
  taskId: 'tsk_1',
  taskTitle: '2FA',
  connectionId: 'conn_1',
  providerSlug: 'google-workspace',
  checkIds: ['two-factor-auth'],
};

describe('combineTaskStatus', () => {
  it('fails when any check failed, is done only when all are done, else pending', () => {
    expect(combineTaskStatus(['done', 'failed'])).toBe('failed');
    expect(combineTaskStatus(['done', 'done'])).toBe('done');
    expect(combineTaskStatus(['done', null])).toBeNull();
    expect(combineTaskStatus([])).toBeNull();
  });
});

describe('runIntegrationChecksJob', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    discoverMock.mockResolvedValue({
      activeConnections: 1,
      tasksToRun: [{ ...task, organizationId: 'org_1' }],
      orgGroups: [
        { organizationId: 'org_1', organizationName: 'Acme', tasks: [task] },
      ],
    });
    deviceTargetsMock.mockResolvedValue([]);
    mockedDb.task.findUnique.mockResolvedValue({ status: 'todo' });
    mockedDb.task.update.mockResolvedValue({});
  });

  it('runs each due check through the API, records the run and emails new failures', async () => {
    runCheckMock.mockResolvedValue({
      success: true,
      totalPassing: 4,
      totalFindings: 1,
      taskStatus: 'failed',
    });

    const summary = await runIntegrationChecksJob(log);

    expect(runCheckMock).toHaveBeenCalledWith({
      organizationId: 'org_1',
      taskId: 'tsk_1',
      connectionId: 'conn_1',
      checkId: 'two-factor-auth',
    });
    expect(mockedDb.task.update).toHaveBeenCalledWith({
      where: { id: 'tsk_1' },
      data: { integrationLastRunAt: expect.any(Date) },
    });
    expect(emailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        organizationName: 'Acme',
        failedTasks: [
          { taskId: 'tsk_1', taskTitle: '2FA', failedCount: 1, totalCount: 5 },
        ],
      }),
    );
    expect(summary).toEqual(
      expect.objectContaining({
        tasks: 1,
        checksRun: 1,
        checksErrored: 0,
        tasksNewlyFailed: 1,
      }),
    );
  });

  it('does not re-report a task that was already failed', async () => {
    mockedDb.task.findUnique.mockResolvedValue({ status: 'failed' });
    runCheckMock.mockResolvedValue({
      success: true,
      totalFindings: 1,
      taskStatus: 'failed',
    });

    await runIntegrationChecksJob(log);

    expect(emailMock).toHaveBeenCalledWith(
      expect.objectContaining({ failedTasks: [] }),
    );
  });

  it('counts checks that ran but reported a provider error, and does not mark them run', async () => {
    runCheckMock.mockResolvedValue({
      success: true,
      hadErrors: true,
      error: 'HTTP 403: Forbidden',
      totalPassing: 0,
      totalFindings: 0,
      taskStatus: null,
    });

    const summary = await runIntegrationChecksJob(log);

    expect(summary).toEqual(
      expect.objectContaining({
        checksRun: 1,
        checksErrored: 0,
        checksWithErrors: 1,
      }),
    );
    expect(mockedDb.task.update).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('reported errors'),
      expect.objectContaining({ error: 'HTTP 403: Forbidden' }),
    );
  });

  it('leaves integrationLastRunAt alone when a check errored so it retries next tick', async () => {
    runCheckMock.mockRejectedValue(new Error('provider 500'));

    const summary = await runIntegrationChecksJob(log);

    expect(mockedDb.task.update).not.toHaveBeenCalled();
    expect(summary).toEqual(
      expect.objectContaining({ checksRun: 0, checksErrored: 1 }),
    );
  });

  it('fails a multi-check task when an earlier check failed and a later one passed', async () => {
    discoverMock.mockResolvedValue({
      activeConnections: 1,
      tasksToRun: [],
      orgGroups: [
        {
          organizationId: 'org_1',
          organizationName: 'Acme',
          tasks: [{ ...task, checkIds: ['a', 'b'] }],
        },
      ],
    });
    runCheckMock
      .mockResolvedValueOnce({
        success: true,
        totalFindings: 1,
        taskStatus: 'failed',
      })
      .mockResolvedValueOnce({
        success: true,
        totalPassing: 1,
        taskStatus: 'done',
      });

    await runIntegrationChecksJob(log);

    expect(mockedDb.task.update).toHaveBeenCalledWith({
      where: { id: 'tsk_1' },
      data: { status: 'failed' },
    });
  });

  it('runs device sync for configured orgs and counts failures', async () => {
    discoverMock.mockResolvedValue({
      activeConnections: 0,
      tasksToRun: [],
      orgGroups: [],
    });
    deviceTargetsMock.mockResolvedValue([
      {
        organizationId: 'org_1',
        connectionId: 'c1',
        providerSlug: 'kandji',
        organizationName: 'A',
      },
      {
        organizationId: 'org_2',
        connectionId: 'c2',
        providerSlug: 'kandji',
        organizationName: 'B',
      },
    ]);
    syncDevicesMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('nope'));

    const summary = await runIntegrationChecksJob(log);

    expect(summary).toEqual(
      expect.objectContaining({ deviceSyncs: 1, deviceSyncFailures: 1 }),
    );
  });
});
