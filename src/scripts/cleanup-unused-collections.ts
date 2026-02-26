import 'dotenv/config';
import mongoose from 'mongoose';

const KEEP_COLLECTIONS = new Set([
  'users',
  'shops',
  'customerorders',
]);

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI is missing in environment');
  }

  const apply = process.argv.includes('--apply');

  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Mongo database connection is not ready');
  }

  const collections = await db.listCollections().toArray();
  const names = collections
    .map((item) => item.name)
    .filter((name) => !name.startsWith('system.'));

  const toDrop = names.filter((name) => !KEEP_COLLECTIONS.has(name));

  console.log('Keep collections:', Array.from(KEEP_COLLECTIONS).join(', '));
  console.log('Found collections:', names.join(', '));

  if (toDrop.length === 0) {
    console.log('No extra collections to remove.');
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    console.log('Dry run only. Collections that would be removed:');
    toDrop.forEach((name) => console.log(`- ${name}`));
    console.log('Run with --apply to actually drop these collections.');
    await mongoose.disconnect();
    return;
  }

  console.log('Dropping collections:');
  for (const name of toDrop) {
    await db.dropCollection(name);
    console.log(`✓ dropped ${name}`);
  }

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
