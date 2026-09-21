import { Logger } from '@nestjs/common';
import { db } from '@db';
import { isUserUnsubscribed } from '@trycompai/email';
import { AutomationBulkFailuresEmail } from '../../email/templates/automation-bulk-failures';
import { triggerEmail } from '../../email/trigger-email';
import type { TaskCheckRunResult } from '../../trigger/integration-platform/run-task-integration-checks';
import { nestSchedulerLog, type SchedulerLog } from './types';

const defaultLog = nestSchedulerLog(
  new Logger('IntegrationCheckFailureEmails'),
);

/** A task that freshly transitioned into `failed` during this run. */
export interface FailedTaskSummary {
  taskId: string;
  taskTitle: string;
  failedCount: number;
  totalCount: number;
}

/**
 * Reduce the results of a batch of per-task runs to the tasks that freshly
 * failed. Errored runs and runs that didn't transition into `failed` are
 * dropped (they retry on the next tick and produce no email).
 */
export function collectFailedTasks(
  runs: Array<{ ok: boolean; output?: TaskCheckRunResult }>,
): FailedTaskSummary[] {
  const failed: FailedTaskSummary[] = [];
  for (const run of runs) {
    if (!run.ok || !run.output || run.output.success !== true) continue;
    if (!run.output.statusChangedToFailed) continue;
    failed.push({
      taskId: run.output.taskId,
      taskTitle: run.output.taskTitle,
      failedCount: run.output.failedCount,
      totalCount: run.output.totalCount,
    });
  }
  return failed;
}

type Recipient = { id: string; name: string; email: string };

function toRecipient(user: {
  id: string;
  name: string | null;
  email: string;
}): Recipient {
  return {
    id: user.id,
    name: user.name?.trim() || user.email.trim() || 'User',
    email: user.email,
  };
}

/**
 * Recipients for an org's bundled failure email: the assignees of the failed
 * tasks UNION the org's admins/owners (by EXACT member-role token), deduped by
 * user id. Every recipient receives the full org digest.
 */
async function resolveRecipients(params: {
  organizationId: string;
  failedTaskIds: string[];
}): Promise<Recipient[]> {
  const { organizationId, failedTaskIds } = params;

  const [tasks, allMembers] = await Promise.all([
    db.task.findMany({
      where: { id: { in: failedTaskIds }, organizationId },
      select: {
        assignee: {
          select: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    db.member.findMany({
      where: {
        organizationId,
        deactivated: false,
      },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const recipientMap = new Map<string, Recipient>();
  for (const t of tasks) {
    const user = t.assignee?.user;
    if (user?.id && user.email) recipientMap.set(user.id, toRecipient(user));
  }
  // member.role is a comma-separated list; match exact tokens so a custom role
  // like "co-owner" is not mistaken for owner/admin.
  for (const member of allMembers) {
    const roles = (member.role ?? '').split(',').map((r) => r.trim());
    if (!roles.includes('admin') && !roles.includes('owner')) continue;
    const user = member.user;
    if (user?.id && user.email) recipientMap.set(user.id, toRecipient(user));
  }
  return Array.from(recipientMap.values());
}

/**
 * Send ONE bundled email per recipient listing every task that failed this
 * run. Best-effort: never throws, so a mail failure cannot fail (and retry)
 * the org's already-recorded check runs.
 */
export async function sendBundledFailureEmails(params: {
  organizationId: string;
  organizationName: string;
  failedTasks: FailedTaskSummary[];
  log?: SchedulerLog;
}): Promise<void> {
  const { organizationId, organizationName, failedTasks } = params;
  const log = params.log ?? defaultLog;
  if (failedTasks.length === 0) return;

  try {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.BETTER_AUTH_URL ||
      'https://app.trycomp.ai';
    const tasksUrl = `${appUrl}/${organizationId}/tasks`;

    const recipients = await resolveRecipients({
      organizationId,
      failedTaskIds: failedTasks.map((t) => t.taskId),
    });

    const taskItems = failedTasks.map((t) => ({
      title: t.taskTitle,
      url: `${appUrl}/${organizationId}/tasks/${t.taskId}`,
      failedCount: t.failedCount,
      totalCount: t.totalCount,
    }));

    const count = failedTasks.length;
    const taskText = count === 1 ? 'task' : 'tasks';

    await Promise.allSettled(
      recipients.map(async (recipient) => {
        const isUnsubscribed = await isUserUnsubscribed(
          db,
          recipient.email,
          'taskAssignments',
          organizationId,
        );
        if (isUnsubscribed) {
          log.info(
            `Skipping bundled failure email: ${recipient.email} is unsubscribed`,
          );
          return;
        }

        try {
          await triggerEmail({
            organizationId,
            to: recipient.email,
            subject: `${count} ${taskText} failed automated checks in ${organizationName}`,
            react: AutomationBulkFailuresEmail({
              toName: recipient.name,
              toEmail: recipient.email,
              organizationName,
              tasksUrl,
              tasks: taskItems,
            }),
            system: true,
          });
          log.info(`Bundled failure email sent to ${recipient.email}`);
        } catch (error) {
          log.error(
            `Failed to send bundled failure email to ${recipient.email}`,
            { error: error instanceof Error ? error.message : 'Unknown error' },
          );
        }
      }),
    );

    log.info(
      `Sent bundled failure email for ${count} ${taskText} to ${recipients.length} recipient(s) in org ${organizationId}`,
    );
  } catch (error) {
    log.error('Failed to send bundled failure email(s)', {
      organizationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
