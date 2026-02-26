// src/orders/schemas/order.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  @Prop({ required: true })
  weight: number;

  @Prop({ required: true })
  price: number;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({
    type: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    required: true,
  })
  location: {
    lat: number;
    lng: number;
  };
}

export const OrderSchema = SchemaFactory.createForClass(Order);
