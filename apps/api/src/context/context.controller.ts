import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { OrganizationId } from '../auth/auth-context.decorator';
import { HybridAuthGuard } from '../auth/hybrid-auth.guard';
import { PermissionGuard } from '../auth/permission.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateContextDto } from './dto/create-context.dto';
import { UpdateContextDto } from './dto/update-context.dto';
import { ContextService } from './context.service';
import { CONTEXT_OPERATIONS } from './schemas/context-operations';
import { CONTEXT_PARAMS } from './schemas/context-params';
import { CONTEXT_BODIES } from './schemas/context-bodies';
import { GET_ALL_CONTEXT_RESPONSES } from './schemas/get-all-context.responses';
import { GET_CONTEXT_BY_ID_RESPONSES } from './schemas/get-context-by-id.responses';
import { CREATE_CONTEXT_RESPONSES } from './schemas/create-context.responses';
import { UPDATE_CONTEXT_RESPONSES } from './schemas/update-context.responses';
import { DELETE_CONTEXT_RESPONSES } from './schemas/delete-context.responses';

@ApiTags('Context')
@Controller({ path: 'context', version: '1' })
@UseGuards(HybridAuthGuard, PermissionGuard)
@ApiSecurity('apikey')
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  @Get()
  @RequirePermission('evidence', 'read')
  @ApiOperation(CONTEXT_OPERATIONS.getAllContext)
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search by question text',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (1-based)',
  })
  @ApiQuery({ name: 'perPage', required: false, description: 'Items per page' })
  @ApiResponse(GET_ALL_CONTEXT_RESPONSES[200])
  @ApiResponse(GET_ALL_CONTEXT_RESPONSES[401])
  @ApiResponse(GET_ALL_CONTEXT_RESPONSES[404])
  @ApiResponse(GET_ALL_CONTEXT_RESPONSES[500])
  async getAllContext(
    @OrganizationId() organizationId: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('perPage') perPage?: string,
  ) {
    return this.contextService.findAllByOrganization(organizationId, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      perPage: perPage ? parseInt(perPage, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('evidence', 'read')
  @ApiOperation(CONTEXT_OPERATIONS.getContextById)
  @ApiParam(CONTEXT_PARAMS.contextId)
  @ApiResponse(GET_CONTEXT_BY_ID_RESPONSES[200])
  @ApiResponse(GET_CONTEXT_BY_ID_RESPONSES[401])
  @ApiResponse(GET_CONTEXT_BY_ID_RESPONSES[404])
  @ApiResponse(GET_CONTEXT_BY_ID_RESPONSES[500])
  async getContextById(
    @Param('id') contextId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.contextService.findById(contextId, organizationId);
  }

  @Post()
  @RequirePermission('evidence', 'create')
  @ApiOperation(CONTEXT_OPERATIONS.createContext)
  @ApiBody(CONTEXT_BODIES.createContext)
  @ApiResponse(CREATE_CONTEXT_RESPONSES[201])
  @ApiResponse(CREATE_CONTEXT_RESPONSES[400])
  @ApiResponse(CREATE_CONTEXT_RESPONSES[401])
  @ApiResponse(CREATE_CONTEXT_RESPONSES[404])
  @ApiResponse(CREATE_CONTEXT_RESPONSES[500])
  async createContext(
    @Body() createContextDto: CreateContextDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.contextService.create(organizationId, createContextDto);
  }

  @Patch(':id')
  @RequirePermission('evidence', 'update')
  @ApiOperation(CONTEXT_OPERATIONS.updateContext)
  @ApiParam(CONTEXT_PARAMS.contextId)
  @ApiBody(CONTEXT_BODIES.updateContext)
  @ApiResponse(UPDATE_CONTEXT_RESPONSES[200])
  @ApiResponse(UPDATE_CONTEXT_RESPONSES[400])
  @ApiResponse(UPDATE_CONTEXT_RESPONSES[401])
  @ApiResponse(UPDATE_CONTEXT_RESPONSES[404])
  @ApiResponse(UPDATE_CONTEXT_RESPONSES[500])
  async updateContext(
    @Param('id') contextId: string,
    @Body() updateContextDto: UpdateContextDto,
    @OrganizationId() organizationId: string,
  ) {
    return this.contextService.updateById(
      contextId,
      organizationId,
      updateContextDto,
    );
  }

  @Delete(':id')
  @RequirePermission('evidence', 'delete')
  @ApiOperation(CONTEXT_OPERATIONS.deleteContext)
  @ApiParam(CONTEXT_PARAMS.contextId)
  @ApiResponse(DELETE_CONTEXT_RESPONSES[200])
  @ApiResponse(DELETE_CONTEXT_RESPONSES[401])
  @ApiResponse(DELETE_CONTEXT_RESPONSES[404])
  @ApiResponse(DELETE_CONTEXT_RESPONSES[500])
  async deleteContext(
    @Param('id') contextId: string,
    @OrganizationId() organizationId: string,
  ) {
    return this.contextService.deleteById(contextId, organizationId);
  }
}
