// src/auth/strategies/refrech.strategy.ts

import { Injectable } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '@nestjs/config';

type JwtPayload = { sub: string; email: string; role: string };

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: config.getOrThrow<string>('JWT_REFRESH_SECRET'),

      passReqToCallback: true,
    });
  }

  // เพิ่ม req เป็นพารามิเตอร์ในฟังก์ชัน validate

  validate(req: any, payload: JwtPayload) {
    const authHeader = req.get('authorization') as string | undefined;

    const refreshToken = authHeader?.replace('Bearer', '').trim();

    return { ...payload, refreshToken };
  }
}
