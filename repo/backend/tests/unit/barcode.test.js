const { generateSerial, generateBarcodeFromSerial, verifyBarcodeCheckDigit } = require('../../src/services/barcodeService');

describe('barcode generation', () => {
  test('produces 12-digit Luhn-valid barcode', () => {
    const s = generateSerial();
    const b = generateBarcodeFromSerial(s);
    expect(b).toMatch(/^\d{12}$/);
    expect(verifyBarcodeCheckDigit(b)).toBe(true);
  });
  test('different attempts produce different barcodes', () => {
    const s = generateSerial();
    const b1 = generateBarcodeFromSerial(s, 0);
    const b2 = generateBarcodeFromSerial(s, 1);
    expect(b1).not.toBe(b2);
  });
});
