import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  key: {type: String, unique: true, required: true},
  interviewKey: {type: String, required: true, index: true},
  staff: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  kind: {type: String, enum: ['assignment', 'reminder'], required: true},
  details: {candidateName: String, candidateMobile: String, companyName: String, technology: String, start: Date},
  dueAt: {type: Date, required: true},
  cancelled: {type: Boolean, default: false},
  sentAt: Date, readAt: Date, lockedUntil: Date,
  attempts: {type: Number, default: 0}, lastError: String
}, {timestamps: true});
schema.index({cancelled: 1, sentAt: 1, dueAt: 1, lockedUntil: 1});
schema.index({staff: 1, readAt: 1, dueAt: 1});
export default mongoose.model('SupportNotification', schema);
