const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ msg: 'No token provided' });
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ msg: 'User not found' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ msg: 'Invalid token' });
  }
};
