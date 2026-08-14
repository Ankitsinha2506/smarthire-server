import express from 'express';
import multer from 'multer';
import path from 'path';
import {Readable} from 'stream';
import ExcelJS from 'exceljs';
import Interview from '../models/Interview.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { auth, allow, permit } from '../middleware/auth.js';
import { getNormalizedSheetItems } from './googleSheet.js';

const router = express.Router();
const storage = multer.diskStorage({ destination: 'uploads/', filename: (_, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`) });
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: (_, file, cb) => cb(null, ['application/pdf','image/jpeg','image/png','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype)) });
const fields = upload.fields([{ name: 'resume', maxCount: 1 }, { name: 'introduction', maxCount: 1 }]);
const spreadsheet = multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024}}).single('file');

function queryFrom(req) {
  const q = {};
  if (req.user.role === 'user') q.owner = req.user._id;
  if (req.query.status) q.status = req.query.status;
  if (req.query.technology) q.technology = req.query.technology;
  if (req.query.from || req.query.to) {
    q.interviewDate = {};
    if (req.query.from) q.interviewDate.$gte = new Date(req.query.from);
    if (req.query.to) { const d = new Date(req.query.to); d.setHours(23,59,59,999); q.interviewDate.$lte = d; }
  }
  if (req.query.search) q.$or = ['candidateName','candidateEmail','companyName','technology'].map(k => ({ [k]: { $regex: req.query.search, $options: 'i' } }));
  return q;
}

router.use(auth);
router.get('/',permit('interviews'), async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Number(req.query.limit) || 10, 100);
    const query = queryFrom(req);
    const [items, total] = await Promise.all([
      Interview.find(query).populate('owner','name email').populate('assignedStaff','name email phone').sort({ interviewDate: -1 }).skip((page-1)*limit).limit(limit),
      Interview.countDocuments(query)
    ]);
    res.json({ items, total, page, pages: Math.ceil(total/limit) });
  } catch (e) { next(e); }
});

router.get('/stats',permit('dashboard'), async (req, res, next) => {
  try {
    const base = req.user.role === 'user' ? { owner: req.user._id } : req.user.role==='staff'?{assignedStaff:req.user._id}:{};
    if(req.query.from||req.query.to){base.interviewDate={};if(req.query.from)base.interviewDate.$gte=new Date(req.query.from);if(req.query.to){const end=new Date(req.query.to);end.setHours(23,59,59,999);base.interviewDate.$lte=end;}}
    const [total, scheduled, selected, inProgress, tech] = await Promise.all([
      Interview.countDocuments(base), Interview.countDocuments({...base,status:'Scheduled'}), Interview.countDocuments({...base,status:{$in:['Selected','Placed']}}),
      Interview.countDocuments({...base,status:'In Progress'}), Interview.aggregate([{ $match: base }, { $group: { _id:'$technology', count:{ $sum:1 } } }, { $sort:{count:-1} }, { $limit:6 }])
    ]);
    res.json({ total, scheduled, selected, inProgress, technology: tech });
  } catch(e) { next(e); }
});

router.get('/staff-workload',allow('admin','staff'),permit('dashboard'),async(req,res,next)=>{try{
  const range={};if(req.query.from)range.$gte=new Date(req.query.from);if(req.query.to){const end=new Date(req.query.to);end.setHours(23,59,59,999);range.$lte=end;}
  const match=Object.keys(range).length?{interviewDate:range}:{};
  if(req.user.role==='staff')match.assignedStaff=req.user._id;
  const items=await Interview.find(match).populate('assignedStaff','name email phone').select('candidateName candidateEmail companyName technology interviewDate interviewTime status assignedStaff').sort({interviewTime:1});
  if(req.user.role==='staff')return res.json({total:items.length,interviews:items});
  const staff=await User.find({role:'staff',active:true}).select('name email phone').lean();
  res.json(staff.map(member=>{const interviews=items.filter(item=>item.assignedStaff.some(person=>String(person._id)===String(member._id)));return {...member,total:interviews.length,interviews};}).sort((a,b)=>b.total-a.total));
}catch(e){next(e);}});

router.get('/export', allow('admin','staff'),permit('exportInterviews'), async (req, res, next) => {
  try {
    const databaseItems = await Interview.find(queryFrom(req)).populate('owner','name email').sort({ interviewDate:-1 });
    const includeGoogle=req.user.role==='admin'||req.user.permissions?.googleSheet!==false;
    const googleItems=includeGoogle?(await getNormalizedSheetItems(req.user,req.query)).items:[];
    const items=[...databaseItems,...googleItems].sort((a,b)=>(b.interviewDate?.getTime?.()||0)-(a.interviewDate?.getTime?.()||0));
    const exportColumns={
      candidateName:['Candidate Name',i=>i.candidateName],candidateEmail:['Candidate Email',i=>i.candidateEmail],candidateMobile:['Candidate Mobile',i=>i.candidateMobile],
      interviewDate:['Interview Date',i=>i.interviewDate?.toISOString?.().slice(0,10)||''],interviewTime:['Interview Time',i=>i.interviewTime],technology:['Technology',i=>i.technology],
      companyName:['Company Name',i=>i.companyName],hrName:['HR Name',i=>i.hrName],hrEmail:['HR Email',i=>i.hrEmail],hrMobile:['HR Mobile',i=>i.hrMobile],
      interviewRound:['Interview Round',i=>i.rounds?.[0]||''],status:['Status',i=>i.status],selectedCompany:['Selected Company',i=>i.selectedCompanyName||''],remarks:['Remarks',i=>i.remarks||''],submittedBy:['Submitted By',i=>i.source==='google-sheet'?'Google Form':i.owner?.email||'']
    };
    const requested=String(req.query.fields||'').split(',').filter(key=>exportColumns[key]);
    const selected=requested.length?requested:Object.keys(exportColumns);
    const rows=items.map(item=>Object.fromEntries(selected.map(key=>[exportColumns[key][0],exportColumns[key][1](item)])));
    const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Interviews');
    const headers=selected.map(key=>exportColumns[key][0]);sheet.columns=headers.map(key=>({header:key,key,width:Math.max(16,key.length+3)}));rows.forEach(row=>sheet.addRow(row));sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];
    const buffer=await book.xlsx.writeBuffer();
    const filters={...req.query};delete filters.fields;
    await AuditLog.create({ user:req.user._id, action:'EXPORT', details:{ filters, fields:selected, rowCount:items.length, databaseRows:databaseItems.length, googleSheetRows:googleItems.length, format:'xlsx' }, ip:req.ip });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition',`attachment; filename="interviews-${Date.now()}.xlsx"`); res.send(buffer);
  } catch(e) { next(e); }
});

router.get('/import-template',allow('admin'),async(req,res,next)=>{try{
  const sample=[{'Candidate Name':'Ankit Sinha','Candidate Email':'ankit@example.com','Candidate Mobile':'9876543210','Interview Date':'2026-08-15','Interview Time':'10:30','Technology':'Java Developer','Company Name':'Example Technologies','HR Name':'Priya Sharma','HR Email':'priya@example.com','HR Mobile':'9876500000','Interview Round':'Round 1','Status':'Scheduled','Selected Company':'','Remarks':''}];
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Import Template'),headers=Object.keys(sample[0]);sheet.columns=headers.map(key=>({header:key,key,width:Math.max(18,key.length+3)}));sheet.addRow(sample[0]);sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF6D54DE'}};sheet.views=[{state:'frozen',ySplit:1}];const buffer=await book.xlsx.writeBuffer();
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition','attachment; filename="interview-import-template.xlsx"');res.send(buffer);
}catch(e){next(e);}});

router.post('/import',allow('admin'),spreadsheet,async(req,res,next)=>{try{
  if(!req.file)return res.status(400).json({message:'Choose an Excel or CSV file'});
  const book=new ExcelJS.Workbook();
  if(req.file.originalname.toLowerCase().endsWith('.csv'))await book.csv.read(Readable.from(req.file.buffer));else await book.xlsx.load(req.file.buffer);
  const sheet=book.worksheets[0],headers=[];sheet.getRow(1).eachCell((cell,column)=>{headers[column]=String(cell.value||'').trim()});const rows=[];sheet.eachRow((row,rowNumber)=>{if(rowNumber===1)return;const item={};headers.forEach((header,column)=>{let value=row.getCell(column).value;if(value&&typeof value==='object'&&'text'in value)value=value.text;if(value&&typeof value==='object'&&'result'in value)value=value.result;item[header]=value??''});rows.push(item)});
  if(!rows.length)return res.status(400).json({message:'The spreadsheet has no data rows'});
  let imported=0;const errors=[];
  for(let index=0;index<rows.length;index++){
    const r=rows[index],email=String(r['Candidate Email']||'').trim().toLowerCase();
    try{
      const owner=await User.findOne({email,role:'user'}).select('_id');
      const date=r['Interview Date'] instanceof Date?r['Interview Date']:new Date(r['Interview Date']);
      if(!r['Candidate Name']||!email||Number.isNaN(date.getTime())||!r['Company Name']||!r['HR Email'])throw new Error('Missing candidate, date, company or HR email');
      await Interview.create({owner:owner?._id||req.user._id,candidateName:r['Candidate Name'],candidateEmail:email,candidateMobile:String(r['Candidate Mobile']),interviewDate:date,interviewTime:String(r['Interview Time']||'09:00'),technology:r.Technology||'Other',companyName:r['Company Name'],hrName:r['HR Name']||'Not provided',hrEmail:r['HR Email'],hrMobile:String(r['HR Mobile']||'Not provided'),rounds:r['Interview Round']?[String(r['Interview Round'])]:[],status:['Scheduled','In Progress','Selected','Placed','Rejected','On Hold'].includes(r.Status)?r.Status:'Scheduled',selectedCompanyName:r['Selected Company'],remarks:r.Remarks});
      imported++;
    }catch(e){errors.push({row:index+2,message:e.message});}
  }
  await AuditLog.create({user:req.user._id,action:'IMPORT',details:{file:req.file.originalname,rowCount:imported,errorCount:errors.length},ip:req.ip});
  res.status(201).json({imported,failed:errors.length,errors:errors.slice(0,20)});
}catch(e){next(e);}});

router.patch('/:id/placement',allow('user'),async(req,res,next)=>{try{
  const item=await Interview.findOne({_id:req.params.id,owner:req.user._id,status:{$in:['Selected','Placed']}});
  if(!item)return res.status(404).json({message:'Only your selected interview can be marked as placed'});
  item.status=req.body.placed===false?'Selected':'Placed';item.placedAt=req.body.placed===false?undefined:new Date();await item.save();
  await AuditLog.create({user:req.user._id,action:'UPDATE',details:{interviewId:item._id,candidate:item.candidateName,status:item.status},ip:req.ip});res.json(item);
}catch(e){next(e);}});

router.patch('/:id/staff-self',allow('staff'),permit('selfAssign'),async(req,res,next)=>{try{
  const item=await Interview.findById(req.params.id);
  if(!item)return res.status(404).json({message:'Interview not found'});
  const staffId=String(req.user._id),assigned=item.assignedStaff.some(id=>String(id)===staffId);
  if(req.body.assigned===false&&assigned)item.assignedStaff=item.assignedStaff.filter(id=>String(id)!==staffId);
  if(req.body.assigned!==false&&!assigned)item.assignedStaff.push(req.user._id);
  await item.save();
  await AuditLog.create({user:req.user._id,action:'UPDATE',details:{interviewId:item._id,candidate:item.candidateName,fields:['assignedStaff'],staffSelfAssigned:req.body.assigned!==false},ip:req.ip});
  await item.populate('assignedStaff','name email phone');res.json(item);
}catch(e){next(e);}});

router.get('/:id',permit('interviews'), async (req, res, next) => {
  try { const item = await Interview.findById(req.params.id).populate('owner','name email').populate('assignedStaff','name email phone'); if (!item || (req.user.role==='user' && String(item.owner._id)!==String(req.user._id))) return res.status(404).json({message:'Interview not found'}); res.json(item); } catch(e){next(e);}
});

router.post('/',permit('createInterview'), fields, async (req, res, next) => {
  try {
    const body = { ...req.body, owner:req.user._id, rounds: JSON.parse(req.body.rounds || '[]') };
    // Candidate accounts always submit against their verified registration profile.
    if (req.user.role === 'user') {
      body.candidateName = req.user.name;
      body.candidateEmail = req.user.email;
      body.candidateMobile = req.user.phone;
    }
    if (req.files?.resume) body.resume = { name:req.files.resume[0].originalname,path:req.files.resume[0].filename,mimetype:req.files.resume[0].mimetype };
    if (req.files?.introduction) body.introduction = { name:req.files.introduction[0].originalname,path:req.files.introduction[0].filename,mimetype:req.files.introduction[0].mimetype };
    const item = await Interview.create(body);
    await AuditLog.create({user:req.user._id,action:'CREATE',details:{interviewId:item._id,candidate:item.candidateName},ip:req.ip});
    res.status(201).json(item);
  } catch(e){next(e);}
});

router.put('/:id', allow('admin','user'), async (req, res, next) => {
  try {
    const existing=await Interview.findById(req.params.id);
    if(!existing||(req.user.role==='user'&&String(existing.owner)!==String(req.user._id)))return res.status(404).json({message:'Interview not found'});
    const allowed=['interviewDate','interviewTime','technology','companyName','hrName','hrEmail','hrMobile','rounds','status','selectedCompanyName','remarks'];
    if(req.user.role==='admin')allowed.push('assignedStaff');
    const updates=Object.fromEntries(Object.entries(req.body).filter(([key])=>allowed.includes(key)));
    if(req.user.role==='user'){
      // Candidate identity and ownership can never be changed from an interview update.
      updates.candidateName=req.user.name;updates.candidateEmail=req.user.email;updates.candidateMobile=req.user.phone;
    }
    if(updates.status==='Placed'&&existing.status!=='Placed')updates.placedAt=new Date();
    if(updates.status&&updates.status!=='Placed')updates.placedAt=undefined;
    const item=await Interview.findByIdAndUpdate(req.params.id,{$set:updates},{new:true,runValidators:true});
    await AuditLog.create({user:req.user._id,action:'UPDATE',details:{interviewId:item._id,candidate:item.candidateName,status:item.status,fields:Object.keys(updates)},ip:req.ip});res.json(item);
  } catch(e){next(e);}
});
router.delete('/:id', allow('admin'), async (req,res,next)=>{try{const item=await Interview.findByIdAndDelete(req.params.id);if(!item)return res.status(404).json({message:'Interview not found'});await AuditLog.create({user:req.user._id,action:'DELETE',details:{interviewId:item._id,candidate:item.candidateName},ip:req.ip});res.status(204).end();}catch(e){next(e);}});
export default router;
