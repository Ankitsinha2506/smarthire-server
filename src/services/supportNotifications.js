import {createHash} from 'node:crypto';
import Interview from '../models/Interview.js';
import User from '../models/User.js';
import Notice from '../models/SupportNotification.js';
import {sendSupportEmail} from '../email.js';
import {interviewStart} from './supportNotificationDetails.js';

export async function syncSupportNotifications(item, interviewKey = `database:${item._id}`) {
  const now = new Date(), start = interviewStart(item.interviewDateKey || item.interviewDate, item.interviewTime);
  const staff = (item.assignedStaff || []).map(member => String(member._id || member));
  const details = {candidateName: item.candidateName, candidateMobile: item.candidateMobile, companyName: item.companyName, technology: item.technology, start};
  const revision = createHash('sha256').update(JSON.stringify(details)).digest('hex');
  const keys = [];
  if (start > now && ['Scheduled', 'In Progress'].includes(item.status || 'Scheduled')) {
    for (const id of staff) for (const kind of ['assignment', 'reminder']) {
      const key = `${interviewKey}:${id}:${revision}:${kind}`; keys.push(key);
      // A cancelled assignment can be activated again when the same staff is reassigned.
      await Notice.updateOne({key, cancelled: true}, {$set: {cancelled: false, dueAt: kind === 'assignment' ? now : new Date(start - 600000)}, $unset: {sentAt: '', readAt: '', lockedUntil: ''}});
      await Notice.updateOne({key}, {$setOnInsert: {key, interviewKey, staff: id, kind, details, dueAt: kind === 'assignment' ? now : new Date(start - 600000)}}, {upsert: true});
    }
  }
  await Notice.updateMany({interviewKey, key: {$nin: keys}, cancelled: false}, {$set: {cancelled: true}});
}
let running = false;
export async function processSupportNotifications() {
  if (running) return;
  running = true;
  try {
    const records = await Interview.find().lean();
    for (const item of records) await syncSupportNotifications(item);
    await Notice.updateMany({interviewKey: {$regex: '^database:', $nin: records.map(item => `database:${item._id}`)}}, {$set: {cancelled: true}});
    if (process.env.GOOGLE_SHEETS_ENABLED !== 'false' && process.env.GOOGLE_SHEET_ID) {
      try {
        const {getNormalizedSheetItems} = await import('../routes/googleSheet.js');
        const sheet = await getNormalizedSheetItems({role: 'admin'});
        const keys = sheet.items.map(item => `sheet:${process.env.GOOGLE_SHEET_ID}:${item.sheetRow}`);
        for (const item of sheet.items) await syncSupportNotifications(item, `sheet:${process.env.GOOGLE_SHEET_ID}:${item.sheetRow}`);
        await Notice.updateMany({interviewKey: {$regex: `^sheet:${process.env.GOOGLE_SHEET_ID}:`, $nin: keys}}, {$set: {cancelled: true}});
      } catch (error) {console.error('Support reminder sheet refresh failed:', error.message)}
    }
    for (let count = 0; count < 100; count++) {
      const now = new Date();
      const job = await Notice.findOneAndUpdate({cancelled: false, sentAt: null, dueAt: {$lte: now}, 'details.start': {$gt: now}, $or: [{lockedUntil: null}, {lockedUntil: {$lte: now}}]}, {$set: {lockedUntil: new Date(Date.now() + 120000)}, $inc: {attempts: 1}}, {new: true, sort: {dueAt: 1}});
      if (!job) break;
      try {
        const staff = await User.findOne({_id: job.staff, active: true, role: 'staff'});
        if (!staff) {await Notice.updateOne({_id: job._id}, {$set: {cancelled: true}}); continue}
        await sendSupportEmail(staff, job.details, job.kind);
        await Notice.updateOne({_id: job._id}, {$set: {sentAt: new Date()}, $unset: {lockedUntil: '', lastError: ''}});
      } catch (error) {
        await Notice.updateOne({_id: job._id}, {$set: {lastError: error.message, lockedUntil: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6)))}});
        console.error('Support email delivery failed:', error.message);
      }
    }
  } finally {running = false}
}
export function startSupportNotificationWorker() {
  const run = () => processSupportNotifications().catch(error => console.error('Support notifications:', error.message));
  run(); const timer = setInterval(run, 30000); timer.unref(); return timer;
}
