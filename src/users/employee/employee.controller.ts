import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { UsersService } from '../users.service';

@UseGuards(AccessTokenGuard)
@Controller('employee')
export class EmployeeController {
  constructor(private readonly usersService: UsersService) {}

  private async ensureEmployeeOrAdmin(req: any) {
    const userId = req?.user?.userId || req?.user?.sub || req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('Employee only');
    }

    const user = await this.usersService.findUserById(userId);
    if (!user || (user.role !== 'employee' && user.role !== 'admin')) {
      throw new ForbiddenException('Employee only');
    }

    return String(user._id);
  }

  @Get('shops/nearby')
  async nearbyShops(
    @Req() req: any,
    @Query('lat') latRaw: string,
    @Query('lng') lngRaw: string,
    @Query('maxDistanceKm') maxRaw?: string,
  ) {
    const employeeId = await this.ensureEmployeeOrAdmin(req);

    const hasLat = latRaw !== undefined && latRaw !== null && latRaw !== '';
    const hasLng = lngRaw !== undefined && lngRaw !== null && lngRaw !== '';
    const lat = hasLat ? Number(latRaw) : undefined;
    const lng = hasLng ? Number(lngRaw) : undefined;
    const maxDistanceKm = maxRaw ? Number(maxRaw) : 8;

    if ((hasLat && Number.isNaN(lat)) || (hasLng && Number.isNaN(lng))) {
      throw new BadRequestException('lat and lng must be numbers');
    }

    return this.usersService.listNearbyShopsForEmployee(
      employeeId,
      lat,
      lng,
      Number.isNaN(maxDistanceKm) ? 8 : maxDistanceKm,
    );
  }

  @Get('shops/:shopId/orders')
  async getShopOrders(@Req() req: any, @Param('shopId') shopId: string) {
    await this.ensureEmployeeOrAdmin(req);
    return this.usersService.listEmployeeShopOrders(shopId);
  }

  @Post('shops/:shopId/join-request')
  async requestJoinShop(@Req() req: any, @Param('shopId') shopId: string) {
    const employeeId = await this.ensureEmployeeOrAdmin(req);
    return this.usersService.employeeRequestJoinShop(employeeId, shopId);
  }

  @Get('shops/:shopId/join-requests')
  async listShopJoinRequests(@Req() req: any, @Param('shopId') shopId: string) {
    const employeeId = await this.ensureEmployeeOrAdmin(req);
    const actor = await this.usersService.findUserById(employeeId);
    if (!actor) {
      throw new ForbiddenException('Employee only');
    }

    const assignedShopIds = Array.isArray((actor as any).assignedShopIds)
      ? (actor as any).assignedShopIds.map(String)
      : [];
    const canView =
      actor.role === 'admin' ||
      (actor.role === 'employee' &&
        ((actor as any).assignedShopId === shopId ||
          assignedShopIds.includes(String(shopId))));
    if (!canView) {
      throw new ForbiddenException(
        'Not allowed to view join requests for this shop',
      );
    }

    return this.usersService.listEmployeeJoinRequestsForShop(shopId);
  }

  @Patch('join-requests/:employeeId')
  async resolveJoinRequest(
    @Req() req: any,
    @Param('employeeId') employeeId: string,
    @Body() body: { action?: 'approve' | 'reject' },
  ) {
    const actorUserId = await this.ensureEmployeeOrAdmin(req);
    const action = body?.action;
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException('action must be approve or reject');
    }

    return this.usersService.resolveEmployeeJoinRequest(
      actorUserId,
      employeeId,
      action,
    );
  }

  @Patch('orders/:orderId/start-wash')
  async startWash(@Req() req: any, @Param('orderId') orderId: string) {
    const employeeId = await this.ensureEmployeeOrAdmin(req);
    return this.usersService.employeeStartWash(orderId, employeeId);
  }

  @Patch('orders/:orderId/finish-wash')
  async finishWash(@Req() req: any, @Param('orderId') orderId: string) {
    const employeeId = await this.ensureEmployeeOrAdmin(req);
    return this.usersService.employeeFinishWash(orderId, employeeId);
  }

  @Patch('orders/:orderId/finish-dry')
  async finishDry(@Req() req: any, @Param('orderId') orderId: string) {
    const employeeId = await this.ensureEmployeeOrAdmin(req);
    return this.usersService.employeeFinishDry(orderId, employeeId);
  }
}
