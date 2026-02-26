import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  MinLength,
} from 'class-validator';

export class AuthDto {
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' })
  password: string;

  @IsOptional()
  @IsIn(['user', 'admin', 'rider', 'employee'])
  role?: 'user' | 'admin' | 'rider' | 'employee';
}

export class SignInDto extends AuthDto {}

export class SignUpDto extends AuthDto {
  @IsNotEmpty({ message: 'firstName is required' })
  firstName: string;

  @IsNotEmpty({ message: 'lastName is required' })
  lastName: string;

  @IsNotEmpty({ message: 'phoneNumber is required' })
  phoneNumber: string;

  @IsNotEmpty({ message: 'confirmPassword is required' })
  @MinLength(8, { message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' })
  confirmPassword: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  email: string;
}

export class ResetPasswordDto {
  @IsNotEmpty({ message: 'reset token is required' })
  token: string;

  @IsNotEmpty()
  @MinLength(8, { message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร' })
  newPassword: string;
}
