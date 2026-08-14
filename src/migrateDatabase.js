import "dotenv/config";
import mongoose from "mongoose";

const sourceName = process.env.DB_SOURCE_NAME || "test";
const targetName = process.env.DB_NAME || "smarthire";

if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
if (sourceName === targetName) throw new Error("Source and target databases must differ");

await mongoose.connect(process.env.MONGO_URI);
const client = mongoose.connection.getClient();
const source = client.db(sourceName);
const target = client.db(targetName);
const collections = await source.listCollections({}, { nameOnly: true }).toArray();

for (const { name } of collections) {
  const documents = await source.collection(name).find({}).toArray();
  if (!documents.length) continue;
  await target.collection(name).bulkWrite(
    documents.map(document => ({
      replaceOne: { filter: { _id: document._id }, replacement: document, upsert: true },
    })),
    { ordered: false },
  );
  console.log(`Copied ${documents.length} document(s) from ${sourceName}.${name} to ${targetName}.${name}`);
}

console.log(`Database migration completed: ${sourceName} -> ${targetName}`);
await mongoose.disconnect();
