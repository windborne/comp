import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationPlatformModule } from '../integration-platform/integration-platform.module';
import { SchedulerController } from './scheduler.controller';
import { SelfHostedSchedulerService } from './self-hosted-scheduler.service';

@Module({
  // IntegrationPlatformModule: the Checkr background-check sync runs in-process.
  imports: [AuthModule, IntegrationPlatformModule],
  controllers: [SchedulerController],
  providers: [SelfHostedSchedulerService],
  exports: [SelfHostedSchedulerService],
})
export class SchedulerModule {}
