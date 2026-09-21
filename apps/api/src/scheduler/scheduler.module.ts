import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SchedulerController } from './scheduler.controller';
import { SelfHostedSchedulerService } from './self-hosted-scheduler.service';

@Module({
  imports: [AuthModule],
  controllers: [SchedulerController],
  providers: [SelfHostedSchedulerService],
  exports: [SelfHostedSchedulerService],
})
export class SchedulerModule {}
