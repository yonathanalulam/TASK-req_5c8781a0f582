// Capability matrix derived from PRD §11.2 / §11.4
const roleCapabilities = {
  student: [
    'catalog.browse', 'service_request.create.own',
    'item.view.own', 'appeal.submit.own',
    'shipping.view.own', 'export.own',
  ],
  faculty_advisor: [
    'catalog.browse', 'item.view.scoped', 'exception.view.scoped',
    'appeal.comment.scoped', 'export.scoped', 'contract.view.scoped',
  ],
  corporate_mentor: [
    'catalog.browse', 'item.view.scoped_cohort',
    'exception.view.scoped_cohort', 'appeal.approve.scoped_cohort',
    'export.scoped_cohort',
  ],
  operations_staff: [
    'catalog.browse',
    'shoe.intake.create', 'shoe.attachment.upload',
    'custody.scan', 'custody.manual_entry',
    'shoe.history.view', 'shipping.create', 'shipping.fulfill',
    'delivery.proof.capture', 'delivery.exception.signoff',
    'service_request.create.on_behalf',
  ],
  department_admin: [
    'catalog.browse', 'catalog.manage',
    'contract.create', 'contract.amend', 'contract.renew', 'contract.terminate',
    'contract.view.all', 'billing.rule.manage', 'billing.override',
    'deposit.manage', 'reconciliation.manage',
    'access.manage', 'user.manage', 'role.manage', 'scope.manage',
    'exception.view.all', 'appeal.approve.all', 'appeal.override',
    'tag.manage', 'tag.rule.manage',
    'import.run', 'export.all', 'export.unmask',
    'view_financial_sensitive', 'unmask_export',
    'shoe.intake.create', 'custody.scan',
    'shipping.create', 'shipping.fulfill',
    'force_logout',
  ],
  security_admin: [
    'force_logout', 'audit.view', 'audit.verify',
    'user.unlock', 'access.manage', 'session.revoke',
    'key.rotate', 'export.security',
  ],
  job_runner: [
    'job.execute',
  ],
};

function capabilitiesOf(roles = []) {
  const caps = new Set();
  for (const r of roles) for (const c of (roleCapabilities[r] || [])) caps.add(c);
  return caps;
}

function hasCapability(roles, cap) {
  return capabilitiesOf(roles).has(cap);
}

// Determine if a record with scope tags is visible to the user.
// scopes: user's ScopeAssignment list ({dimension, value})
// recordScopes: same shape, describing record scope tags (any-of match)
function scopeMatches(userScopes, recordScopes, { roles = [] } = {}) {
  if (roles.includes('department_admin') || roles.includes('security_admin')) return true;
  if (!recordScopes || recordScopes.length === 0) return true;
  if (userScopes.some(s => s.dimension === 'global' && s.value === '*')) return true;
  for (const rs of recordScopes) {
    for (const us of userScopes) {
      if (us.dimension === rs.dimension && (us.value === '*' || us.value === rs.value)) return true;
    }
  }
  return false;
}

module.exports = { roleCapabilities, capabilitiesOf, hasCapability, scopeMatches };
