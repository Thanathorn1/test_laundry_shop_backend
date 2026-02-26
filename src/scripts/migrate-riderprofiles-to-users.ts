import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing in environment');
  }

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Mongo database connection is not ready');
  }

  const riderProfiles = db.collection('riderprofiles');
  const users = db.collection('users');

  const hasRiderProfiles = (await db.listCollections({ name: 'riderprofiles' }).toArray()).length > 0;
  if (!hasRiderProfiles) {
    console.log('No riderprofiles collection found. Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  const docs = await riderProfiles.find({}).toArray();
  if (!docs.length) {
    console.log('riderprofiles is empty. Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  let migrated = 0;
  let skipped = 0;

  for (const item of docs) {
    const riderId = item?.rider;
    if (!riderId) {
      skipped += 1;
      continue;
    }

    const update: Record<string, unknown> = {
      fullName: item.fullName || '',
      licensePlate: item.licensePlate || '',
      drivingLicense: item.drivingLicense || '',
      phone: item.phone || '',
      address: item.address || '',
      riderImageUrl: item.riderImageUrl || '',
      vehicleImageUrl: item.vehicleImageUrl || '',
      isApproved: Boolean(item.isApproved),
    };

    const result = await users.updateOne(
      { _id: riderId },
      {
        $set: update,
      },
    );

    if (result.matchedCount > 0) {
      migrated += 1;
    } else {
      skipped += 1;
    }
  }

  console.log(`Migrated rider profiles: ${migrated}`);
  console.log(`Skipped rider profiles: ${skipped}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
