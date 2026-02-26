import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  customer: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  rider?: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['pending', 'accepted', 'picked-up', 'delivered', 'cancelled'],
    default: 'pending',
  })
  status: string;

  @Prop({
    type: [{ type: Object }],
    required: true,
  })
  items: { type: string; quantity: number }[];

  @Prop({ required: true })
  pickupAddress: string;

  @Prop({ required: true })
  deliveryAddress: string;

  @Prop({ required: true })
  totalPrice: number;

  @Prop({
    type: {
      lat: { type: Number },
      lon: { type: Number },
    },
    required: false,
  })
  location?: {
    lat: number;
    lon: number;
  };
}
export const OrderSchema = SchemaFactory.createForClass(Order);
