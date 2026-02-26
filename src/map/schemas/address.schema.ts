import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'addresses', timestamps: true })
export class Address extends Document {
  @Prop({ required: true, enum: ['user', 'shop'] })
  ownerType: string;

  @Prop({ required: true })
  ownerId: string;

  @Prop({
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], required: true },
  })
  location: { type: string; coordinates: number[] };

  @Prop()
  label?: string;

  @Prop({ default: '' })
  shopName?: string;

  @Prop({ default: '' })
  phoneNumber?: string;

  @Prop({ default: '' })
  photoImage?: string;
}

export const AddressSchema = SchemaFactory.createForClass(Address);
AddressSchema.index({ location: '2dsphere' });
