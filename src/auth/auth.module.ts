import { Module } from '@nestjs/common';

import { JwtModule } from '@nestjs/jwt';

import { PassportModule } from '@nestjs/passport';

import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';

import { AuthController } from './auth.controller';

import { UsersModule } from '../users/users.module';

import { JwtStrategy } from './strategies/jwt.strategy';

import { RefreshStrategy } from './strategies/refresh.strategy';

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy, RefreshStrategy],
})
export class AuthModule {}
