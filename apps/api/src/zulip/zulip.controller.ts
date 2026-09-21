import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeController,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { UpsertZulipIntegrationDto } from './dto/upsert-zulip-integration.dto';
import { ZulipService } from './zulip.service';

/**
 * Zulip direct-message mirroring for the active organization's notifications.
 * Excluded from the public OpenAPI spec (and the MCP server) because the
 * upsert body carries the bot's API key.
 */
@ApiExcludeController()
@ApiTags('Zulip')
@Controller({ path: 'organization/zulip', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
export class ZulipController {
  constructor(private readonly zulipService: ZulipService) {}

  @Get()
  @RequirePermission('organization', 'read')
  @ApiOperation({
    summary: 'Get Zulip settings',
    description:
      "Returns the organization's Zulip connection (server, bot email, enabled). The bot API key is never returned.",
  })
  async getSettings(@OrganizationId() organizationId: string) {
    return this.zulipService.getSettings(organizationId);
  }

  @Put()
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Connect or update Zulip',
    description:
      'Stores the Zulip server and bot used to mirror email notifications as direct messages. Omit botApiKey to keep the stored key.',
  })
  @ApiBody({ type: UpsertZulipIntegrationDto })
  async upsertSettings(
    @OrganizationId() organizationId: string,
    @Body() dto: UpsertZulipIntegrationDto,
  ) {
    return this.zulipService.upsertSettings({ organizationId, dto });
  }

  @Delete()
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Disconnect Zulip',
    description:
      'Removes the Zulip connection; notifications go back to email only.',
  })
  async removeSettings(@OrganizationId() organizationId: string) {
    return this.zulipService.removeSettings(organizationId);
  }

  @Post('test')
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Send a Zulip test message',
    description:
      'Sends a test direct message to the signed-in user through the organization bot, to confirm the connection works.',
  })
  async sendTestMessage(
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    if (!authContext.userEmail) {
      throw new BadRequestException(
        'Test messages are sent to the signed-in user; sign in with a session to use this.',
      );
    }
    return this.zulipService.sendTestMessage({
      organizationId,
      email: authContext.userEmail,
    });
  }
}
