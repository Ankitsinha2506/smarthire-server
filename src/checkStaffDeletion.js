import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';
import Audit from './models/AuditLog.js';
try {
 await mongoose.connect(process.env.MONGO_URI,{serverSelectionTimeoutMS:10000});
 const logs=await Audit.find({resource:'staff',action:'DELETE'}).sort({createdAt:-1}).limit(10).lean();
 console.log(JSON.stringify({database:mongoose.connection.name,deletions:await Promise.all(logs.map(async log=>({email:log.details?.email,deletedAt:log.createdAt,accountStillExists:!!await User.exists({_id:log.details?.staffId}),emailOwner:await User.findOne({email:log.details?.email}).select('role active createdAt').lean()}))),indexes:await User.collection.indexes()},null,2));
} catch(error) {console.log(error.message)} finally {await mongoose.disconnect()}
