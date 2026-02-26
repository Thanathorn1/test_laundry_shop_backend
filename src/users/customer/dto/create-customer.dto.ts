import {
  IsEmail,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
} from 'class-validator';

export class CreateCustomerDto {
  @IsOptional()
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  phoneNumber: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  profileImage?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  address?: string;
}

export class CreateReviewDto {
  @IsString()
  reviewType: 'merchant' | 'rider';

  @IsOptional()
  @IsString()
  targetId?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  isAnonymous?: boolean;
}

export class CreateOrderDto {
  @IsString()
  productName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsNumber()
  pickupLatitude: number;

  @IsNumber()
  pickupLongitude: number;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsNumber()
  deliveryLatitude?: number;

  @IsOptional()
  @IsNumber()
  deliveryLongitude?: number;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  laundryType?: 'wash' | 'dry';

  @IsOptional()
  @IsString()
  weightCategory?: 's' | 'm' | 'l' | '0-4' | '6-10' | '10-20';

  @IsOptional()
  @IsNumber()
  serviceTimeMinutes?: number;

  @IsOptional()
  @IsString()
  pickupType?: 'now' | 'schedule';

  @IsOptional()
  pickupAt?: string;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  laundryType?: 'wash' | 'dry';

  @IsOptional()
  @IsString()
  weightCategory?: 's' | 'm' | 'l' | '0-4' | '6-10' | '10-20';

  @IsOptional()
  @IsNumber()
  serviceTimeMinutes?: number;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @IsNumber()
  pickupLatitude?: number;

  @IsOptional()
  @IsNumber()
  pickupLongitude?: number;

  @IsOptional()
  @IsString()
  pickupType?: 'now' | 'schedule';

  @IsOptional()
  pickupAt?: string;
}
