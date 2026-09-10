import mongoose from 'mongoose';

const validName = value => /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(String(value || '').trim());
const validIndianMobile = value => /^\d{10}$/.test(String(value || '').trim());
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const notPastDate = value => {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.getTime()) && date >= today;
};

const interviewSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedStaff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  candidateName: { type: String, required: true, trim: true, validate: { validator: validName, message: 'Please enter a valid candidate name.' } },
  interviewDate: { type: Date, required: true, validate: { validator: notPastDate, message: 'Interview date cannot be in the past.' } },
  interviewTime: { type: String, required: true },
  candidateMobile: { type: String, required: true, trim: true, validate: { validator: validIndianMobile, message: 'Please enter a valid 10-digit candidate mobile number.' } },
  candidateEmail: { type: String, required: true, lowercase: true, trim: true, validate: { validator: validEmail, message: 'Please enter a valid candidate email address.' } },
  technology: { type: String, required: true },
  companyName: { type: String, required: true, trim: true, validate: { validator: value => /[A-Za-z]/.test(String(value || '')), message: 'Please enter a valid company name.' } },
  hrName: { type: String, required: true, trim: true, validate: { validator: validName, message: 'Please enter a valid HR name.' } },
  hrEmail: { type: String, required: true, lowercase: true, trim: true, validate: { validator: validEmail, message: 'Please enter a valid HR email address.' } },
  hrMobile: { type: String, required: true, trim: true, validate: { validator: validIndianMobile, message: 'Please enter a valid 10-digit HR mobile number.' } },
  rounds: [{ type: String }],
  status: { type: String, enum: ['Scheduled', 'In Progress', 'Selected', 'Placed', 'Rejected', 'On Hold'], default: 'Scheduled' },
  placedAt: Date,
  selectedCompanyName: { type: String, trim: true },
  remarks: { type: String, trim: true },
  resume: { name: String, path: String, mimetype: String },
  introduction: { name: String, path: String, mimetype: String }
}, { timestamps: true });

interviewSchema.index({ candidateName: 'text', candidateEmail: 'text', companyName: 'text', technology: 'text' });
interviewSchema.index({interviewDate: -1, _id: -1});
interviewSchema.index({owner: 1, interviewDate: -1, _id: -1});
interviewSchema.index({assignedStaff: 1, interviewDate: -1});
interviewSchema.index({status: 1, interviewDate: -1, _id: -1});
interviewSchema.index({technology: 1, interviewDate: -1, _id: -1});
interviewSchema.index({candidateEmail: 1});
export default mongoose.model('Interview', interviewSchema);
