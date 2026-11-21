// ดู/ลบประวัติข้อความใน Supabase (ต้องใส่รหัสผ่านเช่นกัน)
const { checkPasscode } = require('./_auth');

module.exports = async function handler(req, res) {
  if (!checkPasscode(req)) {
    return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return res.status(200).json({ configured: false, items: [] });
  }
  const base = url.replace(/\/$/, '') + '/rest/v1/transcripts';
  const headers = { apikey: key, Authorization: 'Bearer ' + key };

  try {
    if (req.method === 'GET') {
      const r = await fetch(
        base + '?select=id,created_at,text,duration_sec&order=created_at.desc&limit=30',
        { headers }
      );
      if (!r.ok) return res.status(502).json({ error: 'อ่านประวัติจาก Supabase ไม่ได้' });
      return res.status(200).json({ configured: true, items: await r.json() });
    }
    if (req.method === 'DELETE') {
      const id = String((req.query && req.query.id) || '');
      if (!/^\d+$/.test(id)) return res.status(400).json({ error: 'id ไม่ถูกต้อง' });
      const r = await fetch(base + '?id=eq.' + id, { method: 'DELETE', headers });
      if (!r.ok) return res.status(502).json({ error: 'ลบไม่สำเร็จ' });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'ไม่รองรับวิธีนี้' });
  } catch (e) {
    return res.status(502).json({ error: 'เชื่อมต่อ Supabase ไม่ได้' });
  }
};
