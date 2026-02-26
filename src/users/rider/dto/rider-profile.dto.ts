import {
  IsString,
  IsNotEmpty,
  IsNumberString,
  Length,
  IsOptional,
} from 'class-validator';

export class RiderProfileDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  licensePlate?: string;

  @IsString()
  @IsNumberString({}, { message: 'เลขใบขับขี่ต้องเป็นตัวเลขเท่านั้น' })
  @Length(8, 10, { message: 'เลขใบขับขี่ต้องมี 8 หรือ 10 หลัก' })
  @IsOptional()
  drivingLicense?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
