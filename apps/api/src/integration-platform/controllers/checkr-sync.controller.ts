import {
  BadRequestException,
  Controller,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExtension,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ActingUserResolver } from '../../auth/acting-user.service';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermissions } from '../../auth/require-permission.decorator';
import type { AuthenticatedRequest } from '../../auth/types';
import { CheckrBackgroundCheckSyncService } from '../checkr/checkr-background-check-sync.service';

// Separate from SyncController (already far over the file-size limit); same route prefix.
@Controller({ path: 'integrations/sync', version: '1' })
@ApiTags('Integrations')
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class CheckrSyncController {
  constructor(
    private readonly checkrSync: CheckrBackgroundCheckSyncService,
    private readonly actingUser: ActingUserResolver,
  ) {}

  @Post('checkr/background-checks')
  // Writes members' background-check records, so it needs member:update like
  // every other background-check write, not just integration:update.
  @RequirePermissions([
    { resource: 'integration', actions: ['update'] },
    { resource: 'member', actions: ['update'] },
  ])
  @ApiOperation({
    summary: 'Sync background checks from Checkr',
    description:
      "Updates each person's background-check record from their current Checkr report (status, completion date) and attaches a summary. Runs daily; call it to sync now.",
  })
  @ApiQuery({ name: 'connectionId', required: true, description: 'The Checkr connection ID' })
  @ApiExtension('x-speakeasy-mcp', { name: 'sync-checkr-background-checks' })
  async syncCheckrBackgroundChecks(
    @OrganizationId() organizationId: string,
    @Query('connectionId') connectionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!connectionId) {
      throw new BadRequestException('connectionId is required');
    }
    // Attributes per-member audit rows (API keys resolve to their creator).
    const acting = await this.actingUser.resolve(req, organizationId);
    return this.checkrSync.sync({
      organizationId,
      connectionId,
      actor: acting.userId ? { userId: acting.userId, memberId: acting.memberId ?? null } : null,
    });
  }
}
