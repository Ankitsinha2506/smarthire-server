import mongoose from 'mongoose';

const interviewSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  candidateName: { type: String, required: true, trim: true },
  interviewDate: { type: Date, required: true },
  interviewTime: { type: String, required: true },
  candidateMobile: { type: String, required: true, trim: true },
  candidateEmail: { type: String, required: true, lowercase: true, trim: true },
  technology: { type: String, required: true },
  companyName: { type: String, required: true, trim: true },
  hrName: { type: String, required: true, trim: true },
  hrEmail: { type: String, required: true, lowercase: true, trim: true },
  hrMobile: { type: String, required: true, trim: true },
  rounds: [{ type: String }],
  status: { type: String, enum: ['Scheduled', 'In Progress', 'Selected', 'Placed', 'Rejected', 'On Hold'], default: 'Scheduled' },
  placedAt: Date,
  selectedCompanyName: { type: String, trim: true },
  remarks: { type: String, trim: true },
  resume: { name: String, path: String, mimetype: String },
  introduction: { name: String, path: String, mimetype: String }
}, { timestamps: true });

interviewSchema.index({ candidateName: 'text', candidateEmail: 'text', companyName: 'text', technology: 'text' });
export default mongoose.model('Interview', interviewSchema);
