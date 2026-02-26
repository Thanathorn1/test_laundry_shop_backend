// src/orders/order.controller.ts

import { Controller, Post, Body, Get, UseGuards, Req } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // Customer create order
  @UseGuards(AccessTokenGuard)
  @Post()
  async create(@Req() req, @Body() dto: CreateOrderDto) {
    return this.orderService.create(req.user.sub, dto);
  }

  // Rider view map orders
  @UseGuards(AccessTokenGuard, RolesGuard)
  @Roles('rider')
  @Get('/rider/map')
  async getOrdersForRider() {
    return this.orderService.findOrdersForRider();
  }
}
