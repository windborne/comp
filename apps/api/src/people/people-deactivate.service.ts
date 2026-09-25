import { db } from '@db';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PeopleResponseDto } from './dto/people-responses.dto';
import { PeopleService } from './people.service';
import { MemberQueries } from './utils/member-queries';

@Injectable()
export class PeopleDeactivateService {
  constructor(private readonly peopleService: PeopleService) {}

  /**
   * Deactivate a member (the counterpart of reactivateById). Delegates to
   * PeopleService.deleteById, which already enforces the owner / platform-admin /
   * self guards, revokes sessions, clears assignments and removes Fleet hosts.
   */
  async deactivate({
    memberId,
    organizationId,
    callerUserId,
    offboardDate,
    skipOffboarding,
  }: {
    memberId: string;
    organizationId: string;
    callerUserId?: string;
    offboardDate?: string;
    skipOffboarding?: boolean;
  }): Promise<PeopleResponseDto> {
    if (offboardDate && skipOffboarding) {
      throw new BadRequestException(
        'offboardDate cannot be combined with skipOffboarding',
      );
    }

    const member = await db.member.findFirst({
      where: { id: memberId, organizationId },
      select: { deactivated: true },
    });
    if (!member) {
      throw new NotFoundException(
        `Member with ID ${memberId} not found in organization ${organizationId}`,
      );
    }
    if (member.deactivated) {
      throw new BadRequestException('Member is already deactivated');
    }

    await this.peopleService.deleteById(memberId, organizationId, callerUserId, {
      skipOffboarding,
      offboardDate: offboardDate ? new Date(offboardDate) : undefined,
    });

    return db.member.findFirstOrThrow({
      where: { id: memberId, organizationId },
      select: MemberQueries.MEMBER_SELECT,
    });
  }
}
