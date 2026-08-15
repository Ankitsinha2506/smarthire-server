import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import Interview from '../models/Interview.js';
import { auth, allow } from '../middleware/auth.js';

const router=express.Router(); router.use(auth,allow('admin'));
router.get('/analytics',async(req,res,next)=>{try{
  const match={};if(req.query.from||req.query.to){match.interviewDate={};if(req.query.from)match.interviewDate.$gte=new Date(req.query.from);if(req.query.to){const end=new Date(req.query.to);end.setHours(23,59,59,999);match.interviewDate.$lte=end;}}
  const todayStart=new Date();todayStart.setHours(0,0,0,0);const todayEnd=new Date(todayStart);todayEnd.setHours(23,59,59,999);
  const group=field=>Interview.aggregate([{$match:match},{$group:{_id:`$${field}`,count:{$sum:1}}},{$sort:{count:-1}},{$limit:10}]);
  const [total,status,technology,company,trend,today,workloadItems,registered,activeStaff,staffUsers,upcoming,unassigned]=await Promise.all([
    Interview.countDocuments(match),group('status'),group('technology'),group('companyName'),
    Interview.aggregate([{$match:match},{$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$interviewDate'}},count:{$sum:1}}},{$sort:{_id:1}},{$limit:31}]),
    Interview.find({interviewDate:{$gte:todayStart,$lte:todayEnd}}).populate('assignedStaff','name').select('candidateName interviewTime technology companyName status assignedStaff').sort({interviewTime:1}),
    Interview.find(match).populate('assignedStaff','name').select('candidateName interviewDate assignedStaff').lean(),
    User.countDocuments({role:'user'}),User.countDocuments({role:'staff',active:true}),User.find({role:'staff',active:true}).select('name email').lean(),
    Interview.countDocuments({interviewDate:{$gt:todayEnd}}),Interview.countDocuments({...match,$or:[{assignedStaff:{$exists:false}},{assignedStaff:{$size:0}}]})
  ]);
  const selected=status.filter(x=>['Selected','Placed'].includes(x._id)).reduce((sum,x)=>sum+x.count,0);
  const placed=status.find(x=>x._id==='Placed')?.count||0,rejected=status.find(x=>x._id==='Rejected')?.count||0;
  const staffWorkload=staffUsers.map(member=>{const assigned=workloadItems.filter(item=>item.assignedStaff.some(person=>String(person._id)===String(member._id)));return {...member,count:assigned.length,candidates:assigned.map(item=>item.candidateName)}}).sort((a,b)=>b.count-a.count);
  const busiestTechnology=technology[0]?{name:technology[0]._id,count:technology[0].count}:null,busiestCompany=company[0]?{name:company[0]._id,count:company[0].count}:null;
  res.json({kpis:{total,today:today.length,upcoming,unassigned,registered,activeStaff,selected,placed,rejected,conversion:total?Math.round(selected/total*100):0},status,technology,company,trend,today,staffWorkload,insights:{busiestTechnology,busiestCompany,averagePerCandidate:registered?Number((total/registered).toFixed(1)):0}});
}catch(e){next(e);}});
router.get('/candidate-summary',async(_,res,next)=>{try{
  const candidates=await User.aggregate([
    {$match:{role:'user'}},
    {$lookup:{from:'interviews',localField:'_id',foreignField:'owner',as:'interviews'}},
    {$project:{name:1,email:1,phone:1,active:1,createdAt:1,lastLogin:1,totalInterviews:{$size:'$interviews'},selected:{$size:{$filter:{input:'$interviews',as:'i',cond:{$in:['$$i.status',['Selected','Placed']]}}}},placed:{$size:{$filter:{input:'$interviews',as:'i',cond:{$eq:['$$i.status','Placed']}}}},inProgress:{$size:{$filter:{input:'$interviews',as:'i',cond:{$eq:['$$i.status','In Progress']}}}},scheduled:{$size:{$filter:{input:'$interviews',as:'i',cond:{$eq:['$$i.status','Scheduled']}}}},lastInterview:{$max:'$interviews.interviewDate'}}},
    {$sort:{totalInterviews:-1,name:1}}
  ]);
  res.json(candidates);
}catch(e){next(e);}});
router.get('/users',async(_,res,next)=>{try{res.json(await User.find().select('-password').sort({createdAt:-1}));}catch(e){next(e);}});
router.post('/staff',async(req,res,next)=>{try{const {name,email,password,phone,permissions}=req.body;if(!name||!email||!password)return res.status(400).json({message:'Name, email and password required'});const user=await User.create({name,email,password:await bcrypt.hash(password,12),phone,role:'staff',permissions});res.status(201).json({id:user._id,name:user.name,email:user.email,role:user.role,permissions:user.permissions});}catch(e){e.code===11000?res.status(409).json({message:'Email already exists'}):next(e);}});
router.patch('/users/:id',async(req,res,next)=>{try{const target=await User.findById(req.params.id);if(!target)return res.status(404).json({message:'User not found'});if(typeof req.body.active==='boolean')target.active=req.body.active;if(target.role==='staff'&&req.body.permissions){for(const key of ['dashboard','interviews','createInterview','exportInterviews','selfAssign','googleSheet'])if(typeof req.body.permissions[key]==='boolean')target.permissions[key]=req.body.permissions[key];if(['today','all'].includes(req.body.permissions.googleSheetScope))target.permissions.googleSheetScope=req.body.permissions.googleSheetScope;}await target.save();const user=target.toObject();delete user.password;res.json(user);}catch(e){next(e);}});
router.get('/audit',async(req,res,next)=>{try{res.json(await AuditLog.find().populate('user','name email role').sort({createdAt:-1}).limit(100));}catch(e){next(e);}});
export default router;
