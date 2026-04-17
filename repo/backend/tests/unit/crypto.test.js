const { encryptField, decryptField, sha256Hex } = require('../../src/utils/crypto');

describe('crypto utilities', () => {
  test('encrypt/decrypt round-trip', () => {
    const blob = encryptField('123 Main St, Springfield');
    expect(blob.v).toBeGreaterThan(0);
    const pt = decryptField(blob);
    expect(pt).toBe('123 Main St, Springfield');
  });
  test('sha256 is deterministic', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
