import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Customer } from './customer.schema';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true })
  customerId: Customer;

  @Prop({ type: String, enum: ['merchant', 'rider'], required: true })
  reviewType: 'merchant' | 'rider';

  @Prop({ type: String, default: null })
  targetId: string | null;

  @Prop({ type: Number, min: 1, max: 5, required: true })
  rating: number;

  @Prop({ type: String, trim: true, default: '' })
  comment: string;

  @Prop({ type: Number, default: 0 })
  helpfulCount: number;

  @Prop({ type: Boolean, default: false })
  isAnonymous: boolean;

  @Prop({
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved',
  })
  status: 'pending' | 'approved' | 'rejected';
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

ReviewSchema.index({ customerId: 1 });
ReviewSchema.index({ targetId: 1 });
ReviewSchema.index({ reviewType: 1 });
