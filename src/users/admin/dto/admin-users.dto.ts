import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class ChangeUserRoleDto {
  @IsEnum(['user', 'rider', 'admin', 'employee'] as const)
  role: 'user' | 'rider' | 'admin' | 'employee';
}

export class CreateEmployeeDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class ResolveEmployeeJoinRequestDto {
  @IsEnum(['approve', 'reject'] as const)
  action: 'approve' | 'reject';
}

export class AssignEmployeeShopDto {
  @IsOptional()
  @IsString()
  shopId?: string | null;
}

export class SetUserBanDto {
  @IsOptional()
  @IsEnum(['unban', 'permanent', 'days'] as const)
  mode?: 'unban' | 'permanent' | 'days';

  @IsOptional()
  @IsInt()
  @Min(1)
  days?: number;

  @IsOptional()
  @IsBoolean()
  isBanned?: boolean;
}

export class ChangeUserPasswordDto {
  @IsString()
  @MinLength(8)
  password: string;
}
