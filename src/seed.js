import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";
const seedPassword = process.env.ADMIN_PASSWORD || process.env.SEED_PASSWORD;
if (!seedPassword || seedPassword.length < 12) throw new Error("ADMIN_PASSWORD is required and must contain at least 12 characters");
const adminEmail = (process.env.ADMIN_EMAIL || "admin@smarthire.com").toLowerCase();
const staffEmail = (process.env.STAFF_EMAIL || "staff@smarthire.com").toLowerCase();
await mongoose.connect(process.env.MONGO_URI);
const password = await bcrypt.hash(seedPassword, 12);
await User.findOneAndUpdate(
  { $or: [{ email: adminEmail }, { email: "admin@interviewflow.com" }] },
  {
    name: "System Administrator",
    email: adminEmail,
    password,
    role: "admin",
    active: true,
  },
  { upsert: true },
);
await User.findOneAndUpdate(
  { $or: [{ email: staffEmail }, { email: "staff@interviewflow.com" }] },
  {
    name: "Interview Coordinator",
    email: staffEmail,
    password,
    role: "staff",
    active: true,
  },
  { upsert: true },
);
console.log(`Seeded ${adminEmail} and ${staffEmail}`);
await mongoose.disconnect();
