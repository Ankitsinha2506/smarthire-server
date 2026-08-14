import express from 'express';
import {google} from 'googleapis';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {auth,allow,permit} from '../middleware/auth.js';
import GoogleSheetAssignment from '../models/GoogleSheetAssignment.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';

const router=express.Router();
router.use(auth,allow('admin','staff'),permit('googleSheet'));

function parseDate(value){if(!value)return null;const text=String(value).trim();const native=new Date(text);if(!Number.isNaN(native.getTime()))return native;const parts=text.split(/[\/-]/).map(Number);if(parts.length===3){const [day,month,year]=parts;const date=new Date(year<100?2000+year:year,month-1,day);if(!Number.isNaN(date.getTime()))return date}return null}
function isToday(value){const date=parseDate(value),now=new Date();return date&&date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth()&&date.getDate()===now.getDate()}
const credentialPath=fileURLToPath(new URL('../config/google-service-account.json',import.meta.url));

async function sheetAuth(){
  try{
    const credentials=JSON.parse(await readFile(credentialPath,'utf8'));
    if(!credentials.client_email||!credentials.private_key)throw new Error('Service account JSON is missing client_email or private_key');
    return new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    if(!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||!process.env.GOOGLE_PRIVATE_KEY)throw Object.assign(new Error('Google Sheet service account is not configured'),{status:503});
    return new google.auth.GoogleAuth({credentials:{client_email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,private_key:process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  }
}

const clean=value=>String(value??'').trim();
function pick(row,...names){for(const name of names){const key=Object.keys(row).find(header=>header.trim().toLowerCase()===name.toLowerCase());if(key&&clean(row[key]))return clean(row[key])}return ''}
function normalizedDate(value){const date=parseDate(value);return date&&!Number.isNaN(date.getTime())?date:null}
async function readSheet(){
  if(process.env.GOOGLE_SHEETS_ENABLED==='false')return {spreadsheetId:process.env.GOOGLE_SHEET_ID||'disabled',headers:[],rows:[]};
  const spreadsheetId=process.env.GOOGLE_SHEET_ID||'1x6e-HHjc8B5gjmBO2TxcMi-IREHlbhZxAzSN_Z_ooPg',range=process.env.GOOGLE_SHEET_RANGE||"'Form Responses 1'!A:ZZ";
  const sheets=google.sheets({version:'v4',auth:await sheetAuth()}),result=await sheets.spreadsheets.values.get({spreadsheetId,range});
  const [headers=[], ...values]=result.data.values||[];
  const rows=values.filter(row=>row.some(value=>clean(value))).map((row,index)=>({__row:index+2,...Object.fromEntries(headers.map((header,column)=>[clean(header||`Column ${column+1}`),row[column]??'']))}));
  return {spreadsheetId,headers:headers.map(String),rows};
}

export async function getNormalizedSheetItems(user,query={}){
  const {spreadsheetId,rows}=await readSheet(),scope=user.role==='admin'?'all':user.permissions?.googleSheetScope||'today';
  const assignments=await GoogleSheetAssignment.find({spreadsheetId,sheetRow:{$in:rows.map(row=>row.__row)}}).populate('assignedStaff','name email phone').lean();
  const assignmentByRow=new Map(assignments.map(item=>[item.sheetRow,item.assignedStaff||[]]));
  let items=rows.map(row=>({
    _id:`sheet-${row.__row}`,source:'google-sheet',sheetRow:row.__row,candidateName:pick(row,'Candidate Name'),candidateEmail:pick(row,'Candidate Email ID','Candidate Email'),candidateMobile:pick(row,'Candidate Mobile No.','Candidate Mobile No','Candidate Mobile'),interviewDate:normalizedDate(pick(row,'Interview Date')),interviewTime:pick(row,'Interview Time'),technology:pick(row,'Technology'),companyName:pick(row,'Company Name'),hrName:pick(row,'HR Name','HR Name '),hrEmail:pick(row,'HR Email'),hrMobile:pick(row,'HR Mobile No','HR Mobile No.','HR Mobile'),rounds:[pick(row,'No. of Rounds','Interview Round')].filter(Boolean),status:pick(row,'Interview Status','Status')||'Scheduled',selectedCompanyName:pick(row,'Selected Company Name'),remarks:pick(row,'Remarks'),resumeUrl:pick(row,'Upload your Resume'),introductionUrl:pick(row,'Candidate Introduction'),assignedStaff:assignmentByRow.get(row.__row)||[]
  })).filter(item=>item.candidateName);
  if(scope==='today')items=items.filter(item=>isToday(item.interviewDate));
  if(query.from){const from=new Date(query.from);from.setHours(0,0,0,0);items=items.filter(item=>item.interviewDate&&item.interviewDate>=from)}
  if(query.to){const to=new Date(query.to);to.setHours(23,59,59,999);items=items.filter(item=>item.interviewDate&&item.interviewDate<=to)}
  if(query.status)items=items.filter(item=>item.status===query.status);
  if(query.technology)items=items.filter(item=>item.technology===query.technology);
  if(query.search){const search=clean(query.search).toLowerCase();items=items.filter(item=>[item.candidateName,item.candidateEmail,item.candidateMobile,item.companyName,item.technology,item.hrName].some(value=>clean(value).toLowerCase().includes(search)))}
  items.sort((a,b)=>(b.interviewDate?.getTime()||0)-(a.interviewDate?.getTime()||0));
  return {items,total:items.length,scope};
}

router.get('/normalized',async(req,res,next)=>{try{
  res.json(await getNormalizedSheetItems(req.user,req.query));
}catch(e){if(e.code===403||e.code===404)e.status=502;next(e)}});

router.patch('/:row/assignment',async(req,res,next)=>{try{
  const sheetRow=Number(req.params.row);
  if(!Number.isInteger(sheetRow)||sheetRow<2)return res.status(400).json({message:'Invalid Google Sheet row'});
  const {spreadsheetId,rows}=await readSheet();
  const sourceRow=rows.find(row=>row.__row===sheetRow);
  if(!sourceRow)return res.status(404).json({message:'Google response was not found'});
  let assignment=await GoogleSheetAssignment.findOne({spreadsheetId,sheetRow});
  if(!assignment)assignment=new GoogleSheetAssignment({spreadsheetId,sheetRow,assignedStaff:[]});
  if(req.user.role==='admin'){
    const requested=Array.isArray(req.body.assignedStaff)?req.body.assignedStaff:[];
    const validStaff=await User.find({_id:{$in:requested},role:'staff',active:true}).select('_id').lean();
    assignment.assignedStaff=validStaff.map(member=>member._id);
  }else{
    if(req.user.permissions?.selfAssign===false)return res.status(403).json({message:'Your staff account cannot self-assign support'});
    const ownId=String(req.user._id),already=assignment.assignedStaff.some(id=>String(id)===ownId);
    if(req.body.assigned===false&&already)assignment.assignedStaff=assignment.assignedStaff.filter(id=>String(id)!==ownId);
    if(req.body.assigned!==false&&!already)assignment.assignedStaff.push(req.user._id);
  }
  assignment.updatedBy=req.user._id;
  await assignment.save();
  await AuditLog.create({user:req.user._id,action:'UPDATE',details:{candidate:pick(sourceRow,'Candidate Name'),googleSheetRow:sheetRow,fields:['assignedStaff']},ip:req.ip});
  await assignment.populate('assignedStaff','name email phone');
  res.json({sheetRow,assignedStaff:assignment.assignedStaff});
}catch(e){next(e)}});

router.get('/',async(req,res,next)=>{try{
  const {spreadsheetId,headers,rows}=await readSheet();
  const dateHeader=headers.find(header=>/interview\s*date|date/i.test(String(header)))||headers[1];
  const scope=req.user.role==='admin'?'all':req.user.permissions?.googleSheetScope||'today';
  const visible=scope==='today'?rows.filter(row=>isToday(row[dateHeader])):rows;
  res.json({headers:headers.map(String),rows:visible,total:visible.length,scope,dateHeader,spreadsheetId});
}catch(e){if(e.code===403||e.code===404)e.status=502;next(e)}});

export default router;
