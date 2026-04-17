const shoe = require('../../src/services/shoeStateMachine');
const shipping = require('../../src/services/shippingStateMachine');
const appeal = require('../../src/services/appealStateMachine');
const contract = require('../../src/services/contractStateMachine');

describe('state machines', () => {
  test('shoe intake flow', () => {
    expect(shoe.canTransition('intake_draft', 'intake_completed')).toBe(true);
    expect(shoe.canTransition('intake_draft', 'delivered')).toBe(false);
    expect(shoe.canTransition('in_transit', 'delivered')).toBe(true);
    expect(shoe.canTransition('delivered', 'closed')).toBe(true);
    expect(shoe.canTransition('closed', 'open')).toBe(false);
  });
  test('shipping lifecycle', () => {
    expect(shipping.canTransition('queued_offline', 'ready_to_ship')).toBe(true);
    expect(shipping.canTransition('delivered', 'closed')).toBe(true);
    expect(shipping.canTransition('cancelled', 'delivered')).toBe(false);
  });
  test('appeal + exception transitions', () => {
    expect(appeal.canAppealTransition('draft', 'submitted')).toBe(true);
    expect(appeal.canAppealTransition('submitted', 'under_review')).toBe(true);
    expect(appeal.canAppealTransition('approved', 'denied')).toBe(false);
    expect(appeal.canExceptionTransition('open', 'appealed')).toBe(true);
    expect(appeal.canExceptionTransition('resolved', 'open')).toBe(false);
  });
  test('contract lifecycle', () => {
    expect(contract.canTransition('draft', 'active')).toBe(true);
    expect(contract.canTransition('active', 'terminated')).toBe(true);
    expect(contract.canTransition('terminated', 'reconciliation_pending')).toBe(true);
    expect(contract.canTransition('closed', 'active')).toBe(false);
  });
});
