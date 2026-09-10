import mongoose from 'mongoose';

// Requests are separate from interviews so pending/rejected slots cannot enter
// calendars, analytics, exports, or Google Sheets as confirmed bookings.
const schema = new mongoose.Schema({
  staff: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  details: {type: mongoose.Schema.Types.Mixed, required: true},
  status: {type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending'},
  reviewedBy: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  reviewedAt: Date,
  reviewNote: {type: String, maxlength: 1000, default: ''},
  notificationReadAt: Date,
  interview: {type: mongoose.Schema.Types.ObjectId, ref: 'Interview'},
  sheetSyncError: String
}, {timestamps: true});
schema.index({status: 1, createdAt: -1, _id: -1});
schema.index({staff: 1, createdAt: -1, _id: -1});
schema.index({staff: 1, status: 1, notificationReadAt: 1});
export default mongoose.model('BookingRequest', schema);
