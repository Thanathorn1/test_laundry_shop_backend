import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../admin/schemas/user.schema';

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: User;

  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  phoneNumber: string;

  @Prop({ type: String, default: null })
  profileImage: string | null;

  @Prop({
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [100.5018, 13.7563],
    },
  })
  location: {
    type: 'Point';
    coordinates: number[];
  };

  @Prop({ type: String, default: null })
  address: string | null;

  @Prop({
    type: [
      {
        label: String,
        address: String,
        coordinates: [Number],
        isDefault: Boolean,
      },
    ],
    default: [],
  })
  savedAddresses: Array<{
    label: string;
    address: string;
    coordinates: number[];
    isDefault: boolean;
  }>;

  @Prop({ type: Number, min: 0, max: 5, default: 0 })
  averageRating: number;

  @Prop({ type: Number, default: 0 })
  totalReviews: number;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  })
  status: 'active' | 'inactive' | 'suspended';

  @Prop({ type: Boolean, default: false })
  isEmailVerified: boolean;

  @Prop({ type: Boolean, default: false })
  isPhoneVerified: boolean;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

CustomerSchema.index({ location: '2dsphere' });
