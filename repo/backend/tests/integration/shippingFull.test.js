const request = require('supertest');
const { startTestDb, stopTestDb, clearAll } = require('../setupTestDb');
const { createApp } = require('../../src/app');
const { makeUser, loginAs, auth } = require('./helpers');
const ShoeProfile = require('../../src/models/ShoeProfile');
const SavedAddress = require('../../src/models/SavedAddress');
const ShippingOrder = require('../../src/models/ShippingOrder');
const ProofOfDelivery = require('../../src/models/ProofOfDelivery');
const DeliveryException = require('../../src/models/DeliveryException');
const barcode = require('../../src/services/barcodeService');
const { encryptField } = require('../../src/utils/crypto');

let app;
beforeAll(async () => { await startTestDb(); app = createApp(); });
afterAll(async () => { await stopTestDb(); });
beforeEach(async () => { await clearAll(); });

async function makeShoeAndAddress(owner, status = 'ready_for_delivery') {
  const serial = 'SHP-' + Math.random().toString(36).slice(2);
  const bc = await barcode.generateUniqueBarcode(ShoeProfile, serial);
  const shoe = await ShoeProfile.create({
    serial, barcode: bc, ownerUserId: owner._id, brand: 'Acme', size: '10', status,
  });
  const addr = await SavedAddress.create({
    ownerUserId: owner._id, label: 'home', country: 'US',
    line1Enc: encryptField('1 Main'), cityEnc: encryptField('City'),
    stateEnc: encryptField('CA'), postalCodeEnc: encryptField('90000'),
    maskedPreview: '***, ***, CA 90000',
  });
  return { shoe, addr };
}

async function createOrder(opsTok, shoeId, addressId) {
  const r = await auth(request(app).post('/api/v1/shipping').send({
    shoeProfileId: String(shoeId), addressId: String(addressId),
    fulfillmentOperator: 'ops1', method: 'standard',
  }), opsTok);
  return r;
}

describe('POST /api/v1/shipping', () => {
  test('validation: missing required fields returns 422', async () => {
    await makeUser('ops1', ['operations_staff']);
    const tok = await loginAs(app, 'ops1');
    const r = await auth(request(app).post('/api/v1/shipping').send({ fulfillmentOperator: 'ops1' }), tok);
    expect(r.status).toBe(422);
  });

  test('unknown shoe returns 404', async () => {
    const owner = await makeUser('own1', ['student']);
    const { addr } = await makeShoeAndAddress(owner);
    await makeUser('ops2', ['operations_staff']);
    const tok = await loginAs(app, 'ops2');
    const r = await auth(request(app).post('/api/v1/shipping').send({
      shoeProfileId: '000000000000000000000000', addressId: String(addr._id), fulfillmentOperator: 'ops1',
    }), tok);
    expect(r.status).toBe(404);
  });

  test('shoe in wrong state returns 409 INVALID_STATE', async () => {
    const owner = await makeUser('own2', ['student']);
    const { shoe, addr } = await makeShoeAndAddress(owner, 'intake_draft');
    await makeUser('ops3', ['operations_staff']);
    const tok = await loginAs(app, 'ops3');
    const r = await auth(request(app).post('/api/v1/shipping').send({
      shoeProfileId: String(shoe._id), addressId: String(addr._id), fulfillmentOperator: 'ops1',
    }), tok);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('INVALID_STATE');
  });

  test('non-US address returns 422', async () => {
    const owner = await makeUser('own3', ['student']);
    const { shoe } = await makeShoeAndAddress(owner);
    const addr = await SavedAddress.create({
      ownerUserId: owner._id, label: 'intl', country: 'CA',
      line1Enc: encryptField('x'), cityEnc: encryptField('x'),
      stateEnc: encryptField('x'), postalCodeEnc: encryptField('x'),
      maskedPreview: 'x',
    });
    await makeUser('ops4', ['operations_staff']);
    const tok = await loginAs(app, 'ops4');
    const r = await auth(request(app).post('/api/v1/shipping').send({
      shoeProfileId: String(shoe._id), addressId: String(addr._id), fulfillmentOperator: 'ops1',
    }), tok);
    expect(r.status).toBe(422);
  });

  test('ops creates a shipping order (201 with created order)', async () => {
    const owner = await makeUser('own4', ['student']);
    const { shoe, addr } = await makeShoeAndAddress(owner);
    await makeUser('ops5', ['operations_staff']);
    const tok = await loginAs(app, 'ops5');
    const r = await createOrder(tok, shoe._id, addr._id);
    expect(r.status).toBe(201);
    expect(r.body.data.shoeProfileId).toBe(String(shoe._id));
    expect(r.body.data.status).toBe('draft');
  });

  test('student cannot create shipping order (403)', async () => {
    const owner = await makeUser('own5', ['student']);
    const { shoe, addr } = await makeShoeAndAddress(owner);
    const tok = await loginAs(app, 'own5');
    const r = await auth(request(app).post('/api/v1/shipping').send({
      shoeProfileId: String(shoe._id), addressId: String(addr._id), fulfillmentOperator: 'ops1',
    }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/shipping/:id/transition', () => {
  async function setupOrder() {
    const owner = await makeUser('ownT', ['student']);
    const { shoe, addr } = await makeShoeAndAddress(owner);
    await makeUser('opsT', ['operations_staff']);
    const tok = await loginAs(app, 'opsT');
    const ord = await createOrder(tok, shoe._id, addr._id);
    return { tok, order: ord.body.data, shoe, addr };
  }

  test('transition draft→ready_to_ship succeeds', async () => {
    const { tok, order } = await setupOrder();
    const r = await auth(request(app).post(`/api/v1/shipping/${order._id}/transition`).send({ to: 'ready_to_ship' }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('ready_to_ship');
  });

  test('illegal transition returns 409 ILLEGAL_TRANSITION', async () => {
    const { tok, order } = await setupOrder();
    const r = await auth(request(app).post(`/api/v1/shipping/${order._id}/transition`).send({ to: 'delivered' }), tok);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('ILLEGAL_TRANSITION');
  });

  test('unknown order returns 404', async () => {
    await makeUser('opsU', ['operations_staff']);
    const tok = await loginAs(app, 'opsU');
    const r = await auth(request(app).post('/api/v1/shipping/000000000000000000000000/transition').send({ to: 'ready_to_ship' }), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot transition (403)', async () => {
    const { order } = await setupOrder();
    await makeUser('stu9', ['student']);
    const tok = await loginAs(app, 'stu9');
    const r = await auth(request(app).post(`/api/v1/shipping/${order._id}/transition`).send({ to: 'ready_to_ship' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/shipping/:id/proof-of-delivery', () => {
  async function readyInTransit() {
    const owner = await makeUser('ownP', ['student']);
    const { shoe, addr } = await makeShoeAndAddress(owner);
    await makeUser('opsP', ['operations_staff']);
    const tok = await loginAs(app, 'opsP');
    const ord = await createOrder(tok, shoe._id, addr._id);
    const orderId = ord.body.data._id;
    await auth(request(app).post(`/api/v1/shipping/${orderId}/transition`).send({ to: 'ready_to_ship' }), tok);
    await auth(request(app).post(`/api/v1/shipping/${orderId}/transition`).send({ to: 'in_transit' }), tok);
    return { tok, orderId };
  }

  test('signature file captured → POD created and order delivered', async () => {
    const { tok, orderId } = await readyInTransit();
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const png = Buffer.concat([pngHeader, Buffer.from('minimal-png-body-bytes')]);
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/proof-of-delivery`).field('recipientName', 'Jane Recipient').attach('signature', png, { filename: 'sig.png', contentType: 'image/png' }), tok);
    expect(r.status).toBe(201);
    expect(r.body.data.recipientName).toBe('Jane Recipient');
    expect(r.body.data.shippingOrderId).toBe(String(orderId));
    const order = await ShippingOrder.findById(orderId);
    expect(order.status).toBe('delivered');
  });

  test('no signature and no override returns 422', async () => {
    const { tok, orderId } = await readyInTransit();
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/proof-of-delivery`).send({}), tok);
    expect(r.status).toBe(422);
  });

  test('override without reason returns 422', async () => {
    const { tok, orderId } = await readyInTransit();
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/proof-of-delivery`).field('overrideApproval', 'true'), tok);
    expect(r.status).toBe(422);
  });

  test('override by non-admin role returns 403', async () => {
    const { tok, orderId } = await readyInTransit();
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/proof-of-delivery`).field('overrideApproval', 'true').field('overrideReason', 'no sig available'), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/shipping/:id/delivery-failed', () => {
  async function inTransit() {
    const owner = await makeUser('ownF', ['student']);
    const { shoe, addr } = await makeShoeAndAddress(owner);
    await makeUser('opsF', ['operations_staff']);
    const tok = await loginAs(app, 'opsF');
    const ord = await createOrder(tok, shoe._id, addr._id);
    const orderId = ord.body.data._id;
    await auth(request(app).post(`/api/v1/shipping/${orderId}/transition`).send({ to: 'ready_to_ship' }), tok);
    await auth(request(app).post(`/api/v1/shipping/${orderId}/transition`).send({ to: 'in_transit' }), tok);
    return { tok, orderId };
  }

  test('creates delivery exception and transitions order to exception_pending_signoff', async () => {
    const { tok, orderId } = await inTransit();
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/delivery-failed`).send({ reasonCode: 'ADDRESS_INCORRECT', remediationSteps: 'confirm address' }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.order.status).toBe('exception_pending_signoff');
    expect(r.body.data.exception.reasonCode).toBe('ADDRESS_INCORRECT');
  });

  test('missing reasonCode returns 422', async () => {
    const { tok, orderId } = await inTransit();
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/delivery-failed`).send({}), tok);
    expect(r.status).toBe(422);
  });

  test('student cannot mark failed (403)', async () => {
    const { orderId } = await inTransit();
    await makeUser('stuF', ['student']);
    const tok = await loginAs(app, 'stuF');
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/delivery-failed`).send({ reasonCode: 'X' }), tok);
    expect(r.status).toBe(403);
  });
});

describe('POST /api/v1/shipping/:id/delivery-exception/signoff', () => {
  test('ops signs off → order transitions to returned and exception has signedOffBy', async () => {
    const owner = await makeUser('ownS', ['student']);
    const { shoe, addr } = await makeShoeAndAddress(owner);
    await makeUser('opsS', ['operations_staff']);
    const tok = await loginAs(app, 'opsS');
    const ord = await createOrder(tok, shoe._id, addr._id);
    const orderId = ord.body.data._id;
    await auth(request(app).post(`/api/v1/shipping/${orderId}/transition`).send({ to: 'ready_to_ship' }), tok);
    await auth(request(app).post(`/api/v1/shipping/${orderId}/transition`).send({ to: 'in_transit' }), tok);
    const failed = await auth(request(app).post(`/api/v1/shipping/${orderId}/delivery-failed`).send({ reasonCode: 'NO_ANSWER' }), tok);
    const exceptionId = failed.body.data.exception._id;
    const r = await auth(request(app).post(`/api/v1/shipping/${orderId}/delivery-exception/signoff`).send({
      exceptionId, followUpStatus: 'returned', notes: 'picked up by courier',
    }), tok);
    expect(r.status).toBe(200);
    expect(r.body.data.order.status).toBe('returned');
    expect(r.body.data.exception.signedOffBy).toBeTruthy();
  });

  test('unknown exceptionId returns 404', async () => {
    await makeUser('opsSN', ['operations_staff']);
    const tok = await loginAs(app, 'opsSN');
    const r = await auth(request(app).post('/api/v1/shipping/000000000000000000000000/delivery-exception/signoff').send({ exceptionId: '000000000000000000000000' }), tok);
    expect(r.status).toBe(404);
  });

  test('student cannot sign off (403)', async () => {
    await makeUser('stuSO', ['student']);
    const tok = await loginAs(app, 'stuSO');
    const r = await auth(request(app).post('/api/v1/shipping/000000000000000000000000/delivery-exception/signoff').send({ exceptionId: '000000000000000000000000' }), tok);
    expect(r.status).toBe(403);
  });
});
