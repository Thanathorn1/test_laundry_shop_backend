import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { RiderService } from './rider.service';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';
import { RiderProfileDto } from './dto/rider-profile.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Delete, ForbiddenException } from '@nestjs/common';
import { UsersService } from '../users.service';
import * as fs from 'fs';
import * as path from 'path';

@Controller('rider')
@UseGuards(AccessTokenGuard)
export class RiderController {
  constructor(
    private readonly riderService: RiderService,
    private readonly usersService: UsersService,
  ) {}

  private async ensureRole(
    req: any,
    allowedRoles: Array<'user' | 'rider' | 'admin' | 'employee'>,
  ) {
    const userId = req?.user?.userId || req?.user?.sub || req?.user?.id;
    if (!userId) throw new ForbiddenException('Unauthorized');

    const user = await this.usersService.findUserById(userId);
    if (!user || !allowedRoles.includes(user.role as any)) {
      throw new ForbiddenException('ไม่อนุญาตให้เข้าถึงข้อมูลส่วนนี้');
    }

    return userId;
  }

  @Get('profile')
  async getProfile(@Req() req: any) {
    const riderId = await this.ensureRole(req, ['rider', 'admin']);
    return this.riderService.getProfile(riderId);
  }

  @Patch('profile')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'riderImage', maxCount: 1 },
        { name: 'vehicleImage', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const uploadDir = path.join(process.cwd(), 'uploads', 'rider');
            try {
              if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
              }
            } catch {
              // ignore; let multer error if it cannot write
            }
            cb(null, uploadDir);
          },
          filename: (_req, file, cb) => {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const fileExt = extname(file.originalname || '').toLowerCase();
            cb(null, `${file.fieldname}-${uniqueSuffix}${fileExt || '.jpg'}`);
          },
        }),
      },
    ),
  )
  async upsertMyProfile(
    @Req() req: any,
    @Body() dto: RiderProfileDto,
    @UploadedFiles()
    files: {
      riderImage?: Array<{ filename: string }>;
      vehicleImage?: Array<{ filename: string }>;
    },
  ) {
    const riderId = await this.ensureRole(req, ['rider', 'admin']);

    const riderImageUrl = files?.riderImage?.[0]?.filename
      ? `/uploads/rider/${files.riderImage[0].filename}`
      : undefined;

    const vehicleImageUrl = files?.vehicleImage?.[0]?.filename
      ? `/uploads/rider/${files.vehicleImage[0].filename}`
      : undefined;

    await this.riderService.updateProfile(
      riderId,
      dto,
      riderImageUrl,
      vehicleImageUrl,
    );
    return this.riderService.getProfile(riderId);
  }

  @Get('list')
  async getAllRiders(@Req() req: any) {
    await this.ensureRole(req, ['admin']);
    return this.riderService.findAllRiders();
  }

  @Get('available')
  async getAvailableOrders(@Req() req: any) {
    await this.ensureRole(req, ['rider', 'admin']);
    return this.riderService.findAvailableOrders();
  }

  @Get('my-tasks')
  async getMyTasks(@Req() req: any) {
    const riderId = await this.ensureRole(req, ['rider', 'admin']);
    return this.riderService.findRiderTasks(riderId);
  }

  @Get(':id')
  async getRiderById(@Req() req: any, @Param('id') id: string) {
    await this.ensureRole(req, ['rider', 'admin']);
    return this.riderService.findRiderById(id);
  }

  @Patch('accept/:id')
  async acceptOrder(@Param('id') orderId: string, @Req() req: any) {
    const riderId = await this.ensureRole(req, ['rider']);
    return this.riderService.acceptOrder(orderId, riderId);
  }

  @Patch('status/:id')
  async updateStatus(
    @Param('id') orderId: string,
    @Body('status') status: string,
    @Req() req: any,
  ) {
    const riderId = await this.ensureRole(req, ['rider']);
    return this.riderService.updateStatus(orderId, riderId, status);
  }

  @Patch('handover/:id')
  async handoverToShop(
    @Param('id') orderId: string,
    @Body('shopId') shopId: string,
    @Req() req: any,
  ) {
    const riderId = await this.ensureRole(req, ['rider']);
    return this.usersService.riderHandoverToShop(orderId, riderId, shopId);
  }

  @Patch('select-shop/:id')
  async selectShopForOrder(
    @Param('id') orderId: string,
    @Body('shopId') shopId: string | null,
    @Req() req: any,
  ) {
    const riderId = await this.ensureRole(req, ['rider']);
    return this.usersService.riderSelectShop(orderId, riderId, shopId ?? null);
  }

  @Patch('return-delivery/:id')
  async startReturnDelivery(@Param('id') orderId: string, @Req() req: any) {
    const riderId = await this.ensureRole(req, ['rider']);
    return this.usersService.riderStartDeliveryBack(orderId, riderId);
  }

  @Patch('complete-delivery/:id')
  async completeDelivery(@Param('id') orderId: string, @Req() req: any) {
    const riderId = await this.ensureRole(req, ['rider']);
    return this.usersService.riderCompleteDelivery(orderId, riderId);
  }

  @Delete('profile')
  async deleteMyProfile(@Req() req: any) {
    const riderId = await this.ensureRole(req, ['rider']);
    return this.riderService.deleteProfile(riderId);
  }

  @Delete('profile/:id')
  async deleteProfileById(@Req() req: any, @Param('id') id: string) {
    await this.ensureRole(req, ['rider', 'admin']);
    return this.riderService.deleteProfile(id);
  }
}
