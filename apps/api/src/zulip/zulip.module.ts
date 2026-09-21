import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ZulipController } from './zulip.controller';
import { ZulipService } from './zulip.service';

@Module({
  imports: [AuthModule],
  controllers: [ZulipController],
  providers: [ZulipService],
  exports: [ZulipService],
})
export class ZulipModule {}
