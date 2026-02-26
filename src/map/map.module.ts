import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MapService } from './map.service';
import { MapController } from './map.controller';
import { Address, AddressSchema } from './schemas/address.schema';
import {
  OrderLocation,
  OrderLocationSchema,
} from './schemas/order-location.schema';
import { Shop, ShopSchema } from './schemas/shop.schema';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/admin/schemas/user.schema';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: Address.name, schema: AddressSchema },
      { name: OrderLocation.name, schema: OrderLocationSchema },
      { name: Shop.name, schema: ShopSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [MapService],
  controllers: [MapController],
  exports: [MapService],
})
export class MapModule {}
