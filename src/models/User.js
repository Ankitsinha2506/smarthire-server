import mongoose from 'mongoose';

const validName = value => /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(String(value || '').trim());
const validIndianMobile = value => /^\d{10}$/.test(String(value || '').trim());

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, validate: { validator: validName, message: 'Please enter a valid name.' } },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address.'] },
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
  phone: { type: String, trim: true, validate: { validator: value => !value || validIndianMobile(value), message: 'Please enter a valid 10-digit phone number.' } },
  active: { type: Boolean, default: true },
  lastLogin: Date,
  passwordChangedAt: Date,
  passwordResetAt: Date,
  resetOtpHash: { type:String, select:false },
  resetOtpExpires: { type:Date, select:false },
  resetOtpAttempts: { type:Number, default:0, select:false }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
