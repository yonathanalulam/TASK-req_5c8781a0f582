const APPEAL_TRANSITIONS = {
  draft: ['submitted','withdrawn'],
  submitted: ['under_review','withdrawn'],
  under_review: ['approved','denied','remanded'],
  remanded: ['resubmitted','withdrawn'],
  resubmitted: ['under_review'],
  approved: [],
  denied: [],
  withdrawn: [],
};

const EXCEPTION_TRANSITIONS = {
  open: ['under_review','appealed','resolved','dismissed'],
  under_review: ['appealed','resolved','dismissed'],
  appealed: ['appeal_under_review','resolved'],
  appeal_under_review: ['appeal_approved','appeal_denied','appeal_remanded'],
  appeal_remanded: ['appealed','resolved','dismissed'],
  appeal_approved: ['resolved'],
  appeal_denied: ['resolved'],
  resolved: [],
  dismissed: [],
};

function canAppealTransition(from, to) { return (APPEAL_TRANSITIONS[from] || []).includes(to); }
function canExceptionTransition(from, to) { return (EXCEPTION_TRANSITIONS[from] || []).includes(to); }

module.exports = { APPEAL_TRANSITIONS, EXCEPTION_TRANSITIONS, canAppealTransition, canExceptionTransition };
