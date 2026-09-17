import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  user: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
  source: {type: String, required: true},
  scope: String,
  known: [String],
  unread: [String]
}, {timestamps: true, optimisticConcurrency: true});
schema.index({user: 1, source: 1}, {unique: true});
export default mongoose.model('InterviewNotificationState', schema);
