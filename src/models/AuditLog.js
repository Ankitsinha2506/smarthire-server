import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['EXPORT', 'IMPORT', 'CREATE', 'UPDATE', 'DELETE'], required: true },
  resource: { type: String, default: 'interviews' },
  details: mongoose.Schema.Types.Mixed,
  ip: String
}, { timestamps: true });

export default mongoose.model('AuditLog', auditLogSchema);
