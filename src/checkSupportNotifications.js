import 'dotenv/config';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import Notice from './models/SupportNotification.js';
import Interview from './models/Interview.js';
import Assignment from './models/GoogleSheetAssignment.js';
import {interviewStart} from './services/supportNotificationDetails.js';
const checks = await Promise.allSettled([
(async () => {
  await mongoose.connect(process.env.MONGO_URI, {serverSelectionTimeoutMS: 10000});
  console.log(JSON.stringify({database: 'connected', jobs: await Notice.find().select('kind cancelled sentAt dueAt attempts lastError details.start').lean(), assignedInterviews: await Interview.find({'assignedStaff.0': {$exists: true}}).select('interviewDate interviewTime status').lean()}, null, 2));
  console.log(JSON.stringify({sheetAssignments: await Assignment.countDocuments({'assignedStaff.0': {$exists:true}})}));
  if(process.env.GOOGLE_SHEETS_ENABLED !== 'false') {
    const {getNormalizedSheetItems} = await import('./routes/googleSheet.js');
    const sheet = await getNormalizedSheetItems({role:'admin'});
    console.log(JSON.stringify({assignedSheetInterviews:sheet.items.filter(item => item.assignedStaff.length).map(item => ({row:item.sheetRow,date:item.interviewDate,time:item.interviewTime,status:item.status,staffCount:item.assignedStaff.length,parsedStart:interviewStart(item.interviewDateKey || item.interviewDate,item.interviewTime)}))},null,2));
  }
})(),
(async () => {
  await nodemailer.createTransport({host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS}, connectionTimeout: 10000, socketTimeout: 10000}).verify();
  console.log('SMTP authentication verified (no email sent)');
})()
]);
for (let i = 0; i < checks.length; i++) if (checks[i].status === 'rejected') console.log(JSON.stringify({check: i === 0 ? 'database' : 'SMTP', code: checks[i].reason.code, message: checks[i].reason.message}));
await mongoose.disconnect();
