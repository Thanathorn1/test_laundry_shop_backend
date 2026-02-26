import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'shops', timestamps: true })
export class Shop extends Document {
  @Prop({ required: true, default: 'Laundry Shop' })
  shopName: string;

  @Prop({ default: '' })
  label?: string;

  @Prop({ default: '' })
  phoneNumber?: string;

  @Prop({ default: '' })
  photoImage?: string;

  @Prop({ required: true })
  ownerId: string;

  @Prop({ type: Number, default: 10, min: 1 })
  totalWashingMachines: number;

  @Prop({
    type: {
      s: { type: Number, default: 10, min: 0 },
      m: { type: Number, default: 0, min: 0 },
      l: { type: Number, default: 0, min: 0 },
    },
    default: { s: 10, m: 0, l: 0 },
  })
  machineSizeConfig: {
    s: number;
    m: number;
    l: number;
  };

  @Prop({ type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' })
  approvalStatus: 'pending' | 'approved' | 'rejected';

  @Prop({ type: String, default: null })
  approvedBy: string | null;

  @Prop({ type: Date, default: null })
  approvedAt: Date | null;

  @Prop({
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },
  })
  location: { type: string; coordinates: number[] };
}

export const ShopSchema = SchemaFactory.createForClass(Shop);
ShopSchema.index({ location: '2dsphere' });
