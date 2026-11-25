/* Senior Assist - user interface. Hash-based pages rendered from js/store.js. */
(function () {
  'use strict';

  const store = SA.createStore();
  const C = SA.CATEGORIES;
  const D = SA.DAYS;
  const root = document.getElementById('app');
  const nav = document.getElementById('nav');
  let pendingFlash = null;

  // ------------------------------------------------------------ helpers
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const label = s => cap(String(s || '').replace(/_/g, ' '));
  const me = () => store.currentUser();
  const idField = id => `<input type="hidden" name="id" value="${esc(id)}">`;
  const statusBadge = s => `<span class="badge status-${esc(s)}">${esc(label(s))}</span>`;
  const checkboxes = (name, options, selected = []) => options.map(o =>
    `<label class="check"><input type="checkbox" name="${name}" value="${o}" ${selected.includes(o) ? 'checked' : ''}> ${cap(o)}</label>`
  ).join('');
  const selectOptions = options => options.map(o => `<option value="${o}">${cap(o)}</option>`).join('');

  const val = (form, name) => String(new FormData(form).get(name) ?? '').trim();
  const raw = (form, name) => String(new FormData(form).get(name) ?? '');
  const vals = (form, name) => new FormData(form).getAll(name).map(String);

  function flash(type, msg) { pendingFlash = { type, msg }; }
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  const dashboardHash = u =>
    (!u ? '#/login' : u.role === 'senior' ? '#/senior' : u.role === 'volunteer' ? '#/volunteer' : '#/admin');

  // ------------------------------------------------------------ routing
  function guard(hash, user) {
    if (hash === '#/' && user) return dashboardHash(user);
    const need = /^#\/senior/.test(hash) ? 'senior'
      : /^#\/volunteer/.test(hash) ? 'volunteer'
      : /^#\/admin/.test(hash) ? 'admin'
      : /^#\/requests\//.test(hash) ? 'any'
      : null;
    if (!need) return null;
    if (!user) return '#/login';
    if (need !== 'any' && user.role !== need) return dashboardHash(user);
    return null;
  }

  function renderNav(user) {
    if (!user) return '<a href="#/login">Log in</a><a href="#/register">Register</a>';
    const links = user.role === 'senior'
      ? '<a href="#/senior">My requests</a><a href="#/senior/new">New request</a>'
      : user.role === 'volunteer'
        ? '<a href="#/volunteer">Dashboard</a><a href="#/volunteer/profile">My profile</a>'
        : '<a href="#/admin">Admin</a>';
    return `${links}<form class="inline" data-form="logout"><button class="link">Log out</button></form>`;
  }

  // ------------------------------------------------------------ views
  const viewIndex = () => `
    <section class="hero">
      <h1>Friendly, verified help for older residents</h1>
      <p>Seniors post non-emergency requests such as groceries, medicine pickup, errands or transport.
         Verified volunteers in the same area can accept them.</p>
      <p>
        <a class="btn" href="#/register">Get started</a>
        <a class="btn secondary" href="#/login">Log in</a>
      </p>
    </section>`;

  const viewLogin = () => `
    <h1>Log in</h1>
    <form class="card form" data-form="login">
      <label>Email <input type="email" name="email" required></label>
      <label>Password <input type="password" name="password" required></label>
      <button class="btn">Log in</button>
      <p class="muted">New here? <a href="#/register">Create an account</a></p>
    </form>`;

  function viewRegister() {
    const adminOption = store.hasAdmin()
      ? ''
      : '<option value="admin">Administrator (first-time setup only)</option>';
    return `
    <h1>Create an account</h1>
    <form class="card form" data-form="register">
      <label>I am a
        <select name="role" required>
          <option value="senior">Senior (I need help)</option>
          <option value="volunteer">Volunteer (I want to help)</option>
          ${adminOption}
        </select>
      </label>
      <label>Full name <input name="name" required></label>
      <label>Email <input type="email" name="email" required></label>
      <label>Phone (optional) <input name="phone"></label>
      <label>Area / locality <input name="area" required></label>
      <label>Password (min. 8 characters) <input type="password" name="password" minlength="8" required></label>
      <fieldset><legend>Volunteers: skills you can offer</legend>${checkboxes('skills', C)}</fieldset>
      <fieldset><legend>Volunteers: days you are available</legend>${checkboxes('availability', D)}</fieldset>
      <button class="btn">Register</button>
      <p class="muted">Already registered? <a href="#/login">Log in</a></p>
    </form>`;
  }

  function viewSeniorDashboard(user) {
    const list = store.seniorRequests(user);
    const rows = list.map(r => `
      <tr>
        <td><a href="#/requests/${r.id}">${esc(r.title)}</a></td>
        <td>${esc(cap(r.category))}</td>
        <td>${esc(cap(r.preferredDay))}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${esc(r.volunteerName || '-')}</td>
      </tr>`).join('');
    return `
      <div class="row"><h1>My requests</h1><a class="btn" href="#/senior/new">New request</a></div>
      ${list.length
        ? `<table><tr><th>Title</th><th>Category</th><th>Day</th><th>Status</th><th>Volunteer</th></tr>${rows}</table>`
        : '<p>You have no requests yet.</p>'}`;
  }

  const viewNewRequest = () => `
    <h1>New help request</h1>
    <p class="muted">Describe a non-emergency task. For emergencies, call 112 or 108.</p>
    <form class="card form" data-form="newRequest">
      <label>Type of help <select name="category" required>${selectOptions(C)}</select></label>
      <label>Short title <input name="title" maxlength="100" required placeholder="e.g. Pick up monthly medicines"></label>
      <label>Details
        <textarea name="description" rows="5" required
                  placeholder="What do you need, where, and anything the volunteer should know?"></textarea>
      </label>
      <label>Area / locality (leave blank to use your registered area) <input name="area"></label>
      <label>Preferred day <select name="preferred_day" required>${selectOptions(D)}</select></label>
      <button class="btn">Post request</button>
    </form>`;

  function viewRequest(user, id) {
    const v = store.getRequestView(user, id);
    const r = v.request;
    const parts = [];

    if (v.canAccept) {
      parts.push(`
        <form class="card" data-form="accept">
          ${idField(id)}
          <p>This task matches your skills, area and available day.</p>
          <button class="btn">Accept this task</button>
        </form>`);
    }

    if (v.isAssigned && (r.status === 'accepted' || r.status === 'in_progress')) {
      const startButtons = r.status === 'accepted'
        ? '<button name="action" value="start" class="btn">Mark in progress</button>' +
          '<button name="action" value="release" class="btn secondary">Release task</button>'
        : '';
      parts.push(`
        <form class="card inline-actions" data-form="status">
          ${idField(id)}
          <h2>Update task status</h2>
          ${startButtons}
          <button name="action" value="complete" class="btn">Mark completed</button>
        </form>`);
    }

    if (v.isOwner && r.status === 'open') {
      parts.push(`
        <form class="card" data-form="cancel">
          ${idField(id)}
          <button class="btn danger">Cancel request</button>
        </form>`);
    }

    if (v.isOwner && r.status === 'completed' && !v.feedback) {
      parts.push(`
        <form class="card form" data-form="feedback">
          ${idField(id)}
          <h2>How was your volunteer?</h2>
          <label>Rating
            <select name="rating" required>
              ${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} star${n > 1 ? 's' : ''}</option>`).join('')}
            </select>
          </label>
          <label>Comment (optional) <textarea name="comment" maxlength="500" rows="3"></textarea></label>
          <button class="btn">Submit feedback</button>
        </form>`);
    } else if (v.feedback) {
      parts.push(`
        <div class="card">
          <h2>Feedback</h2>
          <p>${esc(v.feedback.rating)} / 5 - ${esc(v.feedback.comment || 'No comment')}</p>
        </div>`);
    }

    return `
      <h1>${esc(r.title)}</h1>
      <p>${statusBadge(r.status)}</p>
      <dl class="card details">
        <dt>Type of help</dt><dd>${esc(cap(r.category))}</dd>
        <dt>Area</dt><dd>${esc(r.area)}</dd>
        <dt>Preferred day</dt><dd>${esc(cap(r.preferredDay))}</dd>
        <dt>Requested by</dt><dd>${esc(r.seniorName)}</dd>
        <dt>Volunteer</dt><dd>${esc(r.volunteerName || 'Not yet assigned')}</dd>
        <dt>Posted</dt><dd>${esc(new Date(r.createdAt).toLocaleString())}</dd>
      </dl>
      <div class="card"><h2>Details</h2><p>${esc(r.description)}</p></div>
      ${parts.join('')}
      <p><a href="${v.back}">&larr; Back to dashboard</a></p>`;
  }

  function viewVolunteerDashboard(user) {
    const d = store.volunteerDashboard(user);
    const banner = d.verification === 'pending'
      ? '<div class="flash warning">Your account is waiting for admin verification. You can accept tasks once it is approved.</div>'
      : d.verification === 'rejected'
        ? '<div class="flash danger">Your volunteer application was not approved. Please contact the coordinators.</div>'
        : '';
    const matches = d.verification !== 'verified'
      ? '<p>Matching opens after verification.</p>'
      : d.matches.length
        ? `<ul class="list">${d.matches.map(r => `
            <li><a href="#/requests/${r.id}">${esc(r.title)}</a>
              - ${esc(cap(r.category))}, ${esc(r.area)}, ${esc(cap(r.preferredDay))}</li>`).join('')}</ul>`
        : '<p>No open requests match your skills, area and available days right now.</p>';
    const tasks = d.assignments.length
      ? `<ul class="list">${d.assignments.map(r => `
          <li><a href="#/requests/${r.id}">${esc(r.title)}</a> for ${esc(r.seniorName)}
            ${statusBadge(r.status)}</li>`).join('')}</ul>`
      : '<p>No tasks yet.</p>';
    const reviews = d.comments.length
      ? d.comments.map(f => `<p><strong>${esc(f.rating)}/5</strong> - ${esc(f.comment || 'No comment')}</p>`).join('')
      : '<p>No feedback yet.</p>';

    return `
      <h1>Volunteer dashboard</h1>
      ${banner}
      <p>Your rating: ${d.rating.n
        ? `<strong>${esc(d.rating.avg)}</strong> / 5 from ${d.rating.n} review(s)`
        : 'no reviews yet'}.
        <a href="#/volunteer/profile">Edit skills and availability</a></p>
      <section class="card"><h2>Matching open requests</h2>${matches}</section>
      <section class="card"><h2>My tasks</h2>${tasks}</section>
      <section class="card"><h2>Recent feedback</h2>${reviews}</section>`;
  }

  function viewVolunteerProfile(user) {
    const p = store.volunteerProfile(user);
    return `
      <h1>My volunteer profile</h1>
      <p>Verification status: ${statusBadge(p.verification)}</p>
      <form class="card form" data-form="profile">
        <label>Area / locality <input name="area" value="${esc(p.area)}" required></label>
        <fieldset><legend>Skills</legend>${checkboxes('skills', C, p.skills)}</fieldset>
        <fieldset><legend>Available days</legend>${checkboxes('availability', D, p.availability)}</fieldset>
        <button class="btn">Save profile</button>
      </form>`;
  }

  function viewAdmin(user) {
    const a = store.adminData(user);
    const pending = a.pending.length
      ? `<table>
          <tr><th>Name</th><th>Contact</th><th>Area</th><th>Skills</th><th>Days</th><th>Decision</th></tr>
          ${a.pending.map(v => `
            <tr>
              <td>${esc(v.name)}</td>
              <td>${esc(v.email)}<br><small>${esc(v.phone)}</small></td>
              <td>${esc(v.area)}</td>
              <td>${esc(v.skills.replace(/,/g, ', '))}</td>
              <td>${esc(v.availability.replace(/,/g, ', '))}</td>
              <td>
                <form class="inline-actions" data-form="verify">
                  ${idField(v.id)}
                  <button name="decision" value="verified" class="btn small">Approve</button>
                  <button name="decision" value="rejected" class="btn small danger">Reject</button>
                </form>
              </td>
            </tr>`).join('')}
        </table>`
      : '<p>No pending volunteers.</p>';
    const counts = a.counts.length
      ? a.counts.map(c => `<li>${esc(label(c.status))}: ${c.n}</li>`).join('')
      : '<li>No requests yet.</li>';
    const users = a.users.map(u => `
      <tr>
        <td>${esc(u.name)}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.role)}</td>
        <td>${esc(u.area)}</td>
        <td>${u.active ? 'Active' : 'Deactivated'}</td>
        <td>${u.role === 'admin' ? '' : `
          <form data-form="toggle">
            ${idField(u.id)}
            <button class="btn small secondary">${u.active ? 'Deactivate' : 'Reactivate'}</button>
          </form>`}</td>
      </tr>`).join('');

    return `
      <h1>Admin dashboard</h1>
      <section class="card">
        <h2>Pending volunteer verifications (${a.pending.length})</h2>
        ${pending}
      </section>
      <section class="card"><h2>Request status counts</h2><ul>${counts}</ul></section>
      <section class="card">
        <h2>Users</h2>
        <table>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Area</th><th>Account</th><th></th></tr>
          ${users}
        </table>
      </section>`;
  }

  const ROUTES = [
    [/^#\/$/, () => viewIndex()],
    [/^#\/login$/, () => viewLogin()],
    [/^#\/register$/, () => viewRegister()],
    [/^#\/senior$/, u => viewSeniorDashboard(u)],
    [/^#\/senior\/new$/, () => viewNewRequest()],
    [/^#\/volunteer$/, u => viewVolunteerDashboard(u)],
    [/^#\/volunteer\/profile$/, u => viewVolunteerProfile(u)],
    [/^#\/admin$/, u => viewAdmin(u)],
    [/^#\/requests\/(\d+)$/, (u, m) => viewRequest(u, Number(m[1]))],
  ];

  // ------------------------------------------------------------ form actions
  const forms = {
    async login(f) {
      const u = await store.login(val(f, 'email'), raw(f, 'password'));
      flash('success', `Welcome back, ${u.name}.`);
      go(dashboardHash(u));
    },

    async register(f) {
      const u = await store.register({
        role: val(f, 'role'),
        name: val(f, 'name'),
        email: val(f, 'email'),
        phone: val(f, 'phone'),
        area: val(f, 'area'),
        password: raw(f, 'password'),
        skills: vals(f, 'skills'),
        availability: vals(f, 'availability'),
      });
      flash('success', u.role === 'volunteer'
        ? 'Account created. An admin must verify you before you can accept tasks. Please log in.'
        : 'Account created. Please log in.');
      go('#/login');
    },

    logout() {
      store.logout();
      flash('info', 'You are logged out.');
      go('#/');
    },

    newRequest(f) {
      const r = store.createRequest(me(), {
        category: val(f, 'category'),
        title: val(f, 'title'),
        description: val(f, 'description'),
        area: val(f, 'area'),
        preferredDay: val(f, 'preferred_day'),
      });
      flash('success', 'Your request is posted. A verified volunteer can now accept it.');
      go(`#/requests/${r.id}`);
    },

    cancel(f) {
      const id = Number(val(f, 'id'));
      flash('info', store.cancelRequest(me(), id));
      go(`#/requests/${id}`);
    },

    accept(f) {
      const id = Number(val(f, 'id'));
      try {
        flash('success', store.acceptRequest(me(), id));
        go(`#/requests/${id}`);
      } catch (err) {
        flash('warning', err.message);
        go('#/volunteer');
      }
    },

    status(f, btn) {
      const id = Number(val(f, 'id'));
      flash('success', store.updateStatus(me(), id, btn ? btn.value : ''));
      go(`#/requests/${id}`);
    },

    feedback(f) {
      const id = Number(val(f, 'id'));
      flash('success', store.submitFeedback(me(), id, val(f, 'rating'), raw(f, 'comment')));
      go(`#/requests/${id}`);
    },

    profile(f) {
      flash('success', store.updateVolunteerProfile(me(), {
        area: val(f, 'area'),
        skills: vals(f, 'skills'),
        availability: vals(f, 'availability'),
      }));
      go('#/volunteer');
    },

    verify(f, btn) {
      flash('success', store.setVerification(me(), Number(val(f, 'id')), btn ? btn.value : ''));
      render();
    },

    toggle(f) {
      flash('info', store.toggleUser(me(), Number(val(f, 'id'))));
      render();
    },
  };

  document.addEventListener('submit', e => {
    const name = e.target.dataset.form;
    if (!name || !forms[name]) return;
    e.preventDefault();
    Promise.resolve()
      .then(() => forms[name](e.target, e.submitter))
      .catch(err => {
        flash('danger', err.message || 'Something went wrong. Please try again.');
        render();
      });
  });

  // ------------------------------------------------------------ render
  function render() {
    const user = me();
    const hash = location.hash || '#/';

    const target = guard(hash, user);
    if (target && target !== hash) {
      location.hash = target;   // re-renders via hashchange; keep any pending flash
      return;
    }

    nav.innerHTML = renderNav(user);

    const match = ROUTES.map(([re, fn]) => [re.exec(hash), fn]).find(([m]) => m);
    let body;
    if (!match) {
      body = '<h1>Page not found</h1><p><a href="#/">Go to the home page</a></p>';
    } else {
      try {
        body = match[1](user, match[0]);
      } catch (err) {
        body = `<div class="flash danger">${esc(err.message)}</div>`;
      }
    }

    const note = pendingFlash
      ? `<div class="flash ${esc(pendingFlash.type)}">${esc(pendingFlash.msg)}</div>`
      : '';
    pendingFlash = null;
    root.innerHTML = note + body;
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);
  render();
})();
