// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');

if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
const SA = require('../js/store.js');

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const PASS = 'password123';

test('admin bootstrap: only the first admin can self-register', async () => {
  const s = SA.createStore(new MemStorage());
  const admin = await s.register({ role: 'admin', name: 'Admin', email: 'admin@x.com', area: 'HQ', password: 'adminpass1' });
  assert.equal(admin.role, 'admin');
  await assert.rejects(
    s.register({ role: 'admin', name: 'Other', email: 'o@x.com', area: 'HQ', password: 'adminpass1' }),
    /already exists/);
});

test('volunteers need skills and days; passwords are checked', async () => {
  const s = SA.createStore(new MemStorage());
  await assert.rejects(
    s.register({ role: 'volunteer', name: 'V', email: 'v@x.com', area: 'A', password: PASS, skills: [], availability: [] }),
    /skill and one available day/);
  await s.register({ role: 'senior', name: 'S', email: 's@x.com', area: 'A', password: PASS });
  await assert.rejects(s.login('s@x.com', 'wrong-pass'), /Invalid email or password/);
  const u = await s.login('S@X.com', PASS);
  assert.equal(s.currentUser().id, u.id);
});

test('full flow: request, verification, matching, acceptance, status, feedback', async () => {
  const s = SA.createStore(new MemStorage());
  await s.register({ role: 'admin', name: 'Admin', email: 'admin@x.com', area: 'HQ', password: 'adminpass1' });
  await s.register({ role: 'senior', name: 'Sen', email: 's@x.com', area: 'Model Town', password: PASS });

  await s.login('s@x.com', PASS);
  const req = s.createRequest(s.currentUser(), {
    category: 'groceries', title: 'Groceries', description: 'Milk', area: '', preferredDay: 'sat',
  });
  assert.equal(req.area, 'Model Town');
  s.logout();

  // Volunteer in same area, different case: matches once verified.
  await s.register({ role: 'volunteer', name: 'Vol', email: 'v@x.com', area: 'model town', password: PASS,
    skills: ['groceries'], availability: ['sat'] });
  await s.login('v@x.com', PASS);
  assert.throws(() => s.acceptRequest(s.currentUser(), req.id), /verified by an admin/);
  s.logout();

  await s.login('admin@x.com', 'adminpass1');
  const volId = s.adminData(s.currentUser()).pending[0].id;
  s.setVerification(s.currentUser(), volId, 'verified');
  s.logout();

  await s.login('v@x.com', PASS);
  assert.equal(s.volunteerDashboard(s.currentUser()).matches.length, 1);
  s.acceptRequest(s.currentUser(), req.id);
  assert.equal(s.volunteerDashboard(s.currentUser()).matches.length, 0); // no longer open
  s.updateStatus(s.currentUser(), req.id, 'start');
  s.updateStatus(s.currentUser(), req.id, 'complete');
  s.logout();

  await s.login('s@x.com', PASS);
  s.submitFeedback(s.currentUser(), req.id, 5, 'Great');
  assert.throws(() => s.submitFeedback(s.currentUser(), req.id, 3, ''), /already submitted/);
  assert.equal(s.volunteerDashboard({ id: volId, role: 'volunteer' }).rating.avg, 5);
});

test('volunteer outside the area or without the day does not match', async () => {
  const s = SA.createStore(new MemStorage());
  await s.register({ role: 'admin', name: 'Admin', email: 'admin@x.com', area: 'HQ', password: 'adminpass1' });
  await s.register({ role: 'senior', name: 'Sen', email: 's@x.com', area: 'Model Town', password: PASS });
  await s.login('s@x.com', PASS);
  const req = s.createRequest(s.currentUser(), { category: 'medicine', title: 'Pickup', description: 'Insulin', preferredDay: 'mon' });
  s.logout();

  await s.register({ role: 'volunteer', name: 'Far', email: 'far@x.com', area: 'Sarabha Nagar', password: PASS,
    skills: ['medicine'], availability: ['mon'] });
  await s.login('admin@x.com', 'adminpass1');
  s.setVerification(s.currentUser(), s.adminData(s.currentUser()).pending[0].id, 'verified');
  s.logout();

  await s.login('far@x.com', PASS);
  assert.equal(s.volunteerDashboard(s.currentUser()).matches.length, 0);
  assert.throws(() => s.acceptRequest(s.currentUser(), req.id), /does not match|no longer open/);
});

test('seniors cannot see or cancel other seniors’ requests', async () => {
  const s = SA.createStore(new MemStorage());
  await s.register({ role: 'senior', name: 'A', email: 'a@x.com', area: 'X', password: PASS });
  await s.login('a@x.com', PASS);
  const req = s.createRequest(s.currentUser(), { category: 'errands', title: 'Bank', description: 'Deposit', preferredDay: 'tue' });
  s.logout();
  await s.register({ role: 'senior', name: 'B', email: 'b@x.com', area: 'X', password: PASS });
  await s.login('b@x.com', PASS);
  assert.throws(() => s.getRequestView(s.currentUser(), req.id), /do not have access/);
  assert.throws(() => s.cancelRequest(s.currentUser(), req.id), /not found/);
});

test('cancel is allowed only while open', async () => {
  const s = SA.createStore(new MemStorage());
  await s.register({ role: 'senior', name: 'A', email: 'a@x.com', area: 'X', password: PASS });
  await s.login('a@x.com', PASS);
  const req = s.createRequest(s.currentUser(), { category: 'bills', title: 'Bill', description: 'Pay', preferredDay: 'fri' });
  assert.equal(s.cancelRequest(s.currentUser(), req.id), 'Request cancelled.');
  assert.throws(() => s.cancelRequest(s.currentUser(), req.id), /Only open requests/);
});
