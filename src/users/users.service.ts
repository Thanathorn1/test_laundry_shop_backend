import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as argon2 from 'argon2';
import { User, UserDocument, UserRole } from './admin/schemas/user.schema';
import { Customer, CustomerDocument } from './customer/schemas/customer.schema';
import { Review, ReviewDocument } from './customer/schemas/review.schema';
import { Order, OrderDocument } from './customer/schemas/order.schema';
import { CreateCustomerDto } from './customer/dto/create-customer.dto';
import { Shop } from '../map/schemas/shop.schema';
import { OrderGateway } from '../realtime/order.gateway';

type BanMode = 'unban' | 'permanent' | 'days';

@Injectable()
export class UsersService {
  private readonly DELIVERY_FEE = 50;

  private readonly PICKUP_NOW_EXTRA_FEE = 20;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Shop.name) private shopModel: Model<Shop>,
    private readonly orderGateway: OrderGateway,
  ) {}

  private ensureCustomerOrderUploadDir(): string {
    const uploadDir = path.join(process.cwd(), 'uploads', 'customerorder');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
  }

  private dataUrlToFileExt(mimeType: string): string {
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    return 'jpg';
  }

  private persistOrderImages(images?: string[]): string[] {
    if (!Array.isArray(images) || images.length === 0) return [];

    const uploadDir = this.ensureCustomerOrderUploadDir();

    return images.map((imageValue) => {
      if (typeof imageValue !== 'string') return imageValue as any;

      const dataUrlMatch = imageValue.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
      );
      if (!dataUrlMatch) {
        return imageValue;
      }

      const mimeType = dataUrlMatch[1];
      const base64Payload = dataUrlMatch[2];
      const ext = this.dataUrlToFileExt(mimeType);
      const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const absolutePath = path.join(uploadDir, fileName);

      fs.writeFileSync(absolutePath, Buffer.from(base64Payload, 'base64'));

      return `/uploads/customerorder/${fileName}`;
    });
  }

  private normalizeServiceTimeMinutes(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
      return 50;
    }
    return value;
  }

  private getWashUnitPrice(weightCategory?: string): number {
    if (weightCategory === 'm' || weightCategory === '6-10') return 80;
    if (weightCategory === 'l' || weightCategory === '10-20') return 120;
    return 60;
  }

  private calculateOrderTotalPrice(params: {
    laundryType?: string;
    weightCategory?: string;
    serviceTimeMinutes?: number;
    pickupType?: string;
  }): number {
    const serviceTimeMinutes = this.normalizeServiceTimeMinutes(
      params.serviceTimeMinutes,
    );
    const washUnitPrice = this.getWashUnitPrice(params.weightCategory);
    const washPrice =
      params.laundryType === 'dry'
        ? 0
        : (serviceTimeMinutes / 50) * washUnitPrice;
    const dryPrice = (serviceTimeMinutes / 50) * 20;
    const baseLaundryPrice = washPrice + dryPrice;
    const deliveryFee = this.DELIVERY_FEE;
    const pickupServiceFee =
      params.pickupType === 'now' ? this.PICKUP_NOW_EXTRA_FEE : 0;
    const calculated = baseLaundryPrice + deliveryFee + pickupServiceFee;
    return Math.round(calculated * 100) / 100;
  }

  private validateScheduledPickup(pickupType?: string, pickupAt?: Date | null) {
    if (pickupType !== 'schedule') return;
    if (!pickupAt) {
      throw new BadRequestException(
        'Scheduled pickup must include pickup date/time',
      );
    }

    const oneHourLater = new Date(Date.now() + 60 * 60 * 1000);
    if (pickupAt.getTime() < oneHourLater.getTime()) {
      throw new BadRequestException(
        'Scheduled pickup must be at least 1 hour from now',
      );
    }
  }

  private async getShopMachineStats(shopId: string) {
    const inUseCount = await this.orderModel.countDocuments({
      shopId: new Types.ObjectId(shopId) as any,
      status: { $in: ['at_shop', 'washing', 'drying'] },
    });

    const shop = await this.shopModel
      .findById(shopId)
      .select('_id totalWashingMachines approvalStatus')
      .lean()
      .exec();

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const totalWashingMachines = Math.max(
      1,
      Number((shop as any).totalWashingMachines) || 10,
    );
    const machineInUse = Math.max(0, Number(inUseCount) || 0);
    const machineAvailable = Math.max(0, totalWashingMachines - machineInUse);

    return {
      shop,
      totalWashingMachines,
      machineInUse,
      machineAvailable,
    };
  }

  private async ensureShopSelectableForOrder(
    order: OrderDocument,
    shopId: string,
  ) {
    const { shop, machineAvailable } = await this.getShopMachineStats(shopId);

    if ((shop as any).approvalStatus !== 'approved') {
      throw new BadRequestException('Shop is not approved yet');
    }

    const isPriorityService = order.pickupType === 'now';
    if (isPriorityService && machineAvailable <= 0) {
      throw new BadRequestException(
        'Selected shop has no empty washing machine for priority service',
      );
    }
  }

  async listVisibleShopsForUser(userId: string) {
    const user = (await this.userModel
      .findById(userId)
      .select('_id role')
      .lean()
      .exec()) as any;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const allShops = (await this.shopModel.find().sort({ createdAt: -1 }).lean()) as any[];
    const shopIds = allShops
      .map((shop) => (shop?._id ? new Types.ObjectId(String(shop._id)) : null))
      .filter((value): value is Types.ObjectId => Boolean(value));

    const usage =
      shopIds.length > 0
        ? await this.orderModel.aggregate([
            {
              $match: {
                shopId: { $in: shopIds as any },
                status: { $in: ['at_shop', 'washing', 'drying'] },
              },
            },
            {
              $group: {
                _id: '$shopId',
                machineInUse: { $sum: 1 },
              },
            },
          ])
        : [];

    const usageByShopId = new Map<string, number>(
      usage.map((item: any) => [String(item._id), Number(item.machineInUse) || 0]),
    );

    const enriched = allShops.map((shop: any) => {
      const totalWashingMachines = Math.max(
        1,
        Number(shop?.totalWashingMachines) || 10,
      );
      const machineInUse = usageByShopId.get(String(shop._id)) || 0;
      const machineAvailable = Math.max(0, totalWashingMachines - machineInUse);

      return {
        ...shop,
        totalWashingMachines,
        machineInUse,
        machineAvailable,
      };
    });

    if (user.role === 'admin') {
      return enriched;
    }

    if (user.role === 'employee') {
      return enriched.filter(
        (shop: any) =>
          shop.approvalStatus === 'approved' ||
          (shop.approvalStatus === 'pending' && String(shop.ownerId) === String(user._id)),
      );
    }

    return enriched.filter((shop: any) => shop.approvalStatus === 'approved');
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  // ใช้ตอน login: ต้องดึง passwordHash และ refreshTokenHash

  findByEmailWithSecrets(email: string) {
    return this.userModel
      .findOne({ email })
      .select('+passwordHash +refreshTokenHash')
      .exec();
  }

  findByEmailWithAuthSecrets(email: string) {
    return (
      this.userModel
        .findOne({ email })
        // IMPORTANT: using inclusion select() excludes other fields unless explicitly listed.
        // Sign-in requires role/email for role enforcement and token generation.
        .select(
          'email role +passwordHash +refreshTokenHash isBanned banStartAt banEndAt',
        )
        .exec()
    );
  }

  findByEmailForReset(email: string) {
    return this.userModel
      .findOne({ email })
      .select('+resetPasswordTokenHash +resetPasswordExpiresAt')
      .exec();
  }

  // ใช้ตอน refresh: ต้องดึง refreshTokenHash

  findByIdWithRefresh(userId: string) {
    return this.userModel.findById(userId).select('+refreshTokenHash').exec();
  }

  // สร้างผู้ใช้ใหม่ โดยกำหนด role ได้

  create(data: {
    email: string;
    passwordHash: string;
    role?: UserRole;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }) {
    return this.userModel.create({
      email: data.email,

      passwordHash: data.passwordHash,

      role: data.role ?? 'user',

      firstName: data.firstName ?? '',

      lastName: data.lastName ?? '',

      phoneNumber: data.phoneNumber ?? '',
    });
  }

  // อัพเดท refreshTokenHash

  setRefreshTokenHash(userId: string, refreshTokenHash: string | null) {
    return this.userModel
      .updateOne({ _id: userId }, { refreshTokenHash })
      .exec();
  }

  setPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date) {
    return this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            resetPasswordTokenHash: tokenHash,
            resetPasswordExpiresAt: expiresAt,
          },
        },
      )
      .exec();
  }

  findByResetPasswordTokenHash(tokenHash: string) {
    return this.userModel
      .findOne({ resetPasswordTokenHash: tokenHash })
      .select('+passwordHash +resetPasswordTokenHash +resetPasswordExpiresAt')
      .exec();
  }

  async updatePasswordByUserId(userId: string, passwordHash: string) {
    await this.userModel
      .updateOne(
        { _id: userId },
        {
          $set: {
            passwordHash,
            refreshTokenHash: null,
            resetPasswordTokenHash: null,
            resetPasswordExpiresAt: null,
          },
        },
      )
      .exec();
  }

  // อัพเดทบทบาทผู้ใช้

  setRole(userId: string, role: UserRole) {
    return this.userModel.updateOne({ _id: userId }, { role }).exec();
  }

  findUserById(userId: string) {
    return this.userModel.findById(userId).exec();
  }

  async listUsersByRole(role: UserRole) {
    const users = await this.userModel
      .find({ role })
      .select('-passwordHash -refreshTokenHash')
      .sort({ createdAt: -1 })
      .exec();

    const now = new Date();
    for (const user of users) {
      if (user.isBanned && user.banEndAt && user.banEndAt <= now) {
        await this.userModel
          .updateOne(
            { _id: user._id },
            { $set: { isBanned: false, banStartAt: null, banEndAt: null } },
          )
          .exec();
        user.isBanned = false;
        user.banStartAt = null;
        user.banEndAt = null;
      }
    }

    return users;
  }

  async listEmployeesByShop() {
    const [employees, shops] = await Promise.all([
      this.userModel
        .find({ role: 'employee' })
        .select('-passwordHash -refreshTokenHash')
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.shopModel
        .find()
        .select('_id shopName label phoneNumber')
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    ]);

    const shopsById = new Map(
      shops.map((shop: any) => [String(shop._id), shop]),
    );
    const employeesByShop = new Map<string, any[]>();
    const unassignedEmployees: any[] = [];

    for (const employee of employees as any[]) {
      const assignedShopId =
        typeof employee.assignedShopId === 'string'
          ? employee.assignedShopId
          : '';
      const assignedShopIds = Array.isArray(employee.assignedShopIds)
        ? employee.assignedShopIds.map(String)
        : [];

      const memberShopIds = new Set<string>([
        ...assignedShopIds.filter(Boolean),
        ...(assignedShopId ? [assignedShopId] : []),
      ]);

      const validShopIds = Array.from(memberShopIds).filter((id) =>
        shopsById.has(String(id)),
      );
      if (validShopIds.length === 0) {
        unassignedEmployees.push(employee);
        continue;
      }

      for (const shopId of validShopIds) {
        const bucket = employeesByShop.get(shopId) || [];
        bucket.push(employee);
        employeesByShop.set(shopId, bucket);
      }
    }

    return {
      shops: shops.map((shop: any) => ({
        ...shop,
        employees: employeesByShop.get(String(shop._id)) || [],
      })),
      unassignedEmployees,
      employees,
    };
  }

  async adminAssignEmployeeToShop(employeeId: string, shopId?: string | null) {
    const employee = await this.userModel
      .findOne({ _id: employeeId, role: 'employee' })
      .select('-passwordHash -refreshTokenHash')
      .exec();

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    let normalizedShopId: string | null = null;

    if (typeof shopId === 'string' && shopId.trim()) {
      const incomingShopId = shopId.trim();
      const shop = await this.shopModel
        .findById(incomingShopId)
        .select('_id')
        .lean()
        .exec();
      if (!shop) {
        throw new NotFoundException('Shop not found');
      }
      normalizedShopId = incomingShopId;
    }

    const update: any = { $set: { assignedShopId: normalizedShopId } };
    if (normalizedShopId) {
      update.$addToSet = { assignedShopIds: normalizedShopId };
    } else {
      // If admin unassigns, also clear membership list to match previous single-shop behavior.
      update.$set.assignedShopIds = [];
    }

    const updated = await this.userModel
      .findByIdAndUpdate(employeeId, update, { new: true })
      .select('-passwordHash -refreshTokenHash')
      .lean()
      .exec();

    return updated;
  }

  async employeeRequestJoinShop(employeeId: string, shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestException('Invalid shopId');
    }

    const [employee, shop] = await Promise.all([
      this.userModel.findOne({ _id: employeeId, role: 'employee' }).exec(),
      this.shopModel.findById(shopId).select('_id').lean().exec(),
    ]);

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const assignedShopId =
      typeof (employee as any).assignedShopId === 'string'
        ? String((employee as any).assignedShopId)
        : '';
    const assignedShopIds = Array.isArray((employee as any).assignedShopIds)
      ? (employee as any).assignedShopIds.map(String)
      : [];
    const isAlreadyMember =
      assignedShopId === shopId || assignedShopIds.includes(String(shopId));
    if (isAlreadyMember) {
      return employee;
    }

    employee.joinRequestShopId = shopId;
    employee.joinRequestStatus = 'pending';
    await employee.save();

    return this.userModel
      .findById(employeeId)
      .select('-passwordHash -refreshTokenHash')
      .lean()
      .exec();
  }

  async listEmployeeJoinRequestsForShop(shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestException('Invalid shopId');
    }

    return this.userModel
      .find({
        role: 'employee',
        joinRequestStatus: 'pending',
        joinRequestShopId: shopId,
      })
      .select('-passwordHash -refreshTokenHash')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async listEmployeeJoinRequestsForAdmin() {
    const [requests, shops] = await Promise.all([
      this.userModel
        .find({
          role: 'employee',
          joinRequestStatus: 'pending',
          joinRequestShopId: { $ne: null },
        })
        .select('-passwordHash -refreshTokenHash')
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
      this.shopModel.find().select('_id shopName label').lean().exec(),
    ]);

    const shopById = new Map(
      shops.map((shop: any) => [String(shop._id), shop]),
    );

    return requests.map((item: any) => ({
      ...item,
      requestedShop: item.joinRequestShopId
        ? shopById.get(String(item.joinRequestShopId)) || null
        : null,
    }));
  }

  async resolveEmployeeJoinRequest(
    actorUserId: string,
    employeeId: string,
    action: 'approve' | 'reject',
  ) {
    const actor = await this.userModel.findById(actorUserId).exec();
    if (!actor) {
      throw new NotFoundException('Actor not found');
    }

    const employee = await this.userModel
      .findOne({ _id: employeeId, role: 'employee' })
      .exec();
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    if (
      employee.joinRequestStatus !== 'pending' ||
      !employee.joinRequestShopId
    ) {
      throw new BadRequestException(
        'No pending join request for this employee',
      );
    }

    const requestedShopId = employee.joinRequestShopId;
    const actorAssignedShopId =
      typeof (actor as any).assignedShopId === 'string'
        ? String((actor as any).assignedShopId)
        : '';
    const actorAssignedShopIds = Array.isArray((actor as any).assignedShopIds)
      ? (actor as any).assignedShopIds.map(String)
      : [];
    const actorIsMemberOfRequestedShop =
      actorAssignedShopId === String(requestedShopId) ||
      actorAssignedShopIds.includes(String(requestedShopId));

    const canApprove =
      actor.role === 'admin' ||
      (actor.role === 'employee' && actorIsMemberOfRequestedShop);
    if (!canApprove) {
      throw new ForbiddenException('Not allowed to resolve this join request');
    }

    if (action === 'approve') {
      const previousAssignedShopId =
        typeof (employee as any).assignedShopId === 'string'
          ? String((employee as any).assignedShopId)
          : '';
      employee.assignedShopId = requestedShopId;
      const currentMembership = Array.isArray((employee as any).assignedShopIds)
        ? (employee as any).assignedShopIds.map(String)
        : [];

      if (
        previousAssignedShopId &&
        !currentMembership.includes(previousAssignedShopId)
      ) {
        currentMembership.push(previousAssignedShopId);
      }
      if (!currentMembership.includes(String(requestedShopId))) {
        currentMembership.push(String(requestedShopId));
      }
      (employee as any).assignedShopIds = currentMembership;
      employee.joinRequestShopId = null;
      employee.joinRequestStatus = 'none';
    } else {
      employee.joinRequestStatus = 'rejected';
    }

    await employee.save();

    return this.userModel
      .findById(employeeId)
      .select('-passwordHash -refreshTokenHash')
      .lean()
      .exec();
  }

  async adminChangeUserRole(userId: string, role: UserRole) {
    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: { role } }, { new: true })
      .select('-passwordHash -refreshTokenHash')
      .exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async adminCreateEmployee(email: string, password: string) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    if (!password || password.trim().length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const existing = await this.userModel
      .findOne({ email: normalizedEmail })
      .lean()
      .exec();
    if (existing) {
      throw new BadRequestException('Email already exists');
    }

    const passwordHash = await argon2.hash(password.trim());

    const created = await this.userModel.create({
      email: normalizedEmail,
      passwordHash,
      role: 'employee',
    });

    const safeUser = await this.userModel
      .findById(created._id)
      .select('-passwordHash -refreshTokenHash')
      .lean()
      .exec();

    return safeUser;
  }

  async adminSetUserBan(
    userId: string,
    payload: { mode: BanMode; days?: number },
  ) {
    const now = new Date();
    let updateData: any;

    if (payload.mode === 'unban') {
      updateData = { isBanned: false, banStartAt: null, banEndAt: null };
    } else if (payload.mode === 'permanent') {
      updateData = { isBanned: true, banStartAt: now, banEndAt: null };
    } else {
      const days = Number(payload.days);
      if (!Number.isFinite(days) || days <= 0) {
        throw new BadRequestException('Days must be a number greater than 0');
      }
      const banEndAt = new Date(
        now.getTime() + Math.floor(days) * 24 * 60 * 60 * 1000,
      );
      updateData = { isBanned: true, banStartAt: now, banEndAt };
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: updateData }, { new: true })
      .select('-passwordHash -refreshTokenHash')
      .exec();
    if (!updated) throw new NotFoundException('User not found');
    return updated;
  }

  async enforceBanStateForSignIn(user: UserDocument) {
    if (!user.isBanned) return false;

    if (user.banEndAt && new Date(user.banEndAt) <= new Date()) {
      await this.userModel
        .updateOne(
          { _id: user._id },
          { $set: { isBanned: false, banStartAt: null, banEndAt: null } },
        )
        .exec();
      return false;
    }

    return true;
  }

  async adminChangeUserPassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.trim().length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const passwordHash = await argon2.hash(newPassword.trim());
    const updated = await this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { passwordHash, refreshTokenHash: null } },
        { new: true },
      )
      .select('-passwordHash -refreshTokenHash')
      .exec();
    if (!updated) throw new NotFoundException('User not found');
    return { success: true, user: updated };
  }

  async adminDeleteUser(userId: string) {
    const deletedUser = await this.userModel.findByIdAndDelete(userId).exec();
    if (!deletedUser) throw new NotFoundException('User not found');

    const customer = await this.customerModel
      .findOneAndDelete({ userId: deletedUser._id as any })
      .exec();
    await this.customerModel
      .findOneAndDelete({ userId: String(deletedUser._id) as any })
      .exec();
    await this.orderModel
      .deleteMany({ customerId: deletedUser._id as any })
      .exec();
    await this.orderModel
      .deleteMany({ customerId: String(deletedUser._id) as any })
      .exec();

    if (customer?._id) {
      await this.reviewModel
        .deleteMany({ customerId: customer._id as any })
        .exec();
      await this.reviewModel
        .deleteMany({ customerId: String(customer._id) as any })
        .exec();
    }

    return { success: true };
  }

  async upsertUserProfile(userId: string, data: Partial<CreateCustomerDto>) {
    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phoneNumber !== undefined)
      updateData.phoneNumber = data.phoneNumber;
    if (data.profileImage !== undefined)
      updateData.profileImage = data.profileImage;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.latitude !== undefined && data.longitude !== undefined) {
      updateData.location = {
        type: 'Point',
        coordinates: [data.longitude, data.latitude],
      };
    }

    await this.userModel
      .updateOne({ _id: userId }, { $set: updateData })
      .exec();
    return this.userModel.findById(userId).exec();
  }

  async addUserSavedAddress(
    userId: string,
    label: string,
    address: string,
    latitude: number,
    longitude: number,
    isDefault: boolean = false,
    contactPhone?: string,
    pickupType?: 'now' | 'schedule',
    pickupAt?: string | null,
  ) {
    const trimmedLabel = label.trim();
    const labelKey = trimmedLabel.toLowerCase();

    const newAddress = {
      label: trimmedLabel,
      address,
      coordinates: [longitude, latitude],
      isDefault,
      contactPhone: contactPhone || '',
      pickupType: pickupType || 'now',
      pickupAt: pickupAt ? new Date(pickupAt) : null,
    };

    const user = await this.userModel
      .findById(userId)
      .select('savedAddresses')
      .lean()
      .exec();
    const currentAddresses = (user?.savedAddresses || []) as any[];

    let mergedAddresses = currentAddresses.filter((item) => {
      const itemLabel =
        typeof item?.label === 'string' ? item.label.trim().toLowerCase() : '';
      return itemLabel !== labelKey;
    });

    if (isDefault) {
      mergedAddresses = mergedAddresses.map((item) => ({
        ...item,
        isDefault: false,
      }));
    }

    mergedAddresses.push(newAddress);

    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { savedAddresses: mergedAddresses } },
        { new: true },
      )
      .exec();
  }

  // ===== CUSTOMER METHODS =====

  findCustomerByUserId(userId: string) {
    const query = Types.ObjectId.isValid(userId)
      ? { $or: [{ userId: new Types.ObjectId(userId) }, { userId }] }
      : { userId };

    return this.customerModel
      .findOne(query as any)
      .populate('userId')
      .exec();
  }

  findCustomerById(customerId: string) {
    return this.customerModel
      .findById(new Types.ObjectId(customerId))
      .populate('userId')
      .exec();
  }

  createCustomer(
    userId: string,
    data: Omit<CreateCustomerDto, 'email' | 'password'>,
  ) {
    const location = {
      type: 'Point' as const,
      coordinates: [data.longitude ?? 100.5018, data.latitude ?? 13.7563],
    };

    return this.customerModel.create({
      userId: Types.ObjectId.isValid(userId)
        ? new Types.ObjectId(userId)
        : (userId as any),
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber,
      profileImage: data.profileImage || null,
      location,
      address: data.address || null,
    });
  }

  updateCustomer(customerId: string, data: Partial<CreateCustomerDto>) {
    const updateData: any = {};

    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.phoneNumber) updateData.phoneNumber = data.phoneNumber;
    if (data.profileImage) updateData.profileImage = data.profileImage;
    if (data.address) updateData.address = data.address;

    if (data.latitude && data.longitude) {
      updateData.location = {
        type: 'Point',
        coordinates: [data.longitude, data.latitude],
      };
    }

    return this.customerModel
      .findByIdAndUpdate(new Types.ObjectId(customerId), updateData, {
        new: true,
      })
      .exec();
  }

  addSavedAddress(
    customerId: string,
    label: string,
    address: string,
    latitude: number,
    longitude: number,
    isDefault: boolean = false,
  ) {
    const newAddress = {
      label,
      address,
      coordinates: [longitude, latitude],
      isDefault,
    };

    if (isDefault) {
      return this.customerModel
        .findByIdAndUpdate(
          new Types.ObjectId(customerId),
          {
            $set: { 'savedAddresses.$[].isDefault': false },
            $push: { savedAddresses: newAddress },
          },
          { new: true },
        )
        .exec();
    }

    return this.customerModel
      .findByIdAndUpdate(
        new Types.ObjectId(customerId),
        { $push: { savedAddresses: newAddress } },
        { new: true },
      )
      .exec();
  }

  findNearbyCustomers(
    longitude: number,
    latitude: number,
    maxDistance: number = 5000,
  ) {
    return this.customerModel
      .find({
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [longitude, latitude],
            },
            $maxDistance: maxDistance,
          },
        },
      })
      .exec();
  }

  // ===== ORDER METHODS =====

  async createOrder(customerId: string, data: any) {
    const pickupLocation = {
      type: 'Point' as const,
      coordinates: [data.pickupLongitude, data.pickupLatitude],
    };

    const deliveryLocation =
      data.deliveryLatitude && data.deliveryLongitude
        ? {
            type: 'Point' as const,
            coordinates: [data.deliveryLongitude, data.deliveryLatitude],
          }
        : undefined;

    const savedImages = this.persistOrderImages(data.images);
    const pickupType = data.pickupType || 'now';
    const pickupAt = data.pickupAt ? new Date(data.pickupAt) : null;

    this.validateScheduledPickup(pickupType, pickupAt);

    const laundryType = data.laundryType || 'wash';
    const weightCategory = data.weightCategory || 's';
    const serviceTimeMinutes = this.normalizeServiceTimeMinutes(
      data.serviceTimeMinutes,
    );
    const totalPrice = this.calculateOrderTotalPrice({
      laundryType,
      weightCategory,
      serviceTimeMinutes,
      pickupType,
    });

    const created = await this.orderModel.create({
      customerId: Types.ObjectId.isValid(customerId)
        ? new Types.ObjectId(customerId)
        : (customerId as any),
      productName: data.productName,
      contactPhone: data.contactPhone || '',
      laundryType,
      weightCategory,
      serviceTimeMinutes,
      description: data.description || '',
      images: savedImages,
      pickupLocation,
      pickupAddress: data.pickupAddress || null,
      pickupType,
      pickupAt,
      ...(deliveryLocation ? { deliveryLocation } : {}),
      deliveryAddress: data.deliveryAddress || null,
      status: 'pending',
      totalPrice,
    });

    // Notify all riders about the new pending order
    this.orderGateway.emitOrderUpdate(created);

    return created;
  }

  findOrderById(orderId: string) {
    return this.orderModel.findById(orderId).exec();
  }

  async updateOrder(orderId: string, data: any) {
    const existingOrder = await this.orderModel.findById(orderId).exec();
    if (!existingOrder) {
      throw new NotFoundException('Order not found');
    }

    const updateData: any = {};
    if (data.productName) updateData.productName = data.productName;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.images !== undefined)
      updateData.images = this.persistOrderImages(data.images);
    if (data.contactPhone) updateData.contactPhone = data.contactPhone;
    if (data.laundryType !== undefined)
      updateData.laundryType = data.laundryType;
    if (data.weightCategory !== undefined)
      updateData.weightCategory = data.weightCategory;
    if (data.serviceTimeMinutes !== undefined)
      updateData.serviceTimeMinutes = data.serviceTimeMinutes;
    if (data.pickupAddress !== undefined)
      updateData.pickupAddress = data.pickupAddress;
    if (data.pickupType) updateData.pickupType = data.pickupType;
    if (data.pickupAt !== undefined)
      updateData.pickupAt = data.pickupAt ? new Date(data.pickupAt) : null;
    if (
      data.pickupLatitude !== undefined &&
      data.pickupLongitude !== undefined
    ) {
      updateData.pickupLocation = {
        type: 'Point',
        coordinates: [data.pickupLongitude, data.pickupLatitude],
      };
    }

    const nextLaundryType =
      data.laundryType !== undefined
        ? data.laundryType
        : existingOrder.laundryType;
    const nextWeightCategory =
      data.weightCategory !== undefined
        ? data.weightCategory
        : existingOrder.weightCategory;
    const nextServiceTimeMinutes =
      data.serviceTimeMinutes !== undefined
        ? this.normalizeServiceTimeMinutes(data.serviceTimeMinutes)
        : this.normalizeServiceTimeMinutes(existingOrder.serviceTimeMinutes);
    const nextPickupType =
      data.pickupType !== undefined ? data.pickupType : existingOrder.pickupType;
    const nextPickupAt =
      data.pickupAt !== undefined
        ? data.pickupAt
          ? new Date(data.pickupAt)
          : null
        : existingOrder.pickupAt;

    this.validateScheduledPickup(nextPickupType, nextPickupAt);

    if (data.serviceTimeMinutes !== undefined) {
      updateData.serviceTimeMinutes = nextServiceTimeMinutes;
    }

    updateData.totalPrice = this.calculateOrderTotalPrice({
      laundryType: nextLaundryType,
      weightCategory: nextWeightCategory,
      serviceTimeMinutes: nextServiceTimeMinutes,
      pickupType: nextPickupType,
    });

    return this.orderModel
      .findByIdAndUpdate(orderId, updateData, { new: true })
      .exec();
  }

  deleteOrder(orderId: string) {
    return this.orderModel.findByIdAndDelete(orderId).exec();
  }

  async updateOrderStatus(orderId: string, status: string) {
    const updated = await this.orderModel
      .findByIdAndUpdate(
        orderId,
        { status, ...(status === 'completed' && { completedAt: new Date() }) },
        { new: true },
      )
      .exec();

    if (updated) {
      this.orderGateway.emitOrderUpdate(updated);
    }
    return updated;
  }

  getCustomerOrders(customerId: string, status?: string) {
    const query: any = Types.ObjectId.isValid(customerId)
      ? {
          $or: [{ customerId: new Types.ObjectId(customerId) }, { customerId }],
        }
      : { customerId };
    if (status) query.status = status;

    return this.orderModel.find(query).sort({ createdAt: -1 }).exec();
  }

  // ===== REVIEW METHODS =====

  createReview(customerId: string, data: any) {
    return this.reviewModel.create({
      customerId: customerId as any,
      reviewType: data.reviewType,
      targetId: data.targetId || null,
      rating: data.rating,
      comment: data.comment || '',
      isAnonymous: data.isAnonymous || false,
    });
  }

  getReviews(targetId: string, reviewType: string) {
    return this.reviewModel
      .find({ targetId, reviewType, status: 'approved' })
      .sort({ createdAt: -1 })
      .exec();
  }

  getCustomerReviews(customerId: string) {
    return this.reviewModel
      .find({ customerId } as any)
      .sort({ createdAt: -1 })
      .exec();
  }

  updateAverageRating(customerId: string) {
    return this.reviewModel.aggregate([
      { $match: { customerId: new Types.ObjectId(customerId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]);
  }

  async riderHandoverToShop(orderId: string, riderId: string, shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestException('Invalid shopId');
    }

    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (!order.riderId || String(order.riderId) !== riderId) {
      throw new BadRequestException('Order is not assigned to this rider');
    }

    if (!['picked_up', 'assigned'].includes(order.status)) {
      throw new BadRequestException('Order is not ready for shop handover');
    }

    await this.ensureShopSelectableForOrder(order, shopId);

    order.shopId = new Types.ObjectId(shopId) as any;
    order.status = 'at_shop';
    await order.save();

    this.orderGateway.emitOrderUpdate(order);

    return order;
  }

  async riderSelectShop(
    orderId: string,
    riderId: string,
    shopId: string | null,
  ) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (!order.riderId || String(order.riderId) !== riderId) {
      throw new BadRequestException('Order is not assigned to this rider');
    }

    if (!['picked_up', 'assigned'].includes(order.status)) {
      throw new BadRequestException(
        'Shop selection is allowed only before handover',
      );
    }

    if (shopId && shopId.trim()) {
      const normalizedShopId = shopId.trim();
      if (!Types.ObjectId.isValid(normalizedShopId)) {
        throw new BadRequestException('Invalid shopId');
      }

      await this.ensureShopSelectableForOrder(order, normalizedShopId);

      order.shopId = new Types.ObjectId(normalizedShopId) as any;
    } else {
      order.shopId = null as any;
    }

    await order.save();
    this.orderGateway.emitOrderUpdate(order);
    return order;
  }

  async riderStartDeliveryBack(orderId: string, riderId: string) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (!order.riderId || String(order.riderId) !== riderId) {
      throw new BadRequestException('Order is not assigned to this rider');
    }

    if (order.status !== 'laundry_done') {
      throw new BadRequestException('Laundry is not completed yet');
    }

    order.status = 'out_for_delivery';
    await order.save();

    this.orderGateway.emitOrderUpdate(order);
    return order;
  }

  async riderCompleteDelivery(orderId: string, riderId: string) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (!order.riderId || String(order.riderId) !== riderId) {
      throw new BadRequestException('Order is not assigned to this rider');
    }

    if (order.status !== 'out_for_delivery') {
      throw new BadRequestException('Order is not out for delivery');
    }

    order.status = 'completed';
    order.completedAt = new Date();
    await order.save();

    this.orderGateway.emitOrderUpdate(order);
    return order;
  }

  async listNearbyShopsForEmployee(
    employeeId: string,
    lat?: number,
    lng?: number,
    maxDistanceKm = 8,
  ) {
    const user = (await this.userModel
      .findById(employeeId)
      .select('assignedShopId role')
      .lean()
      .exec()) as any;

    const assignedShopId =
      typeof user?.assignedShopId === 'string' ? user.assignedShopId : '';
    const isAdminActor = user?.role === 'admin';
    const isEmployeeActor = user?.role === 'employee';
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    if (isAdminActor || isEmployeeActor) {
      const approvalFilter = isAdminActor
        ? {}
        : { approvalStatus: 'approved' };

      if (hasCoords) {
        const allShopsWithDistance = await this.shopModel.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
              distanceField: 'distanceMeters',
              ...(isAdminActor ? {} : { query: approvalFilter }),
              spherical: true,
            },
          },
          {
            $addFields: {
              distanceKm: {
                $round: [{ $divide: ['$distanceMeters', 1000] }, 2],
              },
            },
          },
        ]);
        return allShopsWithDistance;
      }

      return this.shopModel
        .find(approvalFilter as any)
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    }

    let nearbyShops: any[] = [];
    if (hasCoords) {
      const maxDistanceMeters = Math.max(0.2, maxDistanceKm) * 1000;
      nearbyShops = await this.shopModel.aggregate([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [Number(lng), Number(lat)] },
            distanceField: 'distanceMeters',
            maxDistance: maxDistanceMeters,
            spherical: true,
          },
        },
        {
          $addFields: {
            distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 2] },
          },
        },
      ]);
    }

    if (!assignedShopId || !Types.ObjectId.isValid(assignedShopId)) {
      return nearbyShops;
    }

    const alreadyIncluded = nearbyShops.some(
      (item) => String(item?._id) === assignedShopId,
    );
    if (alreadyIncluded) {
      return nearbyShops;
    }

    const assignedShop = await this.shopModel
      .findById(assignedShopId)
      .lean()
      .exec();
    if (!assignedShop) {
      return nearbyShops;
    }

    return [
      {
        ...assignedShop,
        distanceKm: hasCoords ? null : null,
      },
      ...nearbyShops,
    ];
  }

  async listEmployeeShopOrders(shopId: string) {
    if (!Types.ObjectId.isValid(shopId)) {
      throw new BadRequestException('Invalid shopId');
    }

    return this.orderModel
      .find({ shopId: new Types.ObjectId(shopId) as any })
      .populate('customerId', 'firstName lastName phoneNumber')
      .populate('employeeId', 'firstName lastName email phoneNumber')
      .sort({ createdAt: -1 })
      .exec();
  }

  async employeeStartWash(orderId: string, employeeId: string) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'at_shop') {
      throw new BadRequestException('Order is not at shop');
    }

    order.employeeId = new Types.ObjectId(employeeId) as any;
    order.status = order.laundryType === 'dry' ? 'drying' : 'washing';
    if (!order.washingStartedAt) {
      order.washingStartedAt = new Date();
    }
    await order.save();

    this.orderGateway.emitOrderUpdate(order);
    return order;
  }

  async employeeFinishWash(orderId: string, employeeId: string) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (order.laundryType === 'dry') {
      throw new BadRequestException('Dry order must be finished via finish-dry');
    }

    if (order.status !== 'washing') {
      throw new BadRequestException('Order is not in washing process');
    }

    order.employeeId = new Types.ObjectId(employeeId) as any;
    order.status = 'drying';
    if (!order.washingStartedAt) {
      order.washingStartedAt = new Date();
    }
    await order.save();

    this.orderGateway.emitOrderUpdate(order);
    return order;
  }

  async employeeFinishDry(orderId: string, employeeId: string) {
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== 'drying') {
      throw new BadRequestException('Order is not in drying process');
    }

    order.employeeId = new Types.ObjectId(employeeId) as any;
    order.status = 'laundry_done';
    if (!order.washingStartedAt) {
      order.washingStartedAt = new Date();
    }
    order.washingCompletedAt = new Date();
    await order.save();

    this.orderGateway.emitOrderUpdate(order);
    return order;
  }
}
