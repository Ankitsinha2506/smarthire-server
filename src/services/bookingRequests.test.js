import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import BookingRequest from '../models/BookingRequest.js';
import Interview from '../models/Interview.js';
import AuditLog from '../models/AuditLog.js';
import {allow} from '../middleware/auth.js';
import {staffBookingDetails, submitStaffBooking, reviewBooking} from './bookingRequests.js';

const staffId = new mongoose.Types.ObjectId(), adminId = new mongoose.Types.ObjectId();
const details = {candidateName:'Test Candidate',candidateEmail:'test@example.com',candidateMobile:'9876543210',interviewDate:new Date(Date.now()+86400000),interviewTime:'10:00',technology:'Python',companyName:'Example Company',hrName:'Test Recruiter',hrEmail:'hr@example.com',hrMobile:'9876543210',rounds:['Round 1']};

test('staff payload cannot bypass approval with client-supplied ownership or status', () => {
  const result = staffBookingDetails({...details, owner:adminId, assignedStaff:[adminId], status:'Placed', approvalStatus:'Approved', _id:adminId}, staffId);
  assert.equal(result.owner, staffId);
  assert.equal(result.status, 'Scheduled');
  assert.deepEqual(result.assignedStaff, []);
  assert.equal(result.approvalStatus, undefined);
  assert.equal(result._id, undefined);
});
test('staff submission validates and saves only a pending request', async t => {
  const createInterview = t.mock.method(Interview, 'create', () => {throw new Error('Must not book yet')});
  t.mock.method(BookingRequest, 'create', async data => ({...data, status:'Pending'}));
  const result = await submitStaffBooking(details, staffId);
  assert.equal(result.status, 'Pending');
  assert.equal(String(result.staff), String(staffId));
  assert.equal(result.details._id, undefined);
  assert.equal(createInterview.mock.callCount(), 0);
});
test('invalid staff requests are rejected before persistence', async t => {
  const create = t.mock.method(BookingRequest, 'create', async () => {});
  await assert.rejects(submitStaffBooking({...details, candidateEmail:'invalid'}, staffId), /valid candidate email/);
  assert.equal(create.mock.callCount(), 0);
});
function setupReview(t, status = 'Pending') {
  const session = {};
  const request = {_id:new mongoose.Types.ObjectId(),staff:staffId,details,status,save:async options => {assert.equal(options.session, session)},toObject(){return {...this}}};
  t.mock.method(mongoose.connection, 'transaction', async callback => callback(session));
  t.mock.method(BookingRequest, 'findById', () => ({session:async () => request}));
  const create = t.mock.method(Interview, 'create', async (items, options) => {assert.equal(options.session, session);return [{...items[0],_id:new mongoose.Types.ObjectId()}]});
  const audit = t.mock.method(AuditLog, 'create', async (items, options) => {assert.equal(options.session, session);return items});
  return {request, create, audit};
}
test('approval creates a scheduled interview and records the decision together', async t => {
  const {request, create, audit} = setupReview(t);
  const result = await reviewBooking({id:request._id, adminId, decision:'Approved', note:' Confirmed '});
  assert.equal(create.mock.callCount(), 1);
  assert.equal(result.interview.status, 'Scheduled');
  assert.equal(request.status, 'Approved');
  assert.equal(request.reviewNote, 'Confirmed');
  assert.equal(request.reviewedBy, adminId);
  assert.equal(request.interview, result.interview._id);
  assert.equal(request.notificationReadAt, undefined);
  assert.equal(audit.mock.callCount(), 1);
});
test('rejection never creates a confirmed interview', async t => {
  const {request, create} = setupReview(t);
  await reviewBooking({id:request._id, adminId, decision:'Rejected'});
  assert.equal(request.status, 'Rejected');
  assert.equal(create.mock.callCount(), 0);
});
test('a repeated decision cannot create a duplicate booking', async t => {
  const {request, create} = setupReview(t, 'Approved');
  await assert.rejects(reviewBooking({id:request._id, adminId, decision:'Approved'}), {status:409});
  assert.equal(create.mock.callCount(), 0);
});
test('failed interview validation leaves the request pending', async t => {
  const {request} = setupReview(t);
  t.mock.method(Interview, 'create', async () => {throw new Error('Interview date cannot be in the past')});
  await assert.rejects(reviewBooking({id:request._id, adminId, decision:'Approved'}), /past/);
  assert.equal(request.status, 'Pending');
});
test('invalid review decisions fail before starting a transaction', async () => {
  await assert.rejects(reviewBooking({decision:'Pending'}), {status:400});
  await assert.rejects(reviewBooking({decision:'Approved',note:'x'.repeat(1001)}), {status:400});
});
test('review authorization excludes staff and regular users', () => {
  for (const role of ['staff','user']) {
    let code;
    allow('admin')({user:{role}}, {status(value){code=value;return this},json(){}}, () => assert.fail('Access must be denied'));
    assert.equal(code,403);
  }
  let permitted=false;
  allow('admin')({user:{role:'admin'}}, {}, () => {permitted=true});
  assert.equal(permitted,true);
});
