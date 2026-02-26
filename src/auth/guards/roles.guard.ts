// src/auth/guards/roles.guard.ts

// สำหรับการป้องกันเส้นทางตามบทบาทผู้ใช้ใน NestJS

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  // ตรวจสอบว่าผู้ใช้มีบทบาทที่จำเป็นหรือไม่

  canActivate(context: ExecutionContext): boolean {
    // ดึงบทบาทที่จำเป็นจากเมตาดาต้า

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // หากมีบทบาทที่จำเป็น ให้อนุญาตการเข้าถึง

    if (!requiredRoles || requiredRoles.length === 0) return true;

    // ดึงข้อมูลผู้ใช้จากคำขอ

    const req = context.switchToHttp().getRequest();

    const user = req.user as { role?: string } | undefined;

    // ตรวจสอบว่าผู้ใช้มีบทบาทที่จำเป็นหรือไม่

    if (!user?.role) return false;

    return requiredRoles.includes(user.role);
  }
}
