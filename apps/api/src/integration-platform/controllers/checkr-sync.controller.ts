import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExtension,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '../../auth/auth-context.decorator';
import { HybridAuthGuard } from '../../auth/hybrid-auth.guard';
import { PermissionGuard } from '../../auth/permission.guard';
import { RequirePermission } from '../../auth/require-permission.decorator';
import { CheckrBackgroundCheckSyncService } from '../checkr/checkr-background-check-sync.service';

// Separate from SyncController (already far over the file-size limit); same route prefix.
@Controller({ path: 'integrations/sync', version: '1' })
@ApiTags('Integrations')
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class CheckrSyncController {
  constructor(private readonly checkrSync: CheckrBackgroundCheckSyncService) {}

  @Post('checkr/background-checks')
  // Same permission as the Rippling / Google Workspace employee syncs.
  @RequirePermission('integration', 'update')
  @ApiOperation({
    summary: 'Sync background checks from Checkr',
    description:
      "Updates each person's background-check record from their current Checkr report (status, result, completion date) and attaches a summary. Runs daily; call it to sync now.",
  })
  @ApiQuery({ name: 'connectionId', required: true, description: 'The Checkr connection ID' })
  @ApiExtension('x-speakeasy-mcp', { name: 'sync-checkr-background-checks' })
  async syncCheckrBackgroundChecks(
    @OrganizationId() organizationId: string,
    @Query('connectionId') connectionId: string,
  ) {
    if (!connectionId) {
      throw new BadRequestException('connectionId is required');
    }
    return this.checkrSync.sync({ organizationId, connectionId });
  }
}
