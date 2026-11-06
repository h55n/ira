import assert from 'node:assert/strict';
import test from 'node:test';
import { Booking } from '../src/booking.js';

const date = '2099-12-01';
const appointment = (id, start, service = 'facial') => ({ id, start, service,
  date, phone: id === 'mine' ? '9000000001' : '9000000002',
  name: 'Synthetic test', status: 'booked' });
const engine = (...appointments) => {
  const booking = new Booking();
  booking.appointments = appointments;
  booking.save = () => {}; // tests never write the production store
  return booking;
};

for (const [service, from, to] of [
  ['facial', '10:00', '10:30'], ['facial', '10:30', '10:00'],
  ['haircut-beard', '10:00', '10:30'],
]) {
  test(`reschedule ${service} from ${from} to ${to} ignores its own cells`, async () => {
    const booking = engine(appointment('mine', from, service));
    const result = await booking.call('reschedule', { phone: '9000000001', date, start: to });
    assert.equal(result.ok, true);
    assert.equal(booking.appointments[0].start, to);
    assert.equal(booking.appointments.length, 1);
  });
}

test('reschedule still refuses another appointment and preserves the original', async () => {
  const mine = appointment('mine', '10:00');
  const booking = engine(mine, appointment('other', '11:00', 'haircut'));
  let saves = 0;
  booking.save = () => { saves++; };
  const result = await booking.call('reschedule', { phone: mine.phone, date, start: '10:30' });
  assert.equal(result.ok, false);
  assert.equal(mine.start, '10:00');
  assert.equal(saves, 0);
});

test('slot listings and new bookings still include all existing occupancy', async () => {
  const booking = engine(appointment('mine', '10:00'));
  assert.equal(booking.slotsFor(date, 'facial').includes('10:30'), false);
  const result = await booking.call('book', {
    phone: '9000000002', name: 'Synthetic test', date, start: '10:30', service: 'facial',
  });
  assert.equal(result.ok, false);
  assert.equal(booking.appointments.length, 1);
});

test('moving to the same slot and a different day remains supported', async () => {
  const mine = appointment('mine', '10:00');
  const booking = engine(mine);
  assert.equal((await booking.call('reschedule', { phone: mine.phone, date, start: '10:00' })).ok, true);
  assert.equal((await booking.call('reschedule', { phone: mine.phone, date: '2099-12-02', start: '10:00' })).ok, true);
  assert.equal(mine.date, '2099-12-02');
});

test('rescheduling still enforces closing time and missing booking checks', async () => {
  const booking = engine(appointment('mine', '10:00'));
  assert.equal((await booking.call('reschedule', { phone: '9000000001', date, start: '19:30' })).ok, false);
  assert.equal((await booking.call('reschedule', { phone: '9000000099', date, start: '10:30' })).ok, false);
});

test('a non-overlapping earlier move succeeds while another booking stays untouched', async () => {
  const mine = appointment('mine', '11:00');
  const other = appointment('other', '12:00', 'haircut');
  const booking = engine(mine, other);
  assert.equal((await booking.call('reschedule', { phone: mine.phone, date, start: '10:30' })).ok, true);
  assert.equal(other.start, '12:00');
  assert.equal(booking.slotsFor(date, 'haircut').includes('11:30'), true);
  assert.equal(booking.slotsFor(date, 'haircut').includes('12:00'), false);
});

test('cancelled appointments do not block a reschedule', async () => {
  const mine = appointment('mine', '10:00');
  const cancelled = { ...appointment('other', '11:00'), status: 'cancelled' };
  const booking = engine(mine, cancelled);
  assert.equal((await booking.call('reschedule', { phone: mine.phone, date, start: '10:30' })).ok, true);
  assert.equal(cancelled.status, 'cancelled');
});
