import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {deleteStaff} from './deleteStaff.js';
import User from '../models/User.js';
import Interview from '../models/Interview.js';
import Assignment from '../models/GoogleSheetAssignment.js';
import Notice from '../models/SupportNotification.js';
import State from '../models/InterviewNotificationState.js';
import Booking from '../models/BookingRequest.js';
import Audit from '../models/AuditLog.js';
import router from '../routes/admin.js';
const id='507f1f77bcf86cd799439011',adminId='507f1f77bcf86cd799439012';

test('deletes staff and related access in one transaction while retaining interview/history records',async t=>{
 const session={};const calls=[];
 t.mock.method(mongoose.connection,'transaction',async callback=>callback(session));
 t.mock.method(User,'findById',()=>({session:async actual=>{assert.equal(actual,session);return {_id:id,role:'staff',name:'Ankit',email:'staff@example.com'}}}));
 for(const [model,method] of [[Interview,'updateMany'],[Assignment,'updateMany'],[Notice,'deleteMany'],[State,'deleteMany'],[Booking,'updateMany'],[Audit,'create'],[User,'deleteOne']])
  t.mock.method(model,method,async(...args)=>{assert.equal(args.at(-1).session,session);calls.push({model:model.modelName,method,args});return {deletedCount:1}});
 assert.match((await deleteStaff({id,adminId,ip:'test'})).message,/deleted/);
 assert.deepEqual(calls.find(call=>call.model==='Interview').args[1],{$pull:{assignedStaff:id}});
 assert.ok(calls.some(call=>call.model==='Interview'&&call.args[1].$set?.owner===adminId));
 assert.ok(calls.some(call=>call.model==='BookingRequest'&&call.args[1].$set?.status==='Rejected'));
 assert.equal(calls.at(-1).model,'User');
 assert.equal(calls.at(-1).method,'deleteOne');
 assert.ok(calls.some(call=>call.model==='AuditLog'&&call.args[0][0].resource==='staff'));
});
for(const role of ['admin','user']) test(`refuses deletion of ${role} accounts`,async t=>{
 t.mock.method(mongoose.connection,'transaction',async callback=>callback({}));
 t.mock.method(User,'findById',()=>({session:async()=>({role})}));
 await assert.rejects(deleteStaff({id,adminId}),error=>error.status===403);
});
test('validates IDs and missing accounts',async t=>{
 await assert.rejects(deleteStaff({id:'bad',adminId}),error=>error.status===400);
 t.mock.method(mongoose.connection,'transaction',async callback=>callback({}));
 t.mock.method(User,'findById',()=>({session:async()=>null}));
 await assert.rejects(deleteStaff({id,adminId}),error=>error.status===404);
});
test('admin middleware prevents staff and candidates from reaching deletion',()=>{
 assert.ok(router.stack.some(layer=>layer.route?.path==='/staff/:id'&&layer.route.methods.delete));
 const guard=router.stack[1].handle;
 for(const role of ['staff','user']){let status;guard({user:{role}},{status(code){status=code;return this},json(){}},()=>assert.fail('Must deny'));assert.equal(status,403)}
});

test('does not report success when MongoDB deletes no account',async t=>{
 t.mock.method(mongoose.connection,'transaction',async callback=>callback({}));
 t.mock.method(User,'findById',()=>({session:async()=>({_id:id,role:'staff',name:'Ankit',email:'staff@example.com'})}));
 for(const [model,method] of [[Interview,'updateMany'],[Assignment,'updateMany'],[Notice,'deleteMany'],[State,'deleteMany'],[Booking,'updateMany'],[Audit,'create']]) t.mock.method(model,method,async()=>({}));
 t.mock.method(User,'deleteOne',async()=>({deletedCount:0}));
 await assert.rejects(deleteStaff({id,adminId}),error=>error.status===409);
});
