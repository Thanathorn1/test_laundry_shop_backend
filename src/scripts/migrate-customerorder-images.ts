import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Schema, type Document, type Model } from 'mongoose';

type OrderDoc = Document & {
  _id: mongoose.Types.ObjectId;
  images?: string[];
};

const ORDER_COLLECTION = 'customerorders';

const orderSchema = new Schema<OrderDoc>(
  {
    images: { type: [String], default: [] },
  },
  { collection: ORDER_COLLECTION, strict: false },
);

const OrderModel: Model<OrderDoc> =
  (mongoose.models.MigrationCustomerOrder as Model<OrderDoc>) ||
  mongoose.model<OrderDoc>('MigrationCustomerOrder', orderSchema);

function ensureUploadDir(): string {
  const uploadDir = path.join(process.cwd(), 'uploads', 'customerorder');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
}

function fileExtFromMime(mimeType: string): string {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

async function migrate() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error(
      'MONGO_URI is missing. Set environment before running migration.',
    );
  }

  await mongoose.connect(mongoUri);
  const uploadDir = ensureUploadDir();

  const orders = await OrderModel.find({
    images: { $exists: true, $ne: [] },
  }).exec();

  let scannedOrders = 0;
  let updatedOrders = 0;
  let convertedImages = 0;
  let skippedImages = 0;

  for (const order of orders) {
    scannedOrders += 1;
    const images = Array.isArray(order.images) ? order.images : [];

    let hasChange = false;
    const nextImages = images.map((imageValue) => {
      if (typeof imageValue !== 'string') {
        skippedImages += 1;
        return imageValue as any;
      }

      const dataUrlMatch = imageValue.match(
        /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
      );
      if (!dataUrlMatch) {
        skippedImages += 1;
        return imageValue;
      }

      const mimeType = dataUrlMatch[1];
      const payload = dataUrlMatch[2];
      const ext = fileExtFromMime(mimeType);
      const fileName = `${Date.now()}-${order._id.toString()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const absolutePath = path.join(uploadDir, fileName);

      fs.writeFileSync(absolutePath, Buffer.from(payload, 'base64'));

      hasChange = true;
      convertedImages += 1;
      return `/uploads/customerorder/${fileName}`;
    });

    if (hasChange) {
      order.images = nextImages;
      await order.save();
      updatedOrders += 1;
    }
  }

  console.log('✅ Migration completed');
  console.log(`- Scanned orders: ${scannedOrders}`);
  console.log(`- Updated orders: ${updatedOrders}`);
  console.log(`- Converted images: ${convertedImages}`);
  console.log(
    `- Skipped images (already file URL or invalid): ${skippedImages}`,
  );

  await mongoose.disconnect();
}

migrate().catch(async (error) => {
  console.error('❌ Migration failed:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
