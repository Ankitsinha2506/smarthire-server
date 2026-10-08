import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import {sendStaffWelcomeEmail} from '../email.js';

export async function createStaff(body, sendWelcome = sendStaffWelcomeEmail) {
  const {name,email,password,phone,permissions}=body;
  if(!name || !email || !password || !phone) throw Object.assign(new Error('Name, email, mobile number and password are required'),{status:400});
  if(typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password,'utf8') > 72) throw Object.assign(new Error('Password must be at least 8 characters and at most 72 bytes'),{status:400});
  const user=await User.create({name,email,password:await bcrypt.hash(password,12),phone,role:'staff',permissions});
  // The plaintext password exists only in this request and the outgoing email.
  // A delivery failure must never turn a saved account into a failed creation response.
  let welcomeEmailSent=false;
  try {await sendWelcome(user,password);welcomeEmailSent=true} catch { /* Return an explicit delivery warning without logging credentials. */ }
  return {id:user._id,name:user.name,email:user.email,role:user.role,permissions:user.permissions,welcomeEmailSent,message:welcomeEmailSent?'Staff account created. Login details emailed successfully.':'Staff account created, but the welcome email could not be sent. Share the temporary credentials with the staff member or use password reset.'};
}
