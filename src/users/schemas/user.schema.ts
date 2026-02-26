import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export type UserRole = 'user' | 'admin' | 'rider' | 'employee'; // สามารถกำหนดประเภทผู้ใช้ในฐานข้อมูลได้

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;
  @Prop({
    required: true,
    enum: ['user', 'admin', 'rider', 'employee'],
    default: 'user',
  })
  role: UserRole;

  @Prop({ type: String, select: false, default: null })
  refreshTokenHash?: string | null;

  @Prop({ type: String, default: null, index: true })
  assignedShopId?: string | null;

  @Prop({ type: [String], default: [], index: true })
  assignedShopIds?: string[];

  @Prop({ type: String, trim: true, default: '' })
  fullName?: string;

  @Prop({ type: String, trim: true, default: '' })
  licensePlate?: string;

  @Prop({ type: String, trim: true, default: '' })
  drivingLicense?: string;

  @Prop({ type: String, trim: true, default: '' })
  phone?: string;

  @Prop({ type: String, trim: true, default: '' })
  address?: string;

  @Prop({ type: String, default: '' })
  riderImageUrl?: string;

  @Prop({ type: String, default: '' })
  vehicleImageUrl?: string;

  @Prop({ type: Boolean, default: false })
  isApproved?: boolean;

  @Prop({ type: String, default: null, index: true })
  joinRequestShopId?: string | null;

  @Prop({
    type: String,
    enum: ['none', 'pending', 'rejected'],
    default: 'none',
  })
  joinRequestStatus?: 'none' | 'pending' | 'rejected';
}

export const UserSchema = SchemaFactory.createForClass(User);
