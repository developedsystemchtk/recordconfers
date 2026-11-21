// ตรวจรหัสผ่านฝั่งเซิร์ฟเวอร์ (ไฟล์ที่ขึ้นต้นด้วย _ ไม่ถูกเปิดเป็น API)
const crypto = require('crypto');

function checkPasscode(req) {
  const expected = process.env.APP_PASSCODE || '';
  const given = String(req.headers['x-passcode'] || '');
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { checkPasscode };
