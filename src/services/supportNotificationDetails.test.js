import test from 'node:test';
import assert from 'node:assert/strict';
import {interviewStart, supportMessage} from './supportNotificationDetails.js';

test('interprets dates and 12/24 hour times in IST independently of server timezone', () => {
  assert.equal(interviewStart(new Date('2026-10-09T00:00:00Z'), '15:00').toISOString(), '2026-10-09T09:30:00.000Z');
  assert.equal(interviewStart('2026-10-09', '3:00 PM').toISOString(), '2026-10-09T09:30:00.000Z');
  assert.equal(interviewStart('2026-10-09', '12:00 AM').toISOString(), '2026-10-08T18:30:00.000Z');
  for(const time of ['25:00', '10:75', '00:00 PM', 'bad']) assert.equal(interviewStart('2026-10-09', time), null);
});
test('email contains contact, ten-minute early arrival and brand, without a meeting link', () => {
  const details = {candidateName:'Anand', candidateMobile:'9876543210', companyName:'Example', technology:'Java', start:interviewStart('2026-10-09','15:00')};
  const email = supportMessage('Ankit', details, 'assignment');
  assert.match(email.text, /Hi Ankit/);
  assert.match(email.subject, /Assigned — Anand/);
  assert.match(email.text, /9876543210/);
  assert.match(email.text, /2:50 pm/i);
  assert.match(email.text, /SmartHire : SmartGroup/);
  assert.doesNotMatch(email.text, /meeting|https?:/i);
  assert.match(supportMessage('Ankit',details,'reminder').subject, /Reminder/);
});
