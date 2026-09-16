import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeController,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SessionOnlyGuard } from '../auth/session-only.guard';
import { toBetterAuthHeaders } from './better-auth-call';
import { CreateSsoProviderDto } from './dto/create-sso-provider.dto';
import { UpdateSsoProviderDto } from './dto/update-sso-provider.dto';
import { SsoService } from './sso.service';

/**
 * Single sign-on provider management for the active organization.
 *
 * Session-only: the writes are delegated to better-auth, which needs the
 * acting user's session to run its own owner/admin check. Excluded from the
 * public OpenAPI spec (and therefore the MCP server) because the create/update
 * bodies carry IdP client secrets.
 */
@ApiExcludeController()
@ApiTags('SSO')
@Controller({ path: 'organization/sso-providers', version: '1' })
@UseGuards(HybridAuthGuard, SessionOnlyGuard, PermissionGuard)
export class SsoController {
  constructor(private readonly ssoService: SsoService) {}

  @Get()
  @RequirePermission('organization', 'read')
  @ApiOperation({
    summary: 'List single sign-on providers',
    description:
      "Lists the organization's OIDC single sign-on providers with their verification status. Client secrets are never returned.",
  })
  async listProviders(@OrganizationId() organizationId: string) {
    const data = await this.ssoService.listProviders(organizationId);
    return { data, count: data.length };
  }

  @Post()
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Register a single sign-on provider',
    description:
      'Registers an OIDC identity provider for the organization and returns the DNS TXT record needed to verify the email domain.',
  })
  @ApiBody({ type: CreateSsoProviderDto })
  async createProvider(
    @OrganizationId() organizationId: string,
    @Req() req: Request,
    @Body() dto: CreateSsoProviderDto,
  ) {
    return this.ssoService.createProvider({
      organizationId,
      headers: toBetterAuthHeaders(req.headers),
      dto,
    });
  }

  @Post(':providerId/domain-verification')
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Get the domain verification record',
    description:
      'Returns (creating if needed) the DNS TXT record that proves the organization owns the provider email domain.',
  })
  @ApiParam({ name: 'providerId', description: 'Provider identifier' })
  async getDomainVerification(
    @OrganizationId() organizationId: string,
    @Req() req: Request,
    @Param('providerId') providerId: string,
  ) {
    return this.ssoService.getDomainVerification({
      organizationId,
      headers: toBetterAuthHeaders(req.headers),
      providerId,
    });
  }

  @Post(':providerId/verify-domain')
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Verify the provider domain',
    description:
      'Checks DNS for the verification TXT record and, when found, enables sign-in through the provider.',
  })
  @ApiParam({ name: 'providerId', description: 'Provider identifier' })
  async verifyDomain(
    @OrganizationId() organizationId: string,
    @Req() req: Request,
    @Param('providerId') providerId: string,
  ) {
    return this.ssoService.verifyDomain({
      organizationId,
      headers: toBetterAuthHeaders(req.headers),
      providerId,
    });
  }

  @Patch(':providerId')
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Update a single sign-on provider',
    description:
      'Partially updates a provider. Changing the domain resets its verification; identity fields are locked once users have signed in.',
  })
  @ApiParam({ name: 'providerId', description: 'Provider identifier' })
  @ApiBody({ type: UpdateSsoProviderDto })
  async updateProvider(
    @OrganizationId() organizationId: string,
    @Req() req: Request,
    @Param('providerId') providerId: string,
    @Body() dto: UpdateSsoProviderDto,
  ) {
    return this.ssoService.updateProvider({
      organizationId,
      headers: toBetterAuthHeaders(req.headers),
      providerId,
      dto,
    });
  }

  @Delete(':providerId')
  @RequirePermission('organization', 'update')
  @ApiOperation({
    summary: 'Delete a single sign-on provider',
    description:
      'Removes the provider and the linked SSO accounts. Users keep their Comp AI accounts and memberships.',
  })
  @ApiParam({ name: 'providerId', description: 'Provider identifier' })
  async deleteProvider(
    @OrganizationId() organizationId: string,
    @Req() req: Request,
    @Param('providerId') providerId: string,
  ) {
    return this.ssoService.deleteProvider({
      organizationId,
      headers: toBetterAuthHeaders(req.headers),
      providerId,
    });
  }
}
