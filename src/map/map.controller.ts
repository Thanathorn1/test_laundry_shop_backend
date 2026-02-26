import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { MapService } from './map.service';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { UsersService } from '../users/users.service';

@Controller()
export class MapController {
  constructor(
    private readonly mapService: MapService,
    private readonly usersService: UsersService,
  ) {}

  private async ensureAdmin(req: any) {
    const userId = req?.user?.userId || req?.user?.sub || req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('Admin only');
    }

    const user = await this.usersService.findUserById(userId);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Admin only');
    }
  }

  private async ensureAdminOrEmployee(req: any) {
    const userId = req?.user?.userId || req?.user?.sub || req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('Admin or employee only');
    }

    const user = await this.usersService.findUserById(userId);
    if (!user || (user.role !== 'admin' && user.role !== 'employee')) {
      throw new ForbiddenException('Admin or employee only');
    }

    return user;
  }

  @Post('map/distance')
  distance(@Body() body: any) {
    const { from, to } = body;
    const distanceKm = this.mapService.distanceKm(from, to);
    const durationMin = this.mapService.durationMin(distanceKm);
    return { distanceKm, durationMin };
  }

  @Post('map/delivery-fee')
  deliveryFee(@Body() body: any) {
    let distance = body.distanceKm;
    if (!distance && body.from && body.to)
      distance = this.mapService.distanceKm(body.from, body.to);
    const fee = this.mapService.deliveryFee(distance);
    return { fee, distanceKm: distance };
  }

  @Post('addresses')
  async createAddress(@Body() body: any) {
    return this.mapService.createAddress(body);
  }

  @Get('addresses')
  async listAddresses(@Query() query: any) {
    const filter: any = {};
    if (query.ownerType) filter.ownerType = query.ownerType;
    if (query.ownerId) filter.ownerId = query.ownerId;
    return this.mapService.listAddresses(filter);
  }

  @Post('rider/location')
  async updateRider(@Body() body: any) {
    return this.mapService.updateRiderLocation(body.riderId, body.location);
  }

  @Get('rider/location/:riderId')
  async getRider(@Param('riderId') riderId: string) {
    return this.mapService.getRiderLocation(riderId);
  }

  @UseGuards(AccessTokenGuard)
  @Post('map/shops')
  async createShop(@Request() req: any, @Body() body: any) {
    const actor = await this.ensureAdminOrEmployee(req);

    const location = body?.location;
    if (!location) {
      throw new BadRequestException('location is required');
    }

    const ownerId = String(actor._id);
    return this.mapService.createShopPin(ownerId, body, actor.role);
  }

  @UseGuards(AccessTokenGuard)
  @Get('map/shops')
  async listShops(@Request() req: any) {
    const userId = req?.user?.userId || req?.user?.sub || req?.user?.id;
    if (!userId) {
      throw new ForbiddenException('Unauthorized');
    }
    return this.usersService.listVisibleShopsForUser(String(userId));
  }

  @UseGuards(AccessTokenGuard)
  @Put('map/shops/:shopId')
  async updateShop(
    @Request() req: any,
    @Param('shopId') shopId: string,
    @Body() body: any,
  ) {
    await this.ensureAdminOrEmployee(req);

    const updated = await this.mapService.updateShopPin(shopId, body);
    if (!updated) throw new NotFoundException('Shop not found');
    return updated;
  }

  @UseGuards(AccessTokenGuard)
  @Patch('map/shops/:shopId/approve')
  async approveShop(@Request() req: any, @Param('shopId') shopId: string) {
    await this.ensureAdmin(req);

    const approverUserId = req?.user?.userId || req?.user?.sub || req?.user?.id;
    const updated = await this.mapService.approveShopPin(
      shopId,
      String(approverUserId),
    );
    if (!updated) throw new NotFoundException('Shop not found');
    return updated;
  }

  @UseGuards(AccessTokenGuard)
  @Delete('map/shops/:shopId')
  async deleteShop(@Request() req: any, @Param('shopId') shopId: string) {
    await this.ensureAdmin(req);

    const deleted = await this.mapService.deleteShopPin(shopId);
    if (!deleted) throw new NotFoundException('Shop not found');
    return { success: true };
  }

  @UseGuards(AccessTokenGuard)
  @Get('map/shops/nearby')
  async nearbyShops(@Query() query: any) {
    const lat = Number(query.lat);
    const lng = Number(query.lng);
    const maxDistanceKm =
      query.maxDistanceKm !== undefined ? Number(query.maxDistanceKm) : 5;

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      throw new BadRequestException('lat and lng query are required numbers');
    }

    return this.mapService.listNearbyShops(
      lat,
      lng,
      Number.isNaN(maxDistanceKm) ? 5 : maxDistanceKm,
    );
  }
}
