const auth = require('../services/authService');
const User = require('../models/User');
const { fail } = require('../utils/response');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return fail(res, 'UNAUTHORIZED', 'Missing bearer token', null, 401);
  const decoded = auth.verifyToken(m[1]);
  if (!decoded) return fail(res, 'UNAUTHORIZED', 'Invalid or expired token', null, 401);
  const session = await auth.validateSession(decoded.sid);
  if (!session) return fail(res, 'UNAUTHORIZED', 'Session no longer valid', null, 401);
  const user = await User.findById(decoded.sub);
  if (!user || user.status !== 'active') return fail(res, 'UNAUTHORIZED', 'User not active', null, 401);
  const rs = await auth.loadRolesAndScopes(user._id);
  req.user = user;
  req.session = session;
  req.roles = rs.roles;
  req.scopes = rs.scopes;
  req.auditContext = {
    actorUserId: user._id,
    actorUsername: user.username,
    ip: req.ip,
    deviceDescriptor: req.headers['x-device-descriptor'] || null,
  };
  next();
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.roles || !req.roles.some(r => allowed.includes(r))) {
      return fail(res, 'FORBIDDEN', 'Insufficient role', { allowed }, 403);
    }
    next();
  };
}

function requireCapability(cap) {
  const roleCaps = require('../services/rbac').roleCapabilities;
  return (req, res, next) => {
    const caps = new Set();
    for (const r of (req.roles || [])) for (const c of (roleCaps[r] || [])) caps.add(c);
    if (!caps.has(cap)) return fail(res, 'FORBIDDEN', 'Missing capability', { capability: cap }, 403);
    next();
  };
}

module.exports = { requireAuth, requireRole, requireCapability };
