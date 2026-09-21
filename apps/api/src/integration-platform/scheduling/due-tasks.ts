import { getManifest } from '@trycompai/integration-platform';
import { db, TaskAutomationStatus, type TaskFrequency } from '@db';
import { isDueToday } from '../../trigger/shared/is-due-today';
import { isCheckDisabledForTask } from '../utils/disabled-task-checks';
import type { SchedulerLog } from './types';

/**
 * Filters a list of candidate tasks down to those whose schedule says they
 * are due at `now`. Kept in-memory because the single source of truth for
 * schedule math is `isDueToday`; duplicating it in SQL would create drift.
 */
export function filterDueTasks<
  T extends {
    integrationScheduleFrequency: TaskFrequency;
    integrationLastRunAt: Date | null;
  },
>({ tasks, now }: { tasks: T[]; now: Date }): T[] {
  return tasks.filter((t) =>
    isDueToday({
      scheduleFrequency: t.integrationScheduleFrequency,
      lastRunAt: t.integrationLastRunAt,
      now,
    }),
  );
}

/** A provider's check reduced to what the orchestrator needs to schedule it. */
export interface ProviderCheck {
  id: string;
  taskMapping: string | null;
}

/**
 * Resolve a connection's checks from EITHER the static code manifest OR the
 * dynamic (DB-backed) check map for that provider slug. Static manifests win
 * when both exist, matching the registry.
 */
export function resolveProviderChecks({
  manifest,
  dynamicChecks,
}: {
  manifest:
    { checks?: Array<{ id: string; taskMapping?: string | null }> } | undefined;
  dynamicChecks: ProviderCheck[] | undefined;
}): ProviderCheck[] {
  if (manifest?.checks) {
    return manifest.checks.map((c) => ({
      id: c.id,
      taskMapping: c.taskMapping ?? null,
    }));
  }
  return dynamicChecks ?? [];
}

/** One task scheduled for an org, as handed to the per-org runner. */
export interface OrgTaskCheck {
  taskId: string;
  taskTitle: string;
  connectionId: string;
  providerSlug: string;
  checkIds: string[];
}

/** A flat scheduled-task entry, before grouping by org. */
export interface ScheduledTask extends OrgTaskCheck {
  organizationId: string;
}

/** One org's worth of scheduled tasks, ready to hand to the per-org runner. */
export interface OrgTaskGroup {
  organizationId: string;
  organizationName: string;
  tasks: OrgTaskCheck[];
}

/**
 * Group the flat task list into one entry per organization, attaching each
 * org's display name, so failures can be bundled into one email per org.
 */
export function groupTasksByOrg({
  tasksToRun,
  orgNameById,
}: {
  tasksToRun: ScheduledTask[];
  orgNameById: Map<string, string>;
}): OrgTaskGroup[] {
  const byOrg = new Map<string, OrgTaskGroup>();
  for (const t of tasksToRun) {
    let group = byOrg.get(t.organizationId);
    if (!group) {
      group = {
        organizationId: t.organizationId,
        organizationName:
          orgNameById.get(t.organizationId) ?? 'your organization',
        tasks: [],
      };
      byOrg.set(t.organizationId, group);
    }
    group.tasks.push({
      taskId: t.taskId,
      taskTitle: t.taskTitle,
      connectionId: t.connectionId,
      providerSlug: t.providerSlug,
      checkIds: t.checkIds,
    });
  }
  return Array.from(byOrg.values());
}

export interface DueIntegrationTasks {
  activeConnections: number;
  tasksToRun: ScheduledTask[];
  orgGroups: OrgTaskGroup[];
}

/**
 * Finds every task whose integration checks are due at `now`: for each active
 * connection, the checks mapped to the org's non-MANUAL tasks, filtered by the
 * task's schedule and per-task disabled checks. Shared by the Trigger.dev daily
 * orchestrator and the self-hosted in-process scheduler.
 */
export async function discoverDueIntegrationTasks({
  now,
  log,
}: {
  now: Date;
  log: SchedulerLog;
}): Promise<DueIntegrationTasks> {
  const activeConnections = await db.integrationConnection.findMany({
    where: { status: 'active' },
    include: {
      provider: true,
      organization: {
        select: { id: true, name: true },
      },
    },
  });
  log.info(`Found ${activeConnections.length} active connections`);

  const orgNameById = new Map<string, string>();
  for (const connection of activeConnections) {
    if (connection.organization?.name) {
      orgNameById.set(connection.organizationId, connection.organization.name);
    }
  }

  // Dynamic (DB-backed) integrations may be absent from the code manifest
  // registry, so load their enabled check → task mappings from the DB too.
  const dynamicIntegrations = await db.dynamicIntegration.findMany({
    where: { isActive: true },
    select: {
      slug: true,
      checks: {
        where: { isEnabled: true },
        select: { checkSlug: true, taskMapping: true },
      },
    },
  });
  const dynamicChecksBySlug = new Map<string, ProviderCheck[]>(
    dynamicIntegrations.map((d) => [
      d.slug,
      d.checks.map((c) => ({ id: c.checkSlug, taskMapping: c.taskMapping })),
    ]),
  );

  const tasksToRun: ScheduledTask[] = [];
  for (const connection of activeConnections) {
    const manifest = getManifest(connection.provider.slug);
    const checks = resolveProviderChecks({
      manifest,
      dynamicChecks: dynamicChecksBySlug.get(connection.provider.slug),
    });
    const taskTemplateIds = checks
      .map((c) => c.taskMapping)
      .filter((id): id is string => !!id);
    if (taskTemplateIds.length === 0) continue;

    // MANUAL tasks are excluded: the scheduler must not auto-run checks on a
    // task the customer manages manually.
    const candidateTasks = await db.task.findMany({
      where: {
        organizationId: connection.organizationId,
        taskTemplateId: { in: taskTemplateIds },
        automationStatus: { not: TaskAutomationStatus.MANUAL },
      },
      select: {
        id: true,
        title: true,
        taskTemplateId: true,
        integrationScheduleFrequency: true,
        integrationLastRunAt: true,
      },
    });

    // `integrationLastRunAt` is only written on success, so failures naturally
    // retry on the next tick.
    const tasks = filterDueTasks({ tasks: candidateTasks, now });
    if (tasks.length < candidateTasks.length) {
      log.info(
        `Skipped ${candidateTasks.length - tasks.length} task(s) not due yet for connection ${connection.id}`,
      );
    }

    for (const t of tasks) {
      const checksForTask = checks
        .filter(
          (c) =>
            c.taskMapping === t.taskTemplateId &&
            !isCheckDisabledForTask(connection.metadata, t.id, c.id),
        )
        .map((c) => c.id);
      if (checksForTask.length === 0) continue;
      tasksToRun.push({
        taskId: t.id,
        taskTitle: t.title,
        connectionId: connection.id,
        providerSlug: connection.provider.slug,
        organizationId: connection.organizationId,
        checkIds: checksForTask,
      });
    }
  }

  return {
    activeConnections: activeConnections.length,
    tasksToRun,
    orgGroups: groupTasksByOrg({ tasksToRun, orgNameById }),
  };
}
