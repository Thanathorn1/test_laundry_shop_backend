import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RiderProfileDocument = HydratedDocument<RiderProfile>;

@Schema({ timestamps: true })
export class RiderProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  rider: Types.ObjectId;

  @Prop({ required: true })
  fullName: string;

  @Prop({ required: true })
  licensePlate: string;

  @Prop({ required: true })
  drivingLicense: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  address: string;

  @Prop()
  vehicleImageUrl: string;

  @Prop()
  riderImageUrl: string;

  @Prop({ default: false })
  isApproved: boolean;
}

export const RiderProfileSchema = SchemaFactory.createForClass(RiderProfile);
