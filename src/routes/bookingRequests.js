import express from 'express';
import mongoose from 'mongoose';
import BookingRequest from '../models/BookingRequest.js';
import {auth, allow} from '../middleware/auth.js';
import {pagination, pageMeta} from '../utils/pagination.js';
import {reviewBooking} from '../services/bookingRequests.js';
import {appendInterviewToSheet} from './googleSheet.js';

const router = express.Router();
router.use(auth, allow('admin', 'staff'));
const ownRequests = req => req.user.role === 'staff' ? {staff: req.user._id} : {};
router.get('/notifications', async (req, res, next) => {
  try {
    const query = req.user.role === 'admin' ? {status: 'Pending'} : {staff: req.user._id, status: {$in: ['Approved', 'Rejected']}, notificationReadAt: null};
    const [count, items] = await Promise.all([
      BookingRequest.countDocuments(query),
      BookingRequest.find(query).select('staff status details.candidateName details.interviewDate details.interviewTime details.technology reviewedAt createdAt').populate('staff', 'name').sort({updatedAt: -1, _id: -1}).limit(5).lean()
    ]);
    res.json({count, items});
  } catch (error) {next(error)}
});
router.get('/', async (req, res, next) => {
  try {
    const query = ownRequests(req);
    if (['Pending', 'Approved', 'Rejected'].includes(req.query.status)) query.status = req.query.status;
    const {page, limit} = pagination(req.query);
    const {offset, ...meta} = pageMeta(await BookingRequest.countDocuments(query), page, limit);
    const items = await BookingRequest.find(query).populate('staff', 'name email').populate('reviewedBy', 'name').sort({createdAt: -1, _id: -1}).skip(offset).limit(limit).lean();
    res.json({...meta, items});
  } catch (error) {next(error)}
});
router.param('id', (req, res, next, id) => mongoose.isValidObjectId(id) ? next() : res.status(400).json({message: 'Invalid booking request'}));
router.patch('/:id/read', allow('staff'), async (req, res, next) => {
  try {
    const item = await BookingRequest.findOneAndUpdate({_id: req.params.id, staff: req.user._id, status: {$in: ['Approved', 'Rejected']}}, {$set: {notificationReadAt: new Date()}}, {new: true});
    if (!item) return res.status(404).json({message: 'Notification not found'});
    res.json({ok: true});
  } catch (error) {next(error)}
});
router.patch('/:id/review', allow('admin'), async (req, res, next) => {
  try {
    const {request, interview} = await reviewBooking({id: req.params.id, adminId: req.user._id, decision: req.body.decision, note: req.body.note, ip: req.ip});
    let warning;
    if (interview) {
      try {await appendInterviewToSheet(interview)}
      catch (error) {
        warning = 'Slot approved and booked. Google Sheet sync failed; the booking is available in Interviews.';
        await BookingRequest.updateOne({_id: request._id}, {$set: {sheetSyncError: error.message}}).catch(console.error);
      }
    }
    res.json({request, warning});
  } catch (error) {next(error)}
});
export default router;
