import express from 'express';
import Interview from '../models/Interview.js';
import State from '../models/InterviewNotificationState.js';
import {auth, allow} from '../middleware/auth.js';
import {getNormalizedSheetItems} from './googleSheet.js';
import {reconcileNotifications} from '../services/interviewNotifications.js';

const router = express.Router();
router.use(auth, allow('admin', 'staff'));
const permitted = user => user.role === 'admin' || user.permissions?.interviews !== false;

async function refresh(user, source, items, scope) {
  const keys = items.map(item => String(item._id));
  // Optimistic concurrency prevents another tab's refresh or read action from
  // being overwritten. The unique index also protects first-time initialization.
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await State.findOne({user: user._id, source});
    const next = reconcileNotifications(state, keys, scope);
    try {
      if (state) {
        if (state.scope !== next.scope || state.known.length !== next.known.length || state.unread.length !== next.unread.length) {
          Object.assign(state, next); await state.save();
        }
      }
      else await State.create({user: user._id, source, ...next});
      const unread = new Set(next.unread);
      return items.filter(item => unread.has(String(item._id))).map(item => ({
        _id: String(item._id), source, candidateName: item.candidateName,
        interviewDate: item.interviewDate, interviewTime: item.interviewTime,
        technology: item.technology, companyName: item.companyName
      })).reverse();
    } catch (error) {
      if (error.name !== 'VersionError' && error.code !== 11000) throw error;
    }
  }
  throw Object.assign(new Error('Notifications are busy. Please retry.'), {status: 409});
}

router.get('/', async (req, res, next) => {
  try {
    if (!permitted(req.user)) return res.json({count: 0, items: []});
    const records = await Interview.find().select('candidateName interviewDate interviewTime technology companyName').sort({_id: 1}).lean();
    let items = await refresh(req.user, 'database', records, 'all');
    let warning;
    const sheetEnabled = process.env.GOOGLE_SHEETS_ENABLED !== 'false';
    if (sheetEnabled && (req.user.role === 'admin' || req.user.permissions?.googleSheet !== false)) {
      try {
        const sheet = await getNormalizedSheetItems(req.user);
        sheet.items.sort((a, b) => a.sheetRow - b.sheetRow);
        items = [...items, ...await refresh(req.user, 'google-sheet', sheet.items, `${process.env.GOOGLE_SHEET_ID}:${process.env.GOOGLE_SHEET_RANGE}:${sheet.scope}`)];
      } catch {warning = 'Google Sheet notifications could not be refreshed.'}
    }
    res.json({count: items.length, items: items.slice(0, 50), warning});
  } catch (error) {next(error)}
});

router.patch('/read', async (req, res, next) => {
  try {
    const {source, ids} = req.body;
    if (!['database', 'google-sheet'].includes(source) || !Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string')) {
      return res.status(400).json({message: 'Invalid notification selection'});
    }
    // Only acknowledge displayed IDs, so arrivals during this request stay unread.
    await State.updateOne({user: req.user._id, source}, {$pull: {unread: {$in: ids}}, $inc: {__v: 1}});
    res.json({ok: true});
  } catch (error) {next(error)}
});
export default router;
