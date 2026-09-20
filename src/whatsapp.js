// WhatsApp Cloud API confirmations. Without creds (hackathon demo) messages are
// logged to data/whatsapp-log.json instead of sent - the owner sees the full trail.
import fs from 'node:fs';
import path from 'node:path';

const LOG = path.join(process.cwd(), 'data', 'whatsapp-log.json');

function log(entry) {
  let arr = [];
  try { arr = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch {}
  arr.push({ at: new Date().toISOString(), ...entry });
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.writeFileSync(LOG, JSON.stringify(arr, null, 2));
  } catch {} // read-only fs: demo mode still emits the card to the UI
}

export async function notifyWhatsApp(booking) {
  const text = `Namaste ${booking.name}! Aapki ${booking.serviceName} booking confirm ho gayi hai - ${booking.date} ko ${booking.start} baje. Booking ID: ${booking.id}. Badalna ho to is number par call kar dein.`;
  const token = process.env.WHATSAPP_TOKEN, phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) { log({ to: booking.phone, text, sent: false, reason: 'no creds (demo mode)' }); return { ok: true, demo: true, text }; }
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: '91' + booking.phone, type: 'text', text: { body: text } }),
  }).then(r => r.json()).catch(e => ({ error: e.message }));
  log({ to: booking.phone, text, sent: !res.error, response: res });
  return { ok: !res.error, text };
}
