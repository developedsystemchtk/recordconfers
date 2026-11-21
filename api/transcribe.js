// รับไฟล์เสียง WAV จากหน้าเว็บ -> ส่งต่อไป iApp ASR -> (ถ้าตั้งค่าไว้) บันทึกลง Supabase
const { checkPasscode } = require('./_auth');

const IAPP_URL = 'https://api.iapp.co.th/asr/v3';
const MAX_BYTES = 4200000; // Vercel รับ request ได้ไม่เกิน ~4.5 MB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ดึงข้อความจากผลลัพธ์ของ iApp (รองรับหลายรูปแบบ เผื่อโครงสร้างต่างกัน)
function extractText(d) {
  if (!d) return '';
  if (Array.isArray(d.output)) {
    return d.output.map((o) => (o && o.text) || '').join(' ').trim();
  }
  if (typeof d.text === 'string') return d.text.trim();
  if (typeof d.transcript === 'string') return d.transcript.trim();
  return '';
}

async function saveToSupabase(text, durationSec) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return false;
  try {
    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/transcripts', {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ text, duration_sec: durationSec }),
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST' });
  }
  if (!checkPasscode(req)) {
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  if (!process.env.IAPP_API_KEY) {
    return res.status(500).json({ error: 'ยังไม่ได้ตั้งค่า IAPP_API_KEY ใน Vercel' });
  }

  let audio;
  try {
    audio = await readBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'อ่านไฟล์เสียงไม่สำเร็จ' });
  }
  if (audio.length < 2000) {
    return res.status(400).json({ error: 'เสียงสั้นเกินไป ลองอัดใหม่' });
  }
  if (audio.length > MAX_BYTES) {
    return res.status(413).json({ error: 'ไฟล์เสียงใหญ่เกินไป อัดให้สั้นลง (ไม่เกิน ~2 นาที)' });
  }

  const pro = (req.query && req.query.pro === '1') ? '1' : '0';
  const durationSec = Number(req.headers['x-duration']) || null;

  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
  form.append('use_asr_pro', pro);
  form.append('chunk_size', '20');

  let upstream, raw;
  try {
    upstream = await fetch(IAPP_URL, {
      method: 'POST',
      headers: { apikey: process.env.IAPP_API_KEY },
      body: form,
    });
    raw = await upstream.text();
  } catch (e) {
    return res.status(502).json({ error: 'เชื่อมต่อ iApp ไม่ได้ ลองใหม่อีกครั้ง' });
  }

  let data = null;
  try { data = JSON.parse(raw); } catch (e) { /* ไม่ใช่ JSON */ }

  if (!upstream.ok) {
    return res.status(502).json({
      error: 'iApp ตอบกลับผิดพลาด (' + upstream.status + ')',
      detail: data || raw.slice(0, 500),
    });
  }

  const text = extractText(data);
  let saved = false;
  if (text) saved = await saveToSupabase(text, durationSec);

  return res.status(200).json({ text, saved, raw: data || raw.slice(0, 500) });
};
