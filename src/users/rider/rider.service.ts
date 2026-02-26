import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../customer/schemas/order.schema';
import { User, UserDocument } from '../schemas/user.schema';
import { RiderProfileDto } from './dto/rider-profile.dto';
import * as fs from 'fs';
import * as path from 'path';
import { OrderGateway } from '../../realtime/order.gateway';

@Injectable()
export class RiderService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private configService: ConfigService,
    private readonly orderGateway: OrderGateway,
  ) {}

  public deleteFile(relativePath: string) {
    if (!relativePath) return;

    const fileName = path.basename(relativePath); // ป้องกัน ../../
    const absolutePath = path.join(process.cwd(), 'uploads', 'rider', fileName);

    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
        console.log(`Deleted: ${absolutePath}`);
      } catch (err) {
        console.error(`Delete failed:`, err);
      }
    }
  }

  private formatProfileUrls(profile: any) {
    try {
      if (!profile) return null;
      const baseUrl =
        this.configService.get<string>('APP_URL') || 'http://localhost:3000';
      const p =
        typeof profile.toObject === 'function' ? profile.toObject() : profile;

      if (p.riderImageUrl && !p.riderImageUrl.startsWith('http')) {
        p.riderImageUrl = `${baseUrl}${p.riderImageUrl}`;
      }
      if (p.vehicleImageUrl && !p.vehicleImageUrl.startsWith('http')) {
        p.vehicleImageUrl = `${baseUrl}${p.vehicleImageUrl}`;
      }
      return p;
    } catch (error) {
      console.error('Error in formatProfileUrls:', error);
      return profile; // Return original if formatting fails
    }
  }

  async getProfile(riderId: string) {
    if (!riderId || !Types.ObjectId.isValid(riderId)) {
      throw new BadRequestException(
        `ID ไม่ถูกต้อง หรือยังไม่ได้เข้าสู่ระบบ: ${riderId}`,
      );
    }
    const profile = await this.userModel
      .findById(riderId)
      .select(
        '_id email role fullName licensePlate drivingLicense phone address riderImageUrl vehicleImageUrl isApproved',
      )
      .exec();
    if (!profile) {
      throw new NotFoundException('โปรไฟล์ Rider ยังไม่ได้ถูกสร้างตัวตน');
    }
    return this.formatProfileUrls(profile);
  }

  async findRiderById(riderId: string) {
    if (!Types.ObjectId.isValid(riderId)) {
      throw new BadRequestException(`ID ไม่ถูกต้อง: ${riderId}`);
    }
    const profile = await this.userModel
      .findOne({ _id: new Types.ObjectId(riderId), role: 'rider' })
      .select(
        '_id email role fullName licensePlate drivingLicense phone address riderImageUrl vehicleImageUrl isApproved',
      )
      .exec();
    if (!profile) {
      throw new NotFoundException('ไม่พบข้อมูล Rider');
    }
    return this.formatProfileUrls(profile);
  }

  async findAllRiders() {
    const profiles = await this.userModel
      .find({ role: 'rider' })
      .select(
        '_id email role fullName licensePlate drivingLicense phone address riderImageUrl vehicleImageUrl isApproved',
      )
      .exec();
    return profiles.map((p) => this.formatProfileUrls(p));
  }

  async updateProfile(
    id: string,
    dto: RiderProfileDto,
    riderImageUrl?: string,
    vehicleImageUrl?: string,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(
        `ID ที่ส่งมาไม่ถูกต้อง (Invalid ObjectId): ${id}`,
      );
    }

    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('ไม่พบข้อมูล Rider');
    }

    if (riderImageUrl) {
      if ((user as any).riderImageUrl) this.deleteFile((user as any).riderImageUrl);
      (user as any).riderImageUrl = riderImageUrl;
    }

    if (vehicleImageUrl) {
      if ((user as any).vehicleImageUrl) {
        this.deleteFile((user as any).vehicleImageUrl);
      }
      (user as any).vehicleImageUrl = vehicleImageUrl;
    }

    if (dto.fullName !== undefined) (user as any).fullName = dto.fullName;
    if (dto.licensePlate !== undefined)
      (user as any).licensePlate = dto.licensePlate;
    if (dto.drivingLicense !== undefined)
      (user as any).drivingLicense = dto.drivingLicense;
    if (dto.phone !== undefined) (user as any).phone = dto.phone;
    if (dto.address !== undefined) (user as any).address = dto.address;

    await user.save();
    return user;
  }

  async purgeOrphanedFiles(): Promise<{ deletedCount: number }> {
    const uploadDir = path.join(process.cwd(), 'uploads', 'rider');
    if (!fs.existsSync(uploadDir)) return { deletedCount: 0 };

    const files = fs.readdirSync(uploadDir);
    const profiles = await this.userModel
      .find({ role: 'rider' }, 'riderImageUrl vehicleImageUrl')
      .exec();

    // ดึงรายชื่อไฟล์ทั้งหมดที่ยังใช้อยู่ใน DB
    const usedFiles = new Set<string>();
    profiles.forEach((p) => {
      if (p.riderImageUrl) usedFiles.add(path.basename(p.riderImageUrl));
      if (p.vehicleImageUrl) usedFiles.add(path.basename(p.vehicleImageUrl));
    });

    let deletedCount = 0;
    files.forEach((file) => {
      if (!usedFiles.has(file)) {
        try {
          fs.unlinkSync(path.join(uploadDir, file));
          deletedCount++;
        } catch (err) {
          console.error(`Failed to purge file: ${file}`, err);
        }
      }
    });

    return { deletedCount };
  }

  async findAvailableOrders(): Promise<OrderDocument[]> {
    return this.orderModel.find({ status: 'pending', riderId: null }).exec();
  }

  async findRiderTasks(riderId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({ riderId: new Types.ObjectId(riderId) })
      .exec();
  }

  async acceptOrder(orderId: string, riderId: string): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== 'pending' || order.riderId) {
      throw new BadRequestException('Order is no longer available');
    }

    order.riderId = new Types.ObjectId(riderId) as any;
    order.status = 'assigned';
    const saved = await order.save();
    this.orderGateway.emitOrderUpdate(saved);
    return saved;
  }

  async updateStatus(
    orderId: string,
    riderId: string,
    status: string,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(orderId);
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (String(order.riderId || '') !== riderId) {
      throw new BadRequestException('You are not assigned to this order');
    }

    const validTransitions = {
      assigned: ['picked_up', 'cancelled'],
      out_for_delivery: ['completed'],
    };

    if (!validTransitions[order.status]?.includes(status)) {
      throw new BadRequestException(
        `Invalid status transition from ${order.status} to ${status}`,
      );
    }

    order.status = status as any;
    if (status === 'completed') {
      (order as any).completedAt = new Date();
    }
    const saved = await order.save();
    this.orderGateway.emitOrderUpdate(saved);
    return saved;
  }

  async deleteRiderImage(riderId: string) {
    const profile = await this.userModel.findById(riderId);

    if (!profile) throw new NotFoundException();

    if (profile.riderImageUrl) {
      this.deleteFile(profile.riderImageUrl);
      profile.riderImageUrl = '';
      await profile.save();
    }

    return { message: 'Image removed' };
  }

  async deleteProfile(id: string) {
    const isObjectId = Types.ObjectId.isValid(id);
    if (!isObjectId) {
      throw new NotFoundException(
        `ไม่พบโปรไฟล์ที่มี ID: ${id} (รองรับเฉพาะ Rider User ID)`,
      );
    }

    const profile = await this.userModel.findOne({
      _id: new Types.ObjectId(id),
      role: 'rider',
    });

    if (!profile) {
      throw new NotFoundException(
        `ไม่พบโปรไฟล์ที่มี ID: ${id}`,
      );
    }

    if (profile.riderImageUrl) this.deleteFile(profile.riderImageUrl);
    if (profile.vehicleImageUrl) this.deleteFile(profile.vehicleImageUrl);

    profile.fullName = '';
    profile.licensePlate = '';
    profile.drivingLicense = '';
    profile.phone = '';
    profile.address = '';
    profile.riderImageUrl = '';
    profile.vehicleImageUrl = '';
    profile.isApproved = false;
    await profile.save();

    return { message: 'ลบโปรไฟล์และไฟล์ภาพเรียบร้อยแล้ว' };
  }
}
