import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';
import AuditLog from '../models/AuditLog.js';
import {sendPasswordOtp} from '../email.js';

const router = express.Router();
const sign = user => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
const safe = user => ({ id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, permissions:user.permissions });

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !phone || !password) return res.status(400).json({ message: 'Candidate name, email, mobile number and password are required' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    if (await User.exists({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({ name, email, phone, password: await bcrypt.hash(password, 12), role: 'user' });
    res.status(201).json({ token: sign(user), user: safe(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!user || !user.active || !await bcrypt.compare(req.body.password || '', user.password)) return res.status(401).json({ message: 'Invalid email or password' });
    user.lastLogin = new Date(); await user.save();
    res.json({ token: sign(user), user: safe(user) });
  } catch (e) { next(e); }
});

router.get('/me', auth, (req, res) => res.json({ user: safe(req.user) }));
router.post('/forgot-password',async(req,res,next)=>{try{const email=String(req.body.email||'').trim().toLowerCase(),user=await User.findOne({email,role:{$in:['staff','user']}}).select('+resetOtpHash +resetOtpExpires +resetOtpAttempts');if(user){const otp=String(crypto.randomInt(100000,1000000));user.resetOtpHash=crypto.createHash('sha256').update(otp).digest('hex');user.resetOtpExpires=new Date(Date.now()+10*60*1000);user.resetOtpAttempts=0;await user.save();await sendPasswordOtp(user.email,otp);}res.json({message:'If an eligible account exists, a verification code has been sent.'});}catch(e){next(e);}});
router.post('/reset-password',async(req,res,next)=>{try{const {email,otp,newPassword,confirmPassword}=req.body;if(newPassword!==confirmPassword)return res.status(400).json({message:'New password and confirmation do not match'});if(!newPassword||newPassword.length<8)return res.status(400).json({message:'Password must be at least 8 characters'});const user=await User.findOne({email:String(email||'').trim().toLowerCase(),role:{$in:['staff','user']}}).select('+resetOtpHash +resetOtpExpires +resetOtpAttempts');const hash=crypto.createHash('sha256').update(String(otp||'')).digest('hex');if(!user||!user.resetOtpHash||user.resetOtpExpires<new Date()||user.resetOtpAttempts>=5||user.resetOtpHash!==hash){if(user){user.resetOtpAttempts+=1;await user.save()}return res.status(400).json({message:'Invalid or expired verification code'});}user.password=await bcrypt.hash(newPassword,12);user.passwordResetAt=new Date();user.resetOtpHash=undefined;user.resetOtpExpires=undefined;user.resetOtpAttempts=0;await user.save();await AuditLog.create({user:user._id,action:'UPDATE',resource:'security',details:{event:'PASSWORD_RESET',role:user.role},ip:req.ip});res.json({message:'Password reset successfully. You can now sign in.'});}catch(e){next(e);}});
router.post('/change-password',auth,async(req,res,next)=>{try{if(!['admin','staff','user'].includes(req.user.role))return res.status(403).json({message:'Password change is not available for this account'});const {currentPassword,newPassword,confirmPassword}=req.body;if(newPassword!==confirmPassword)return res.status(400).json({message:'New password and confirmation do not match'});if(!newPassword||newPassword.length<8)return res.status(400).json({message:'Password must be at least 8 characters'});const user=await User.findById(req.user._id);if(!await bcrypt.compare(currentPassword||'',user.password))return res.status(400).json({message:'Current password is incorrect'});user.password=await bcrypt.hash(newPassword,12);user.passwordChangedAt=new Date();await user.save();await AuditLog.create({user:user._id,action:'UPDATE',resource:'security',details:{event:'PASSWORD_CHANGED',role:user.role},ip:req.ip});res.json({message:'Password changed successfully'});}catch(e){next(e);}});
export default router;
