import type { Logger } from '@nestjs/common';

/**
 * Minimal logger shared by the Trigger.dev schedules (which pass the SDK
 * logger) and the in-process self-hosted scheduler (which wraps a Nest Logger).
 */
export interface SchedulerLog {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export function nestSchedulerLog(logger: Logger): SchedulerLog {
  const withData = (message: string, data?: Record<string, unknown>) =>
    data ? `${message} ${JSON.stringify(data)}` : message;
  return {
    info: (message, data) => logger.log(withData(message, data)),
    warn: (message, data) => logger.warn(withData(message, data)),
    error: (message, data) => logger.error(withData(message, data)),
  };
}
