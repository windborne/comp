import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class DeactivateMemberDto {
  @ApiPropertyOptional({
    description:
      "The member's last day, as an ISO 8601 date. Defaults to an existing offboard date, else today.",
    example: '2026-09-10',
  })
  @IsOptional()
  @IsDateString()
  offboardDate?: string;

  @ApiPropertyOptional({
    description:
      'Skip offboarding: clears the offboard date and sends no unassigned-items notice. Use to remove someone added by mistake.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  skipOffboarding?: boolean;
}
