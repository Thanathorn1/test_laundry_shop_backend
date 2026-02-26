import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import { UsersService } from './users.service';
import { User, UserSchema } from './admin/schemas/user.schema';
import { Customer, CustomerSchema } from './customer/schemas/customer.schema';
import { Review, ReviewSchema } from './customer/schemas/review.schema';
import { Order, OrderSchema } from './customer/schemas/order.schema';
import { CustomersController } from './customer/customers.controller';
import { AdminUsersController } from './admin/admin-users.controller';
import { Shop, ShopSchema } from '../map/schemas/shop.schema';
import { EmployeeController } from './employee/employee.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    RealtimeModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Shop.name, schema: ShopSchema },
    ]),
  ],

  providers: [UsersService],

  controllers: [CustomersController, AdminUsersController, EmployeeController],

  exports: [UsersService],
})
export class UsersModule {}
