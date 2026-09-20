// Slot engine + tool surface. Bookings persist to data/bookings.json so restarts
// keep state; swapped for a real calendar (Google Calendar API) in the product version.
import fs from 'node:fs';
import path from 'node:path';

const CATALOG = [
  { id: 'haircut', name: 'Haircut', mins: 30, price: 300 },
  { id: 'haircut-beard', name: 'Haircut + Beard', mins: 45, price: 450 },
  { id: 'facial', name: 'Facial', mins: 60, price: 900 },
  { id: 'consult', name: 'Consultation', mins: 15, price: 0 },
];
const OPEN_HOUR = 10, CLOSE_HOUR = 20; // 10am - 8pm, 7 days
const STORE = path.join(process.cwd(), 'data', 'bookings.json');

const svc = id => CATALOG.find(s => s.id === id);
const normPhone = p => String(p || '').replace(/\D/g, '').slice(-10);
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

export class Booking {
  constructor() {
    this.appointments = [];
    try { this.appointments = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(STORE), { recursive: true });
      fs.writeFileSync(STORE, JSON.stringify(this.appointments, null, 2));
    } catch {} // read-only fs (e.g. Deno Deploy): demo keeps in-memory state
  }

  tools() {
    return [
      { name: 'catalog', desc: 'List services with duration and price' },
      { name: 'get_slots', desc: 'Open start times for a date (YYYY-MM-DD) and service id' },
      { name: 'book', desc: 'Book a service: {date, start, service, name, phone}. Only book a start time get_slots returned.' },
      { name: 'reschedule', desc: 'Move an existing booking: {phone, date, start, service}' },
      { name: 'cancel', desc: 'Cancel an existing booking: {phone}' },
    ];
  }

  // A service occupies ceil(mins/30) consecutive half-hour cells.
  blockedStarts(date) {
    const busy = [];
    for (const a of this.appointments) {
      if (a.date !== date || a.status !== 'booked') continue;
      const s = svc(a.service);
      const start = toMin(a.start);
      for (let i = 0; i < Math.ceil((s?.mins || 30) / 30); i++) busy.push(start + i * 30);
    }
    return new Set(busy);
  }

  slotsFor(date, serviceId) {
    const s = svc(serviceId);
    if (!s || !date || date < today()) return [];
    const busy = this.blockedStarts(date);
    const out = [];
    for (let t = OPEN_HOUR * 60; t + s.mins <= CLOSE_HOUR * 60; t += 30) {
      let fits = true;
      for (let i = 0; i < Math.ceil(s.mins / 30); i++) if (busy.has(t + i * 30)) { fits = false; break; }
      if (fits) out.push(toTime(t));
    }
    return out;
  }

  async call(name, args = {}) {
    if (name === 'catalog') return { ok: true, services: CATALOG };

    if (name === 'get_slots') {
      if (!svc(args.service)) return { ok: false, error: 'unknown service id - call catalog first' };
      return { ok: true, slots: this.slotsFor(args.date, args.service) };
    }

    if (name === 'book') {
      const phone = normPhone(args.phone);
      if (phone.length !== 10) return { ok: false, error: 'need a 10-digit phone number to book' };
      if (!args.name || !svc(args.service)) return { ok: false, error: 'missing name or valid service' };
      if (!this.slotsFor(args.date, args.service).includes(args.start))
        return { ok: false, error: 'that start time is not open - offer get_slots options' };
      if (this.appointments.some(a => a.phone === phone && a.status === 'booked'))
        return { ok: false, error: 'this number already has an active booking - reschedule or cancel it first' };
      const b = { id: 'bk_' + Math.random().toString(36).slice(2, 8), status: 'booked',
                  date: args.date, start: args.start, service: args.service, name: args.name, phone };
      this.appointments.push(b);
      this.save();
      const s = svc(args.service);
      return { ok: true, booking: { ...b, serviceName: s.name, price: s.price } };
    }

    if (name === 'reschedule' || name === 'cancel') {
      const phone = normPhone(args.phone);
      const a = this.appointments.find(x => x.phone === phone && x.status === 'booked');
      if (!a) return { ok: false, error: 'no active booking for that number' };
      if (name === 'cancel') { a.status = 'cancelled'; this.save(); return { ok: true, cancelled: a.id }; }
      if (!this.slotsFor(args.date, a.service).includes(args.start) && !(a.date === args.date && a.start === args.start))
        return { ok: false, error: 'that start time is not open - offer get_slots options' };
      a.date = args.date; a.start = args.start;
      this.save();
      return { ok: true, booking: a };
    }

    return { ok: false, error: 'unknown tool' };
  }
}
