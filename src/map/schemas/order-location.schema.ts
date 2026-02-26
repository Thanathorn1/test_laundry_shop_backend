import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'order_locations', timestamps: true })
export class OrderLocation extends Document {
  @Prop({ required: true })
  orderId: string;

  @Prop({ required: true })
  type: string; // pickup/dropoff/shop

  @Prop({
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },
  })
  location: { type: string; coordinates: number[] };

  @Prop()
  distanceKm?: number;

  @Prop()
  durationMin?: number;

  @Prop()
  deliveryFee?: number;
}

export const OrderLocationSchema = SchemaFactory.createForClass(OrderLocation);
OrderLocationSchema.index({ location: '2dsphere' });
