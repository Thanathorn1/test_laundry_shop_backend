import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from '../users.service';
import {
  CreateCustomerDto,
  CreateReviewDto,
  CreateOrderDto,
  UpdateOrderDto,
} from './dto/create-customer.dto';
import { AccessTokenGuard } from '../../auth/guards/access-token.guard';

@Controller('customers')
export class CustomersController {
  constructor(private readonly usersService: UsersService) {}

  private getAuthUserId(req: any): string {
    return req?.user?.userId || req?.user?.sub || req?.user?.id;
  }

  @UseGuards(AccessTokenGuard)
  @Post('register')
  async registerCustomer(@Request() req, @Body() dto: CreateCustomerDto) {
    const user = await this.usersService.upsertUserProfile(
      this.getAuthUserId(req),
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        profileImage: dto.profileImage,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
      },
    );
    return user;
  }

  @UseGuards(AccessTokenGuard)
  @Get('me')
  async getMyProfile(@Request() req) {
    const user = await this.usersService.findUserById(this.getAuthUserId(req));
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  @UseGuards(AccessTokenGuard)
  @Put('update')
  async updateProfile(@Request() req, @Body() dto: CreateCustomerDto) {
    return this.usersService.upsertUserProfile(this.getAuthUserId(req), dto);
  }

  @UseGuards(AccessTokenGuard)
  @Post('addresses')
  async addSavedAddress(
    @Request() req,
    @Body()
    body: {
      label: string;
      address: string;
      latitude: number;
      longitude: number;
      isDefault?: boolean;
      contactPhone?: string;
      pickupType?: 'now' | 'schedule';
      pickupAt?: string | null;
    },
  ) {
    return this.usersService.addUserSavedAddress(
      this.getAuthUserId(req),
      body.label,
      body.address,
      body.latitude,
      body.longitude,
      body.isDefault,
      body.contactPhone,
      body.pickupType,
      body.pickupAt,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Post('orders')
  async createOrder(@Request() req, @Body() dto: CreateOrderDto) {
    return this.usersService.createOrder(this.getAuthUserId(req), dto);
  }

  @UseGuards(AccessTokenGuard)
  @Get('orders')
  async getMyOrders(@Request() req) {
    return this.usersService.getCustomerOrders(this.getAuthUserId(req));
  }

  @UseGuards(AccessTokenGuard)
  @Put('orders/:orderId')
  async updateOrder(
    @Param('orderId') orderId: string,
    @Request() req,
    @Body() dto: UpdateOrderDto,
  ) {
    const userId = this.getAuthUserId(req);
    const order = await this.usersService.findOrderById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId.toString() !== userId)
      throw new ForbiddenException('Not your order');
    if (order.status !== 'pending')
      throw new ForbiddenException('Only pending orders can be edited');
    return this.usersService.updateOrder(orderId, dto);
  }

  @UseGuards(AccessTokenGuard)
  @Delete('orders/:orderId')
  async deleteOrder(@Param('orderId') orderId: string, @Request() req) {
    const userId = this.getAuthUserId(req);
    const order = await this.usersService.findOrderById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId.toString() !== userId)
      throw new ForbiddenException('Not your order');
    if (order.status !== 'pending')
      throw new ForbiddenException('Only pending orders can be deleted');
    return this.usersService.deleteOrder(orderId);
  }

  @UseGuards(AccessTokenGuard)
  @Put('orders/:orderId/status')
  async updateOrderStatus(
    @Param('orderId') orderId: string,
    @Body() body: { status: string },
  ) {
    return this.usersService.updateOrderStatus(orderId, body.status);
  }

  @UseGuards(AccessTokenGuard)
  @Post('reviews')
  async createReview(@Request() req, @Body() dto: CreateReviewDto) {
    const customer = await this.usersService.findCustomerByUserId(
      this.getAuthUserId(req),
    );
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }
    return this.usersService.createReview(customer._id.toString(), dto);
  }

  @UseGuards(AccessTokenGuard)
  @Get('saved-addresses')
  async getSavedAddresses(@Request() req) {
    const user = await this.usersService.findUserById(this.getAuthUserId(req));
    if (!user) throw new NotFoundException('User not found');
    return user.savedAddresses || [];
  }

  @UseGuards(AccessTokenGuard)
  @Get('reviews')
  async getMyReviews(@Request() req) {
    const customer = await this.usersService.findCustomerByUserId(
      this.getAuthUserId(req),
    );
    if (!customer) {
      throw new NotFoundException('Customer profile not found');
    }
    return this.usersService.getCustomerReviews(customer._id.toString());
  }

  @Get('nearby')
  async getNearbyCustomers(
    @Body() body: { latitude: number; longitude: number; maxDistance?: number },
  ) {
    return this.usersService.findNearbyCustomers(
      body.longitude,
      body.latitude,
      body.maxDistance,
    );
  }
}
