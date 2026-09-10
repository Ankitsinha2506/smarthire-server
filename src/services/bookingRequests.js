import mongoose from 'mongoose';
import BookingRequest from '../models/BookingRequest.js';
import Interview from '../models/Interview.js';
import AuditLog from '../models/AuditLog.js';

export const bookingFields = ['candidateName','candidateEmail','candidateMobile','interviewDate','interviewTime','technology','companyName','hrName','hrEmail','hrMobile','rounds','selectedCompanyName','remarks','resume','introduction'];
export function staffBookingDetails(body, staffId) {
  return {...Object.fromEntries(bookingFields.filter(key => body[key] !== undefined).map(key => [key, body[key]])), owner: staffId, assignedStaff: [], status: 'Scheduled'};
}

export async function submitStaffBooking(body, staffId) {
  const candidate = new Interview(staffBookingDetails(body, staffId));
  await candidate.validate();
  const details = candidate.toObject();
  delete details._id;
  return BookingRequest.create({staff: staffId, details});
}

// The request decision and confirmed interview commit together. Concurrent
// admin decisions retry against the new status and cannot book the slot twice.
export async function reviewBooking({id, adminId, decision, note = '', ip}) {
  if (!['Approved', 'Rejected'].includes(decision)) throw Object.assign(new Error('Choose approve or reject'), {status: 400});
  if (typeof note !== 'string' || note.length > 1000) throw Object.assign(new Error('Review note must be at most 1000 characters'), {status: 400});
  return mongoose.connection.transaction(async session => {
    const request = await BookingRequest.findById(id).session(session);
    if (!request) throw Object.assign(new Error('Booking request not found'), {status: 404});
    if (request.status !== 'Pending') throw Object.assign(new Error('This request has already been reviewed'), {status: 409});
    let interview;
    if (decision === 'Approved') {
      [interview] = await Interview.create([staffBookingDetails(request.details, request.staff)], {session});
      request.interview = interview._id;
    }
    request.status = decision;
    request.reviewedBy = adminId;
    request.reviewedAt = new Date();
    request.reviewNote = note.trim();
    await request.save({session});
    await AuditLog.create([{user: adminId, action: interview ? 'CREATE' : 'UPDATE', details: {bookingRequestId: request._id, interviewId: interview?._id, candidate: request.details.candidateName, bookingDecision: decision}, ip}], {session});
    return {request: request.toObject(), interview};
  });
}
