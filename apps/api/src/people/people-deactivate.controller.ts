import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiExtension,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { AuthContext, OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import type { AuthContext as AuthContextType } from '../auth/types';
import { DeactivateMemberDto } from './dto/deactivate-member.dto';
import { PeopleDeactivateService } from './people-deactivate.service';
import { PEOPLE_PARAMS } from './schemas/people-params';

// Split from PeopleController (already over the file-size limit); same route prefix.
@ApiTags('People')
@ApiSecurity('apikey')
@Controller({ path: 'people', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
export class PeopleDeactivateController {
  constructor(private readonly deactivateService: PeopleDeactivateService) {}

  @Patch(':id/deactivate')
  // Same permission as DELETE /v1/people/:id, which performs the same deactivation.
  @RequirePermission('member', 'delete')
  @ApiOperation({
    summary: 'Deactivate a member',
    description:
      'Deactivate a departed employee or contractor: sets their offboard date, revokes sessions, clears assignments and removes Fleet devices. Records are kept; undo with reactivate-member.',
  })
  @ApiParam(PEOPLE_PARAMS.memberId)
  @ApiBody({ type: DeactivateMemberDto })
  @ApiExtension('x-speakeasy-mcp', { name: 'deactivate-member' })
  async deactivateMember(
    @Param('id') memberId: string,
    @Body() body: DeactivateMemberDto,
    @OrganizationId() organizationId: string,
    @AuthContext() authContext: AuthContextType,
  ) {
    return this.deactivateService.deactivate({
      memberId,
      organizationId,
      callerUserId: authContext.userId,
      offboardDate: body.offboardDate,
      skipOffboarding: body.skipOffboarding,
    });
  }
}
