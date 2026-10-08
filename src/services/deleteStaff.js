import mongoose from 'mongoose';
import User from '../models/User.js';
import Interview from '../models/Interview.js';
import GoogleSheetAssignment from '../models/GoogleSheetAssignment.js';
import SupportNotification from '../models/SupportNotification.js';
import InterviewNotificationState from '../models/InterviewNotificationState.js';
import BookingRequest from '../models/BookingRequest.js';
import AuditLog from '../models/AuditLog.js';

export async function deleteStaff({id, adminId, ip}) {
  if (!mongoose.isValidObjectId(id)) throw Object.assign(new Error('Invalid staff ID'), {status:400});
  return mongoose.connection.transaction(async session => {
    const staff = await User.findById(id).session(session);
    if (!staff) throw Object.assign(new Error('Staff account not found'), {status:404});
    if (staff.role !== 'staff') throw Object.assign(new Error('Only staff accounts can be deleted'), {status:403});
    const options = {session};
    await Interview.updateMany({assignedStaff:id}, {$pull:{assignedStaff:id}}, options);
    // Preserve staff-created interview records with an existing administrator as owner.
    await Interview.updateMany({owner:id}, {$set:{owner:adminId}}, options);
    await GoogleSheetAssignment.updateMany({assignedStaff:id}, {$pull:{assignedStaff:id}}, options);
    await SupportNotification.deleteMany({staff:id}, options);
    await InterviewNotificationState.deleteMany({user:id}, options);
    await BookingRequest.updateMany({staff:id}, {$set:{deletedStaff:{name:staff.name,email:staff.email}}}, options);
    await BookingRequest.updateMany({staff:id,status:'Pending'}, {$set:{status:'Rejected',reviewedBy:adminId,reviewedAt:new Date(),reviewNote:'Staff account deleted by administrator.'}}, options);
    await AuditLog.create([{user:adminId,action:'DELETE',resource:'staff',details:{staffId:staff._id,name:staff.name,email:staff.email},ip}], options);
    const deletion = await User.deleteOne({_id:id,role:'staff'}, options);
    if (deletion.deletedCount !== 1) throw Object.assign(new Error('Staff account could not be deleted. Refresh and try again.'), {status:409});
    return {message:'Staff account deleted successfully'};
  });
}
