import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sendResetPasswordEmail(email: string, resetUrl: string) {
    const gmailUser =
      this.config.get<string>('GMAIL_USER') ||
      this.config.get<string>('MAIL_USER');
    const gmailPass =
      this.config.get<string>('GMAIL_APP_PASSWORD') ||
      this.config.get<string>('MAIL_PASS');
    const fromEmail = this.config.get<string>('MAIL_FROM') || gmailUser;

    if (!gmailUser || !gmailPass || !fromEmail) {
      throw new BadRequestException(
        'Email service is not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD.',
      );
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    try {
      await transporter.sendMail({
        from: fromEmail,
        to: email,
        subject: 'Reset your Laundry Shop password',
        html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>Reset Password</h2>
                    <p>You requested to reset your password.</p>
                    <p>Click below to set a new password (valid for 15 minutes):</p>
                    <p><a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;">Reset Password</a></p>
                </div>
            `,
      });
    } catch {
      throw new BadRequestException(
        'Failed to send reset email. Check Gmail credentials and App Password.',
      );
    }
  }

  private async signTokens(user: { id: string; email: string; role: string }) {
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');

    const accessExp = parseInt(
      this.config.get<string>('JWT_ACCESS_EXPIRATION') ?? '900',
      10,
    );
    const refreshExp = parseInt(
      this.config.get<string>('JWT_REFRESH_EXPIRATION') ?? '604800',
      10,
    );

    const payload = { sub: user.id, email: user.email, role: user.role };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExp,
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshSecret,
        expiresIn: refreshExp,
      }),
    ]);

    return { access_token, refresh_token };
  }

  private async storeRefreshHash(userId: string, refreshToken: string) {
    const hash = await argon2.hash(refreshToken);
    await this.usersService.setRefreshTokenHash(userId, hash);
  }

  async forgotPassword(rawEmail: string) {
    const email = this.normalizeEmail(rawEmail);
    const user = await this.usersService.findByEmailForReset(email);

    if (!user) {
      return {
        success: true,
        message: 'If this email exists, a reset link has been sent.',
      };
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.usersService.setPasswordResetToken(
      String(user._id),
      tokenHash,
      expiresAt,
    );

    const frontendBase =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const resetUrl = `${frontendBase.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    await this.sendResetPasswordEmail(email, resetUrl);

    return {
      success: true,
      message: 'If this email exists, a reset link has been sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token) throw new BadRequestException('Invalid token');
    if (!newPassword || newPassword.trim().length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const tokenHash = this.hashResetToken(token);
    const user =
      await this.usersService.findByResetPasswordTokenHash(tokenHash);

    if (
      !user ||
      !user.resetPasswordExpiresAt ||
      user.resetPasswordExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Reset token is invalid or expired');
    }

    const passwordHash = await argon2.hash(newPassword.trim());
    await this.usersService.updatePasswordByUserId(
      String(user._id),
      passwordHash,
    );

    return { success: true, message: 'Password reset successful' };
  }

  async signUp(dto: SignUpDto) {
    const email = this.normalizeEmail(dto.email);
    const userExists = await this.usersService.findByEmail(email);

    if (userExists) throw new BadRequestException('Email นี้ถูกใช้งานแล้ว');
    if (dto.role === 'admin')
      throw new BadRequestException('ไม่สามารถสมัครบัญชีแอดมินผ่านหน้านี้ได้');
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }

    const passwordHash = await argon2.hash(dto.password);
    const signupRole =
      dto.role === 'rider' || dto.role === 'employee' ? dto.role : 'user';

    const newUser = await this.usersService.create({
      email,
      passwordHash,
      role: signupRole,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      phoneNumber: dto.phoneNumber.trim(),
    });

    const tokens = await this.signTokens({
      id: String(newUser._id),
      email: newUser.email,
      role: newUser.role,
    });
    await this.storeRefreshHash(String(newUser._id), tokens.refresh_token);
    return tokens;
  }

  async signIn(dto: SignInDto) {
    const email = this.normalizeEmail(dto.email);

    const user = await this.usersService.findByEmailWithAuthSecrets(email);
    if (!user) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const isCurrentlyBanned = await this.usersService.enforceBanStateForSignIn(
      user as any,
    );
    if (isCurrentlyBanned)
      throw new ForbiddenException('บัญชีนี้ถูกระงับการใช้งาน');

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      dto.password,
    );
    if (!passwordMatches)
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    // Enforce portal role match: only admins may sign in with any requested role.
    if (dto.role) {
      const normalizeRole = (value?: string | null) =>
        String(value ?? '')
          .trim()
          .toLowerCase();
      const requestedRole = normalizeRole(dto.role);
      const accountRole = normalizeRole((user as any).role);
      const isAdmin = accountRole === 'admin';

      if (!isAdmin && accountRole !== requestedRole) {
        // Dev-friendly diagnostic (won't leak to client response)
        // Useful when Mac/PC are pointing at different backends/DBs.

        console.warn(
          `[auth] role mismatch for ${email}: requested=${requestedRole} account=${accountRole}`,
        );
        throw new ForbiddenException('Role does not match this account');
      }
    }

    const tokens = await this.signTokens({
      id: String(user._id),
      email: user.email,
      role: user.role,
    });
    await this.storeRefreshHash(String(user._id), tokens.refresh_token);
    return tokens;
  }

  async refreshTokens(
    userId: string,
    email: string,
    role: string,
    refreshToken: string,
  ) {
    if (!refreshToken) throw new ForbiddenException('Access denied');

    const user = await this.usersService.findByIdWithRefresh(userId);
    if (!user?.refreshTokenHash) throw new ForbiddenException('Access denied');

    const matches = await argon2.verify(user.refreshTokenHash, refreshToken);
    if (!matches) throw new ForbiddenException('Access denied');

    const tokens = await this.signTokens({ id: userId, email, role });
    await this.storeRefreshHash(userId, tokens.refresh_token);

    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.setRefreshTokenHash(userId, null);
    return { success: true };
  }
}
