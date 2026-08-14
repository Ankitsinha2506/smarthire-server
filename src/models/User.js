import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'staff', 'user'], default: 'user' },
  permissions: {
    dashboard: { type: Boolean, default: true },
    interviews: { type: Boolean, default: true },
    createInterview: { type: Boolean, default: true },
    exportInterviews: { type: Boolean, default: true },
    selfAssign: { type: Boolean, default: true },
    googleSheet: { type: Boolean, default: false },
    googleSheetScope: { type:String, enum:['today','all'], default:'today' }
  },
  phone: { type: String, trim: true },
  active: { type: Boolean, default: true },
  lastLogin: Date,
  passwordChangedAt: Date,
  passwordResetAt: Date,
  resetOtpHash: { type:String, select:false },
  resetOtpExpires: { type:Date, select:false },
  resetOtpAttempts: { type:Number, default:0, select:false }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
