import test from 'node:test';
import assert from 'node:assert/strict';
import Notice from '../models/SupportNotification.js';
import {syncSupportNotifications} from './supportNotifications.js';

test('queues assignment and reminder once, then cancels obsolete schedules and removed staff', async t => {
  const jobs = new Map();
  t.mock.method(Notice, 'updateOne', async (filter, update) => {
    let job = jobs.get(filter.key);
    if(filter.cancelled && !job?.cancelled) return;
    if(!job && update.$setOnInsert) {job={...update.$setOnInsert,cancelled:false}; jobs.set(filter.key,job)}
    if(job && update.$set) Object.assign(job,update.$set);
  });
  t.mock.method(Notice, 'updateMany', async (filter, update) => {
    for(const job of jobs.values()) if(job.interviewKey===filter.interviewKey && !filter.key.$nin.includes(job.key)) Object.assign(job,update.$set);
  });
  const item={_id:'interview', assignedStaff:['staff'], candidateName:'Anand', interviewDate:'2099-10-09', interviewTime:'15:00', status:'Scheduled'};
  await syncSupportNotifications(item);
  await syncSupportNotifications(item);
  assert.equal(jobs.size,2);
  const reminder=[...jobs.values()].find(job=>job.kind==='reminder');
  assert.equal(reminder.details.start - reminder.dueAt,600000);
  await syncSupportNotifications({...item,interviewTime:'16:00'});
  assert.equal([...jobs.values()].filter(job=>!job.cancelled).length,2);
  assert.equal(reminder.cancelled,true);
  await syncSupportNotifications({...item,assignedStaff:[]});
  assert.equal([...jobs.values()].filter(job=>!job.cancelled).length,0);
  await syncSupportNotifications(item);
  assert.equal([...jobs.values()].filter(job=>!job.cancelled).length,2);
  await syncSupportNotifications({...item,status:'Rejected'});
  assert.equal([...jobs.values()].filter(job=>!job.cancelled).length,0);
});


test('uses the original Google Sheet calendar day instead of UTC midnight conversion', async t => {
  const queued=[];
  t.mock.method(Notice,'updateOne',async(filter,update)=>{if(update.$setOnInsert)queued.push(update.$setOnInsert)});
  t.mock.method(Notice,'updateMany',async()=>{});
  await syncSupportNotifications({_id:'sheet-2',source:'google-sheet',interviewDate:new Date('2099-10-08T18:30:00Z'),interviewDateKey:'2099-10-09',interviewTime:'9:00:00 AM',assignedStaff:['staff'],status:'Scheduled'},'sheet:test:2');
  assert.equal(queued[0].details.start.toISOString(),'2099-10-09T03:30:00.000Z');
});
