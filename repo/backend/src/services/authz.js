// Centralized authorization policies.
//
// Three-layer model for every protected action:
//  1) requireCapability(...)           — route-level, in middleware
//  2) canView<Entity>(req, entity)     — object-level ownership/scope
//  3) canTransition<Entity>(...)       — function-level per-action permission
//
// Keep this module free of I/O. Callers pass `req` (with {user, roles, scopes})
// and the entity doc; policies return booleans. Express handlers decide how to
// turn a false into a 403/404.

const rbac = require('./rbac');

const ADMIN_ROLES = ['department_admin', 'security_admin'];
const ALL_SEEING = ['department_admin', 'security_admin'];

function hasAnyRole(req, ...roles) {
  const have = req.roles || [];
  return have.some(r => roles.includes(r));
}

function hasCapability(req, cap) {
  return rbac.hasCapability(req.roles || [], cap);
}

function isOwner(req, entity, key = 'ownerUserId') {
  return entity && String(entity[key]) === String(req.user._id);
}

function scopeMatches(req, entity) {
  return rbac.scopeMatches(req.scopes || [], entity.scopes || [], { roles: req.roles || [] });
}

// ===== Shoe profiles =====
// Deny-by-default: unrelated authenticated users must not gain access merely because
// a shoe record has empty/missing scope tags. Scoped reviewers can only see shoes that
// carry at least one scope tag overlapping their own scope assignments.
function canViewShoe(req, profile) {
  if (!profile) return false;
  if (hasAnyRole(req, ...ALL_SEEING, 'operations_staff')) return true;
  if (isOwner(req, profile)) return true;
  if (hasAnyRole(req, 'faculty_advisor', 'corporate_mentor')) {
    const recordScopes = profile.scopes || [];
    if (recordScopes.length === 0) return false; // do not broaden via empty scopes
    return rbac.scopeMatches(req.scopes || [], recordScopes, { roles: req.roles || [] });
  }
  return false;
}

// ===== Custody lookup =====
// Same visibility as the underlying shoe; rejects plain students for items they don't own.
function canViewCustodyForShoe(req, profile) { return canViewShoe(req, profile); }

// ===== Shipping orders =====
function canViewShippingOrder(req, order, { shoe = null } = {}) {
  if (hasAnyRole(req, ...ALL_SEEING, 'operations_staff')) return true;
  // Students see orders whose shoe they own.
  if (shoe && isOwner(req, shoe)) return true;
  if (hasAnyRole(req, 'faculty_advisor', 'corporate_mentor')) {
    // scopes live on the shoe; require caller to pass `shoe`.
    if (shoe) return scopeMatches(req, shoe);
  }
  return false;
}

function canActOnShipping(req) {
  return hasAnyRole(req, 'operations_staff', 'department_admin');
}

// ===== Exceptions =====
function canViewException(req, ex) {
  if (hasAnyRole(req, ...ALL_SEEING, 'operations_staff')) return true;
  if (ex.subjectUserId && String(ex.subjectUserId) === String(req.user._id)) return true;
  if (hasAnyRole(req, 'faculty_advisor', 'corporate_mentor')) return scopeMatches(req, ex);
  return false;
}

// Exception status transitions are reviewer/admin only (not subject).
// "open → resolved/dismissed/under_review" require ops/admin/reviewer authority.
const REVIEWER_ROLES = ['operations_staff', 'department_admin', 'security_admin', 'faculty_advisor', 'corporate_mentor'];
function canTransitionException(req, ex, to) {
  if (!canViewException(req, ex)) return false;
  // Subjects alone cannot transition their own exceptions.
  const isSubject = ex.subjectUserId && String(ex.subjectUserId) === String(req.user._id);
  if (isSubject && !hasAnyRole(req, ...REVIEWER_ROLES)) return false;
  // Scope-bounded reviewers limited to their scope.
  if (hasAnyRole(req, 'corporate_mentor', 'faculty_advisor') && !scopeMatches(req, ex)) return false;
  // `resolved` / `dismissed` require admin or ops when closing, to prevent mentor unilateral closure on non-appeal paths.
  if (['resolved', 'dismissed'].includes(to) && !hasAnyRole(req, 'department_admin', 'operations_staff', 'security_admin')) {
    return false;
  }
  return hasAnyRole(req, ...REVIEWER_ROLES);
}

// ===== Appeals =====
function canViewAppeal(req, appeal, { exception = null } = {}) {
  if (hasAnyRole(req, ...ALL_SEEING, 'operations_staff')) return true;
  if (String(appeal.appellantUserId) === String(req.user._id)) return true;
  if (hasAnyRole(req, 'faculty_advisor', 'corporate_mentor')) {
    const effectiveScopes = (appeal.scopes && appeal.scopes.length) ? { scopes: appeal.scopes } : (exception || { scopes: [] });
    return rbac.scopeMatches(req.scopes || [], effectiveScopes.scopes || [], { roles: req.roles || [] });
  }
  return false;
}

function isCohortException(ex) {
  return (ex.scopes || []).some(s => s.dimension === 'internship_cohort');
}

// Only reviewers/admins may start review or decide an appeal.
// "canApprove" additionally enforces cohort-scoped mentor limits and is consistent
// with the prior local helper in appeals.js.
function canStartReview(req, exceptionOrAppealScopes) {
  if (hasAnyRole(req, 'department_admin')) return true;
  if (hasAnyRole(req, 'corporate_mentor', 'faculty_advisor')) {
    return rbac.scopeMatches(req.scopes || [], exceptionOrAppealScopes || [], { roles: req.roles || [] });
  }
  return false;
}

function canDecideAppeal(req, ex) {
  if (hasAnyRole(req, 'department_admin')) return true;
  if (isCohortException(ex) && hasAnyRole(req, 'corporate_mentor')) {
    return rbac.scopeMatches(req.scopes || [], ex.scopes || [], { roles: req.roles || [] });
  }
  // Faculty advisors are comment-only by default per PRD §11.2.
  return false;
}

// Appellant (or admin on-behalf) may withdraw their own appeal.
function canWithdrawAppeal(req, appeal) {
  if (hasAnyRole(req, 'department_admin')) return true;
  return String(appeal.appellantUserId) === String(req.user._id);
}

// ===== Reports / KPIs =====
// PRD restricts KPI dashboards to admins / scoped reviewers. Students do not need the platform-wide KPIs.
// Access modes:
//   'global' — admins/security_admins and ops without specific scope constraints see site-wide aggregates.
//   'scoped' — faculty_advisor/corporate_mentor (or ops with explicit non-global scopes) see aggregates filtered to their scope.
//   'deny'   — everyone else, including scoped reviewers with no effective scope assignments (do NOT fall back to global).
function kpiAccessMode(req) {
  if (hasAnyRole(req, ...ALL_SEEING)) return 'global';
  const userScopes = req.scopes || [];
  const hasGlobalScope = userScopes.some(s => s.dimension === 'global' && s.value === '*');
  const hasSpecificScope = userScopes.some(s => !(s.dimension === 'global' && s.value === '*'));
  if (hasAnyRole(req, 'operations_staff')) {
    // ops is all-seeing unless narrowed by explicit non-global scope assignments
    if (hasGlobalScope || !hasSpecificScope) return 'global';
    return 'scoped';
  }
  if (hasAnyRole(req, 'faculty_advisor', 'corporate_mentor')) {
    if (hasGlobalScope) return 'global';
    if (hasSpecificScope) return 'scoped';
    // no effective scope → deny rather than silently leak global totals
    return 'deny';
  }
  return 'deny';
}

function canReadKpis(req) {
  return kpiAccessMode(req) !== 'deny';
}

// Build a $match filter over a record's `scopes` array for a scoped reviewer.
// Returns {} for effectively-global callers, or null when the caller has no
// effective scope (so callers can deny instead of silently reading everything).
function scopeFilterForReviewer(req) {
  const userScopes = req.scopes || [];
  if (userScopes.some(s => s.dimension === 'global' && s.value === '*')) return {};
  const clauses = [];
  for (const s of userScopes) {
    const match = s.value === '*'
      ? { dimension: s.dimension }
      : { dimension: s.dimension, value: s.value };
    clauses.push({ scopes: { $elemMatch: match } });
  }
  if (clauses.length === 0) return null;
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

// Build a ScopeAssignment filter for "users that share at least one of the caller's scopes".
// Useful for KPIs/queries that must resolve a scoped user set rather than a record.scopes array.
function scopeAssignmentFilterForReviewer(req) {
  const userScopes = req.scopes || [];
  if (userScopes.some(s => s.dimension === 'global' && s.value === '*')) return {};
  const or = [];
  for (const s of userScopes) {
    if (s.value === '*') or.push({ dimension: s.dimension });
    else or.push({ dimension: s.dimension, value: s.value });
  }
  if (or.length === 0) return null;
  return or.length === 1 ? or[0] : { $or: or };
}

// ===== Tags =====
// Target-user scope must be resolved (by caller) and passed in as `targetScopes`,
// keeping this module I/O-free. `targetScopes` is an array of {dimension, value}.
function canReadTagsForUser(req, targetUserId, { targetScopes = [] } = {}) {
  if (hasAnyRole(req, 'department_admin', 'security_admin')) return true;
  if (String(targetUserId) === String(req.user._id)) return true;
  if (!hasAnyRole(req, 'faculty_advisor', 'corporate_mentor', 'operations_staff')) return false;

  const userScopes = req.scopes || [];
  const hasGlobalScope = userScopes.some(s => s.dimension === 'global' && s.value === '*');
  const hasSpecificScope = userScopes.some(s => !(s.dimension === 'global' && s.value === '*'));

  // ops without explicit non-global scope assignments retains its internal-staff all-seeing behaviour.
  const opsOnly = hasAnyRole(req, 'operations_staff') && !hasAnyRole(req, 'faculty_advisor', 'corporate_mentor');
  if (opsOnly && !hasSpecificScope) return true;

  if (hasGlobalScope) return true;

  // Strict intersection: target must have a scope that overlaps the caller's.
  // Unscoped target users are NOT visible to scoped reviewers (prevents arbitrary-user enumeration).
  if (!targetScopes || targetScopes.length === 0) return false;
  for (const ts of targetScopes) {
    for (const us of userScopes) {
      if (us.dimension === ts.dimension && (us.value === '*' || us.value === ts.value)) return true;
    }
  }
  return false;
}

// ===== Service requests =====
function canViewServiceRequest(req, sr) {
  if (hasAnyRole(req, ...ALL_SEEING, 'operations_staff')) return true;
  if (String(sr.requesterUserId) === String(req.user._id)) return true;
  if (sr.onBehalfOfUserId && String(sr.onBehalfOfUserId) === String(req.user._id)) return true;
  if (hasAnyRole(req, 'faculty_advisor', 'corporate_mentor')) {
    return rbac.scopeMatches(req.scopes || [], sr.scopes || [], { roles: req.roles || [] });
  }
  return false;
}
function canCancelServiceRequest(req, sr) {
  if (hasAnyRole(req, 'department_admin', 'operations_staff')) return true;
  return String(sr.requesterUserId) === String(req.user._id);
}

// ===== MongoDB scope filters =====
// Build a $match filter that lists only records the current caller is allowed to see.
// `entityKind` controls the owner-field name and whether scopes apply.
function listFilterFor(req, entityKind) {
  const roles = req.roles || [];
  const userId = req.user._id;
  const ownerField = {
    shoe: 'ownerUserId',
    shipping: null, // shipping has no direct owner field; filter via populated shoe owner
    exception: 'subjectUserId',
    appeal: 'appellantUserId',
    service_request: 'requesterUserId',
  }[entityKind];

  if (roles.some(r => ALL_SEEING.includes(r)) || (entityKind !== 'appeal' && roles.includes('operations_staff'))) return {};

  const orClauses = [];
  if (ownerField) orClauses.push({ [ownerField]: userId });
  if (entityKind === 'appeal') orClauses.push({ appellantUserId: userId });

  // Scope matching for faculty/mentor using the record.scopes array.
  if (roles.includes('faculty_advisor') || roles.includes('corporate_mentor')) {
    const userScopes = req.scopes || [];
    const clauses = [];
    for (const s of userScopes) {
      if (s.dimension === 'global' && s.value === '*') return {}; // global scope
      clauses.push({ scopes: { $elemMatch: { dimension: s.dimension, value: s.value === '*' ? { $exists: true } : s.value } } });
    }
    if (clauses.length) orClauses.push({ $or: clauses });
  }

  // Pure students only see own.
  if (orClauses.length === 0) orClauses.push({ [ownerField || '_id']: userId });
  return orClauses.length === 1 ? orClauses[0] : { $or: orClauses };
}

module.exports = {
  hasAnyRole, hasCapability, isOwner, scopeMatches,
  canViewShoe, canViewCustodyForShoe,
  canViewShippingOrder, canActOnShipping,
  canViewException, canTransitionException,
  canViewAppeal, canStartReview, canDecideAppeal, canWithdrawAppeal,
  canReadKpis, kpiAccessMode, scopeFilterForReviewer, scopeAssignmentFilterForReviewer, canReadTagsForUser,
  canViewServiceRequest, canCancelServiceRequest,
  listFilterFor,
  REVIEWER_ROLES, ADMIN_ROLES,
};
