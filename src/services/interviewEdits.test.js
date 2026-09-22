import test from 'node:test';
import assert from 'node:assert/strict';
import interviewRouter from '../routes/interviews.js';
import sheetRouter from '../routes/googleSheet.js';
import Interview from '../models/Interview.js';
import AuditLog from '../models/AuditLog.js';

test('software admin can fill HR details on an old record with missing email', async t => {
  const existing={_id:'record',candidateName:'Candidate',interviewDate:new Date('2020-01-01'),hrName:'',hrMobile:'',hrEmail:'',status:'Scheduled'};
  t.mock.method(Interview,'findById',async()=>existing);
  const update=t.mock.method(Interview,'findByIdAndUpdate',async(id,change,options)=>{
    assert.equal(id,'record');
    assert.deepEqual(change,{$set:{hrName:'Test Recruiter',hrMobile:'9876543210'}});
    assert.equal(options.runValidators,true);
    return {...existing,...change.$set};
  });
  const audit=t.mock.method(AuditLog,'create',async()=>{});
  const route=interviewRouter.stack.find(layer=>layer.route?.path==='/:id'&&layer.route.methods.put).route;
  let result;
  await route.stack.at(-1).handle({params:{id:'record'},user:{role:'admin',_id:'admin'},body:{hrName:'Test Recruiter',hrMobile:'9876543210'},ip:'test'}, {json(value){result=value}},error=>{throw error});
  assert.equal(result.hrName,'Test Recruiter');
  assert.equal(update.mock.callCount(),1);
  assert.equal(audit.mock.callCount(),1);
});

test('Google response edit endpoint denies staff and candidates',()=>{
  const route=sheetRouter.stack.find(layer=>layer.route?.path==='/:row'&&layer.route.methods.patch).route;
  for(const role of ['staff','user']){
    let status;
    route.stack[0].handle({user:{role}},{status(code){status=code;return this},json(){}},()=>assert.fail('Must not reach sheet update'));
    assert.equal(status,403);
  }
});
