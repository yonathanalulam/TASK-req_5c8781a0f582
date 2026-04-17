const crypto = require('crypto');
const { v4: uuid } = require('uuid');

// Serial: UUID v4 (36 chars). Barcode: 12-digit numeric derived via SHA-256 % 10^11,
// then Luhn-style check digit appended. Globally unique via DB unique index; we retry on collision.
function computeLuhnCheckDigit(num11) {
  let sum = 0;
  for (let i = 0; i < num11.length; i++) {
    let digit = parseInt(num11.charAt(num11.length - 1 - i), 10);
    if (i % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return ((10 - (sum % 10)) % 10).toString();
}

function generateSerial() { return uuid(); }

function generateBarcodeFromSerial(serial, attempt = 0) {
  const h = crypto.createHash('sha256').update(serial + ':' + attempt).digest('hex');
  const n = (BigInt('0x' + h.slice(0, 16)) % 10n ** 11n).toString().padStart(11, '0');
  return n + computeLuhnCheckDigit(n);
}

function verifyBarcodeCheckDigit(barcode) {
  if (!/^\d{12}$/.test(barcode)) return false;
  return computeLuhnCheckDigit(barcode.slice(0, 11)) === barcode.charAt(11);
}

async function generateUniqueBarcode(ShoeProfileModel, serial) {
  for (let i = 0; i < 10; i++) {
    const code = generateBarcodeFromSerial(serial, i);
    const existing = await ShoeProfileModel.findOne({ barcode: code }).lean();
    if (!existing) return code;
  }
  throw new Error('Barcode collision after multiple attempts');
}

module.exports = { generateSerial, generateBarcodeFromSerial, verifyBarcodeCheckDigit, generateUniqueBarcode };
