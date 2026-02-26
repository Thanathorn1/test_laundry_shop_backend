import { Module } from '@nestjs/common';
import { OrderGateway } from './order.gateway';

@Module({
  providers: [OrderGateway],
  exports: [OrderGateway],
})
export class RealtimeModule {}
