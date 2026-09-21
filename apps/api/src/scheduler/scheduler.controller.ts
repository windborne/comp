import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ServiceTokenOnlyGuard } from '../auth/service-token-only.guard';
import { SelfHostedSchedulerService } from './self-hosted-scheduler.service';

/**
 * Operator endpoints for the self-hosted scheduler: see what is scheduled and
 * kick a job now instead of waiting for its daily time. Service-token only;
 * excluded from the public OpenAPI spec.
 */
@ApiExcludeController()
@ApiTags('Internal - Scheduler')
@Controller({ path: 'internal/scheduler', version: '1' })
@UseGuards(HybridAuthGuard, ServiceTokenOnlyGuard, PermissionGuard)
export class SchedulerController {
  constructor(private readonly scheduler: SelfHostedSchedulerService) {}

  @Get('jobs')
  @RequirePermission('integration', 'read')
  @ApiOperation({
    summary: 'List the in-process scheduler jobs and their last runs',
  })
  listJobs() {
    return this.scheduler.listJobs();
  }

  @Post('jobs/:jobId/run')
  @RequirePermission('integration', 'update')
  @ApiOperation({ summary: 'Run a scheduler job now and return its summary' })
  runJob(@Param('jobId') jobId: string) {
    return this.scheduler.runJob(jobId);
  }
}
