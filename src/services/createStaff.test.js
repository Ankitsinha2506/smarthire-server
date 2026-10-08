import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import {createStaff} from './createStaff.js';
import {staffWelcomeMessage} from './staffWelcome.js';
const body={name:'Ankit',email:'staff@example.com',password:'TestPass123!',phone:'9876543210'};
test('sends credentials only after saving the staff with a hashed password',async t=>{
 let saved;
 t.mock.method(User,'create',async data=>{saved=data;return {...data,_id:'staff'}});
 const result=await createStaff(body,async(user,password)=>{
  assert.ok(saved);assert.equal(password,body.password);assert.notEqual(saved.password,password);assert.equal(await bcrypt.compare(password,saved.password),true);assert.equal(user.email,body.email);
 });
 assert.equal(result.welcomeEmailSent,true);assert.equal(result.password,undefined);
});
test('SMTP failure returns created account plus explicit warning',async t=>{
 t.mock.method(User,'create',async data=>({...data,_id:'staff'}));
 const result=await createStaff(body,async()=>{throw new Error('SMTP unavailable')});
 assert.equal(result.id,'staff');assert.equal(result.welcomeEmailSent,false);assert.match(result.message,/could not be sent/);assert.doesNotMatch(JSON.stringify(result),/TestPass123/);
});
test('validation and duplicate failures never send credentials',async t=>{
 let sent=false;
 await assert.rejects(createStaff({...body,password:'short'},async()=>{sent=true}),error=>error.status===400);
 t.mock.method(User,'create',async()=>{throw Object.assign(new Error('duplicate'),{code:11000})});
 await assert.rejects(createStaff(body,async()=>{sent=true}),error=>error.code===11000);
 assert.equal(sent,false);
});
test('welcome message escapes HTML and provides a configured login link',()=>{
 const message=staffWelcomeMessage({...body,name:'Ankit <Test>',password:'A<&"12345',clientUrl:'https://example.com/'});
 assert.match(message.text,/Name: Ankit/);assert.match(message.text,/https:\/\/example.com\//);assert.match(message.html,/A&lt;&amp;&quot;12345/);assert.doesNotMatch(message.html,/<Test>/);assert.match(message.text,/SmartHire : SmartGroup/);
 assert.throws(()=>staffWelcomeMessage({...body,clientUrl:'javascript:alert(1)'}));
});
