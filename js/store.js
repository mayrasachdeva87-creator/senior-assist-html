/*
 * Senior Assist - data layer (runs entirely in the browser).
 * Data is kept in localStorage. Passwords are PBKDF2-hashed with a random salt.
 * Every write operation throws an Error with a user-facing message on failure.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.SA = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const CATEGORIES = ['groceries', 'medicine', 'errands', 'transport', 'bills', 'household', 'companionship', 'other'];
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const STATUSES = ['open', 'accepted', 'in_progress', 'completed', 'cancelled'];
  const ACTIVE = ['accepted', 'in_progress', 'completed'];
  const DB_KEY = 'sa_db_v1';
  const SESSION_KEY = 'sa_session_v1';
  const ITERATIONS = 100000;

  // action -> [allowed current statuses, new status]
  const STATUS_RULES = {
    start: [['accepted'], 'in_progress'],
    complete: [['accepted', 'in_progress'], 'completed'],
    release: [['accepted'], 'open'],
  };

  // ---------------------------------------------------------- crypto helpers
  const bytesToHex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  const hexToBytes = hex => Uint8Array.from(hex.match(/../g).map(h => parseInt(h, 16)));
  const randomSaltHex = () => bytesToHex(crypto.getRandomValues(new Uint8Array(16)));

  async function hashPassword(password, saltHex) {
    if (!globalThis.crypto || !crypto.subtle) {
      throw new Error('This browser blocks secure features here. Open the site from localhost or over HTTPS.');
    }
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
    return bytesToHex(bits);
  }

  // ---------------------------------------------------------- pure helpers
  const csvToArray = s => (s || '').split(',').filter(Boolean);
  const normalize = s => (s || '').trim().toLowerCase();
  const nowIso = () => new Date().toISOString();

  /** A volunteer may accept an open request only if all four rules hold. */
  function isMatch(req, vol) {
    return vol.verification === 'verified'
      && req.status === 'open'
      && csvToArray(vol.skills).includes(req.category)
      && csvToArray(vol.availability).includes(req.preferredDay)
      && normalize(req.area) === normalize(vol.area);
  }

  // ---------------------------------------------------------- store factory
  function createStore(storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) throw new Error('No storage available in this browser.');

    const read = () => {
      const raw = store.getItem(DB_KEY);
      return raw ? JSON.parse(raw) : { users: [], requests: [], feedback: [], seq: 0 };
    };
    const write = db => store.setItem(DB_KEY, JSON.stringify(db));
    const nextId = db => { db.seq += 1; return db.seq; };
    const findUser = (db, id) => db.users.find(u => u.id === id);
    const findRequest = (db, id) => db.requests.find(r => r.id === id);
    const byNewest = (a, b) => b.id - a.id;

    function publicUser(u) {
      return {
        id: u.id, role: u.role, name: u.name, email: u.email, phone: u.phone,
        area: u.area, active: u.active, skills: u.skills,
        availability: u.availability, verification: u.verification,
      };
    }

    function requireRole(user, role) {
      if (!user || user.role !== role) throw new Error('You are not allowed to do that.');
    }

    function decorate(db, req) {
      const senior = findUser(db, req.seniorId);
      const vol = req.volunteerId ? findUser(db, req.volunteerId) : null;
      return { ...req, seniorName: senior ? senior.name : 'Unknown', volunteerName: vol ? vol.name : null };
    }

    // ----- accounts
    function currentUser() {
      const id = Number(store.getItem(SESSION_KEY));
      if (!id) return null;
      const u = findUser(read(), id);
      return u && u.active ? publicUser(u) : null;
    }

    function hasAdmin() {
      return read().users.some(u => u.role === 'admin');
    }

    async function register(input) {
      const name = (input.name || '').trim();
      const email = normalize(input.email);
      const area = (input.area || '').trim();
      const phone = (input.phone || '').trim();
      const password = input.password || '';
      const role = input.role;
      const skills = (input.skills || []).filter(c => CATEGORIES.includes(c));
      const availability = (input.availability || []).filter(d => DAYS.includes(d));

      if (!name || !email || !area) throw new Error('Name, email and area are required.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Please enter a valid email address.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');

      const before = read();
      if (before.users.some(u => u.email === email)) throw new Error('An account with this email already exists.');
      if (role === 'admin') {
        if (before.users.some(u => u.role === 'admin')) {
          throw new Error('An administrator already exists. Ask them to approve your account.');
        }
      } else if (role === 'volunteer') {
        if (!skills.length || !availability.length) {
          throw new Error('Volunteers must pick at least one skill and one available day.');
        }
      } else if (role !== 'senior') {
        throw new Error('Please choose a valid role.');
      }

      const salt = randomSaltHex();
      const passwordHash = await hashPassword(password, salt);

      // Re-read after the async hash so concurrent changes are not overwritten.
      const db = read();
      if (db.users.some(u => u.email === email)) throw new Error('An account with this email already exists.');
      const user = {
        id: nextId(db), role, name, email, phone, area, salt, passwordHash,
        active: true, createdAt: nowIso(),
        skills: skills.join(','), availability: availability.join(','),
        verification: role === 'volunteer' ? 'pending' : null, verifiedAt: null,
      };
      db.users.push(user);
      write(db);
      return publicUser(user);
    }

    async function login(email, password) {
      const user = read().users.find(u => u.email === normalize(email));
      if (!user || !user.active) throw new Error('Invalid email or password.');
      const hash = await hashPassword(password || '', user.salt);
      if (hash !== user.passwordHash) throw new Error('Invalid email or password.');
      store.setItem(SESSION_KEY, String(user.id));
      return publicUser(user);
    }

    function logout() {
      store.removeItem(SESSION_KEY);
    }

    // ----- seniors
    function createRequest(user, data) {
      requireRole(user, 'senior');
      const title = (data.title || '').trim();
      const description = (data.description || '').trim();
      const area = (data.area || '').trim() || user.area;
      if (!CATEGORIES.includes(data.category)) throw new Error('Please choose a valid category.');
      if (!title || !description) throw new Error('Title and details are required.');
      if (!DAYS.includes(data.preferredDay)) throw new Error('Please choose a preferred day.');

      const db = read();
      const req = {
        id: nextId(db), seniorId: user.id, category: data.category, title, description,
        area, preferredDay: data.preferredDay, status: 'open', volunteerId: null,
        createdAt: nowIso(), updatedAt: nowIso(),
      };
      db.requests.push(req);
      write(db);
      return req;
    }

    function cancelRequest(user, id) {
      requireRole(user, 'senior');
      const db = read();
      const req = findRequest(db, id);
      if (!req || req.seniorId !== user.id) throw new Error('Request not found.');
      if (req.status !== 'open') {
        throw new Error('Only open requests can be cancelled. Ask the volunteer to release it first.');
      }
      req.status = 'cancelled';
      req.updatedAt = nowIso();
      write(db);
      return 'Request cancelled.';
    }

    function seniorRequests(user) {
      requireRole(user, 'senior');
      const db = read();
      return db.requests.filter(r => r.seniorId === user.id).sort(byNewest).map(r => decorate(db, r));
    }

    function submitFeedback(user, id, rating, comment) {
      requireRole(user, 'senior');
      const db = read();
      const req = findRequest(db, id);
      if (!req || req.seniorId !== user.id) throw new Error('Request not found.');
      if (req.status !== 'completed' || !req.volunteerId) {
        throw new Error('Feedback can be given only after the task is completed.');
      }
      const score = Number(rating);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('Rating must be between 1 and 5.');
      if (db.feedback.some(f => f.requestId === id)) throw new Error('Feedback was already submitted for this request.');

      db.feedback.push({
        id: nextId(db), requestId: id, seniorId: user.id, volunteerId: req.volunteerId,
        rating: score, comment: (comment || '').trim().slice(0, 500), createdAt: nowIso(),
      });
      write(db);
      return 'Thank you for your feedback.';
    }

    // ----- request view (shared by senior, volunteer and admin)
    function getRequestView(user, id) {
      const db = read();
      const req = findRequest(db, id);
      if (!req) throw new Error('Request not found.');
      const me = findUser(db, user.id);
      const isOwner = me.role === 'senior' && req.seniorId === me.id;
      const isAssigned = me.role === 'volunteer' && req.volunteerId === me.id;
      const canSeeOpen = me.role === 'volunteer' && req.status === 'open' && me.verification === 'verified';
      if (!(me.role === 'admin' || isOwner || isAssigned || canSeeOpen)) {
        throw new Error('You do not have access to this request.');
      }
      return {
        request: decorate(db, req),
        feedback: db.feedback.find(f => f.requestId === id) || null,
        isOwner,
        isAssigned,
        canAccept: me.role === 'volunteer' && isMatch(req, me),
        back: me.role === 'senior' ? '#/senior' : me.role === 'volunteer' ? '#/volunteer' : '#/admin',
      };
    }

    // ----- volunteers
    function acceptRequest(user, id) {
      requireRole(user, 'volunteer');
      const db = read();
      const vol = findUser(db, user.id);
      const req = findRequest(db, id);
      if (!req) throw new Error('Request not found.');
      if (vol.verification !== 'verified') {
        throw new Error('Your volunteer account must be verified by an admin first.');
      }
      if (!isMatch(req, vol)) {
        throw new Error('This request is no longer open or does not match your skills, area or available days.');
      }
      req.status = 'accepted';
      req.volunteerId = vol.id;
      req.updatedAt = nowIso();
      write(db);
      return 'Task accepted. Thank you for helping!';
    }

    function updateStatus(user, id, action) {
      requireRole(user, 'volunteer');
      const rule = STATUS_RULES[action];
      if (!rule) throw new Error('That status change is not allowed right now.');
      const db = read();
      const req = findRequest(db, id);
      if (!req || req.volunteerId !== user.id || !rule[0].includes(req.status)) {
        throw new Error('That status change is not allowed right now.');
      }
      req.status = rule[1];
      if (rule[1] === 'open') req.volunteerId = null;
      req.updatedAt = nowIso();
      write(db);
      return `Task status is now "${rule[1].replace('_', ' ')}".`;
    }

    function volunteerDashboard(user) {
      requireRole(user, 'volunteer');
      const db = read();
      const me = findUser(db, user.id);
      const matches = db.requests.filter(r => isMatch(r, me)).sort(byNewest).map(r => decorate(db, r));
      const assignments = db.requests
        .filter(r => r.volunteerId === me.id && ACTIVE.includes(r.status))
        .sort(byNewest).map(r => decorate(db, r));
      const reviews = db.feedback.filter(f => f.volunteerId === me.id);
      const avg = reviews.length
        ? Math.round((reviews.reduce((sum, f) => sum + f.rating, 0) / reviews.length) * 10) / 10
        : null;
      return {
        verification: me.verification,
        matches,
        assignments,
        rating: { avg, n: reviews.length },
        comments: reviews.slice().sort(byNewest).slice(0, 10),
      };
    }

    function volunteerProfile(user) {
      requireRole(user, 'volunteer');
      const me = findUser(read(), user.id);
      return {
        verification: me.verification,
        area: me.area,
        skills: csvToArray(me.skills),
        availability: csvToArray(me.availability),
      };
    }

    function updateVolunteerProfile(user, data) {
      requireRole(user, 'volunteer');
      const area = (data.area || '').trim();
      const skills = (data.skills || []).filter(c => CATEGORIES.includes(c));
      const availability = (data.availability || []).filter(d => DAYS.includes(d));
      if (!area || !skills.length || !availability.length) {
        throw new Error('Pick at least one skill, one available day and an area.');
      }
      const db = read();
      const me = findUser(db, user.id);
      me.area = area;
      me.skills = skills.join(',');
      me.availability = availability.join(',');
      write(db);
      return 'Profile updated.';
    }

    // ----- admin
    function adminData(user) {
      requireRole(user, 'admin');
      const db = read();
      const pending = db.users
        .filter(u => u.role === 'volunteer' && u.verification === 'pending')
        .map(u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, area: u.area,
                     skills: u.skills, availability: u.availability }));
      const users = db.users.slice().sort(byNewest).map(publicUser);
      const counts = STATUSES
        .map(s => ({ status: s, n: db.requests.filter(r => r.status === s).length }))
        .filter(c => c.n > 0);
      return { pending, users, counts };
    }

    function setVerification(user, id, decision) {
      requireRole(user, 'admin');
      if (decision !== 'verified' && decision !== 'rejected') throw new Error('Invalid decision.');
      const db = read();
      const target = findUser(db, id);
      if (!target || target.role !== 'volunteer') throw new Error('Volunteer not found.');
      target.verification = decision;
      target.verifiedAt = decision === 'verified' ? nowIso() : null;
      write(db);
      return `Volunteer ${decision}.`;
    }

    function toggleUser(user, id) {
      requireRole(user, 'admin');
      if (id === user.id) throw new Error("You can't deactivate your own account.");
      const db = read();
      const target = findUser(db, id);
      if (!target || target.role === 'admin') throw new Error('User not found.');
      target.active = !target.active;
      write(db);
      return 'User status updated.';
    }

    return {
      currentUser, hasAdmin, register, login, logout,
      createRequest, cancelRequest, seniorRequests, submitFeedback,
      getRequestView, acceptRequest, updateStatus,
      volunteerDashboard, volunteerProfile, updateVolunteerProfile,
      adminData, setVerification, toggleUser,
    };
  }

  return { createStore, CATEGORIES, DAYS, STATUSES, isMatch };
});
