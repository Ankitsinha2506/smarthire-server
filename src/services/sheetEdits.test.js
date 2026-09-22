import test from 'node:test';
import assert from 'node:assert/strict';
import {editSheetResponse, sheetRevision} from './sheetEdits.js';
import {allow} from '../middleware/auth.js';

const row={__row:5,'Candidate Name':'Test Candidate','HR Name':'','HR Mobile No.':'','Interview Date':'2020-01-01'};
const sheet={spreadsheetId:'test-sheet',range:"'Form Responses 1'!A:ZZ",headers:['Candidate Name','HR Name','HR Mobile No.','Interview Date'],rows:[row]};
function setup(overrides={}) {
  const writes=[],audits=[];
  return {writes,audits,args:{sheetRow:5,revision:sheetRevision(row),changes:{hrName:'Test Recruiter',hrMobile:'0123456789'},read:async()=>sheet,write:async data=>writes.push(data),audit:async data=>audits.push(data),...overrides}};
}
test('fills missing HR cells without changing candidate or old interview date',async()=>{
  const {args,writes,audits}=setup();
  assert.deepEqual(await editSheetResponse(args),{sheetRow:5,updated:true});
  assert.deepEqual(writes,[{spreadsheetId:'test-sheet',requestBody:{valueInputOption:'RAW',data:[
    {range:"'Form Responses 1'!B5",values:[['Test Recruiter']]},
    {range:"'Form Responses 1'!C5",values:[['0123456789']]}
  ]}}]);
  assert.deepEqual(audits,[{sheetRow:5,fields:['hrName','hrMobile']}]);
});
test('uses the Google-resolved tab for sheet-only, named and unqualified ranges',async()=>{
  for(const range of ['Form Responses 1', "'Form Responses 1'", 'A:ZZ', 'Responses']) {
    const {args,writes}=setup({read:async()=>({...sheet,range,resolvedRange:"'Form Responses 1'!A1:ZZ1000"})});
    await editSheetResponse(args);
    assert.deepEqual(writes[0].requestBody.data.map(cell=>cell.range),["'Form Responses 1'!B5","'Form Responses 1'!C5"]);
  }
});
test('refuses offset response ranges instead of writing to the wrong cells',async()=>{
  const {args,writes}=setup({read:async()=>({...sheet,resolvedRange:"'Form Responses 1'!B3:ZZ1000"})});
  await assert.rejects(editSheetResponse(args),/starting at column A, row 1/);
  assert.equal(writes.length,0);
});
test('rejects stale or moved responses before writing',async()=>{
  const {args,writes}=setup({read:async()=>({...sheet,rows:[{...row,'Candidate Name':'Someone Else'}]})});
  await assert.rejects(editSheetResponse(args),error=>error.status===409);
  assert.equal(writes.length,0);
});
test('validates changed fields and refuses unknown fields and missing columns',async()=>{
  for(const changes of [{hrMobile:'123'},{hrName:''},{hrEmail:'invalid'},{owner:'other'},{status:'Invalid'},{interviewDate:'2026-02-30'},{rounds:'Round 1'},{}]) {
    const {args,writes}=setup({changes});
    await assert.rejects(editSheetResponse(args),error=>error.status===400);
    assert.equal(writes.length,0);
  }
  const {args,writes}=setup({changes:{hrEmail:'hr@example.com'}});
  await assert.rejects(editSheetResponse(args),/no column for hrEmail/);
  assert.equal(writes.length,0);
});
test('does not report success or audit a failed Google write',async()=>{
  const {args,audits}=setup({write:async()=>{throw new Error('Google unavailable')}});
  await assert.rejects(editSheetResponse(args),/Google unavailable/);
  assert.equal(audits.length,0);
});
test('only admins can pass the response editing role guard',()=>{
  for(const role of ['admin','staff','user']) {
    let allowed=false,code;
    allow('admin')({user:{role}},{status(value){code=value;return this},json(){}},()=>{allowed=true});
    assert.equal(allowed,role==='admin');
    if(role!=='admin')assert.equal(code,403);
  }
});
