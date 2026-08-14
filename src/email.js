import nodemailer from 'nodemailer';

export async function sendPasswordOtp(to,otp){
  if(!process.env.SMTP_HOST||!process.env.SMTP_USER||!process.env.SMTP_PASS)throw Object.assign(new Error('Password reset email is not configured. Contact the administrator.'),{status:503});
  const transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});
  await transporter.sendMail({from:process.env.MAIL_FROM||process.env.SMTP_USER,to,subject:'SmartHire password reset OTP',text:`Your SmartHire password reset OTP is ${otp}. It expires in 10 minutes. Do not share this code.`,html:`<div style="font-family:Arial;padding:24px"><h2>Reset your password</h2><p>Your one-time verification code is:</p><div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#6d54de">${otp}</div><p>This code expires in 10 minutes. Do not share it with anyone.</p></div>`});
}
