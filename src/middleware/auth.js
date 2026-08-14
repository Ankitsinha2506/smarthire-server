import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.active) return res.status(401).json({ message: 'Account unavailable' });
    req.user = user;
    next();
  } catch { res.status(401).json({ message: 'Invalid or expired session' }); }
};

export const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have permission' });

export const permit = permission => (req,res,next) =>
  req.user.role !== 'staff' || req.user.permissions?.[permission] !== false
    ? next()
    : res.status(403).json({message:'Your staff account does not have access to this feature'});
