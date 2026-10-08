import nodemailer from 'nodemailer';

export async function sendPasswordOtp(to,otp){
  if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS)throw Object.assign(new Error('Password reset email is not configured. Contact the administrator.'),{status:503});
  const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
  await transporter.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to,subject:'SmartHire password reset OTP',text:`Your SmartHire password reset OTP is ${otp}. It expires in 10 minutes. Do not share this code.`,html:`<div style="font-family:Arial;padding:24px"><h2>Reset your password</h2><p>Your one-time verification code is:</p><div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#6d54de">${otp}</div><p>This code expires in 10 minutes. Do not share it with anyone.</p></div>`});
}

export async function sendSupportEmail(staff, details, kind) {
  const {supportMessage} = await import('./services/supportNotificationDetails.js');
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('Support email SMTP is not configured');
  const transporter = nodemailer.createTransport({host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_SECURE === 'true', auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS}, connectionTimeout: 15000, socketTimeout: 30000});
  const message = supportMessage(staff.name, details, kind);
  const escape = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const address = process.env.SUPPORT_MAIL_FROM || process.env.MAIL_FROM || process.env.SMTP_USER;
  const email = address.match(/<([^>]+)>/)?.[1] || address;
  await transporter.sendMail({from: {name: 'SmartHire : SmartGroup', address: email}, to: staff.email, ...message, html: `<div style="font-family:Arial,sans-serif;line-height:1.7;padding:24px"><h2>${escape(message.subject)}</h2><div style="white-space:pre-line">${escape(message.text)}</div></div>`});
}

export async function sendStaffWelcomeEmail(staff, password) {
  const {staffWelcomeMessage} = await import('./services/staffWelcome.js');
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw new Error('Staff welcome email SMTP is not configured');
  const message = staffWelcomeMessage({name:staff.name,email:staff.email,password,clientUrl:process.env.CLIENT_URL || 'https://smarthire-amber.vercel.app/'});
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const address = from.match(/<([^>]+)>/)?.[1] || from;
  const transporter = nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT || 587),secure:process.env.SMTP_SECURE === 'true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:15000,socketTimeout:30000});
  await transporter.sendMail({from:{name:'SmartHire : SmartGroup',address},to:staff.email,...message});
}
