// src/orders/order.service.ts

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from './schemas/order.schema';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name)
    private orderModel: Model<OrderDocument>,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const order = new this.orderModel({
      user: new Types.ObjectId(userId),
      weight: dto.weight,
      price: dto.price,
      location: dto.location,
      status: 'pending',
    });

    return order.save();
  }

  async findOrdersForRider() {
    return this.orderModel
      .find({ status: { $in: ['pending', 'assigned'] } })
      .populate('user', 'email name')
      .exec();
  }
}
