import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Customer } from './customer.schema';

export type OrderDocument = HydratedDocument<Order>;

@Schema({ collection: 'customerorders', timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId: Customer;

  @Prop({ type: String, required: true })
  productName: string;

  @Prop({ type: String, required: true, default: '' })
  contactPhone: string;

  @Prop({ type: String, enum: ['wash', 'dry'], default: 'wash' })
  laundryType: 'wash' | 'dry';

  @Prop({ type: String, enum: ['s', 'm', 'l', '0-4', '6-10', '10-20'], default: 's' })
  weightCategory: 's' | 'm' | 'l' | '0-4' | '6-10' | '10-20';

  @Prop({ type: Number, default: 50 })
  serviceTimeMinutes: number;

  @Prop({ type: String, default: '' })
  description: string;

  @Prop({
    type: [String],
    default: [],
  })
  images: string[];

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  })
  pickupLocation: {
    type: 'Point';
    coordinates: number[];
  };

  @Prop({ type: String, default: null })
  pickupAddress: string | null;

  @Prop({ type: String, enum: ['now', 'schedule'], default: 'now' })
  pickupType: 'now' | 'schedule';

  @Prop({ type: Date, default: null })
  pickupAt: Date | null;

  @Prop({ type: Object })
  deliveryLocation?: {
    type: 'Point';
    coordinates: number[];
  };

  @Prop({ type: String, default: null })
  deliveryAddress: string | null;

  @Prop({
    type: String,
    enum: [
      'pending',
      'assigned',
      'picked_up',
      'at_shop',
      'washing',
      'drying',
      'laundry_done',
      'out_for_delivery',
      'completed',
      'cancelled',
    ],
    default: 'pending',
  })
  status:
    | 'pending'
    | 'assigned'
    | 'picked_up'
    | 'at_shop'
    | 'washing'
    | 'drying'
    | 'laundry_done'
    | 'out_for_delivery'
    | 'completed'
    | 'cancelled';

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  riderId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Shop', default: null })
  shopId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  employeeId: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  washingStartedAt: Date | null;

  @Prop({ type: Date, default: null })
  washingCompletedAt: Date | null;

  @Prop({ type: Number, default: 0 })
  totalPrice: number;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ customerId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ riderId: 1 });
OrderSchema.index({ shopId: 1 });
OrderSchema.index({ employeeId: 1 });
OrderSchema.index({ pickupLocation: '2dsphere' });

// Auto-delete completed/cancelled orders after 1 day (86400 seconds)
OrderSchema.index({ completedAt: 1 }, { expireAfterSeconds: 86400 });
