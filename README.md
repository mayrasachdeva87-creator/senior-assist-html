# Senior Citizen Assistance Network (HTML version)

A static website for connecting older residents with volunteers for **non-emergency** help:
groceries, medicine pickup, errands, bills, transport, household tasks and companionship.

No Python, no server, no install. Plain HTML, CSS and JavaScript.

## How to open it

- Double-click `index.html`, or
- If login does not work when opened directly from disk, serve the folder with any static
  server, for example the VS Code "Live Server" extension, or `npx serve .`

## Features

| Area | What it does |
|---|---|
| Registration & login | Seniors, volunteers and admins register. Passwords are hashed with PBKDF2 (SHA-256, 100,000 iterations). |
| Admin setup | The first account can register as Administrator. After that the option disappears. |
| Requests | Seniors post a request with type, details, area and preferred day, and can cancel while it is open. |
| Volunteer profiles | Skills, available weekdays and area, editable at any time. |
| Matching | A volunteer sees only open requests matching their skill, day **and** area, and only once verified. |
| Acceptance | Accepting checks the match again at the moment of acceptance, so two volunteers cannot take the same task. |
| Task status | `accepted → in progress → completed`, or release back to open. |
| Emergency disclaimer | Shown on every page (112 / 108). |
| Feedback | After completion, the senior gives a 1–5 rating and optional comment, once per request. |
| Admin verification | Admin approves or rejects volunteers, sees request counts, and can deactivate users. |

## Project layout

```
senior-assist-html/
├── index.html          # the single page app shell
├── css/style.css       # styling (large text, mobile friendly)
├── js/store.js         # data layer: accounts, requests, matching, feedback
├── js/app.js           # pages, routing and form handling
├── tests/store.test.js # tests for the data layer
└── README.md
```

## First-time use

1. Open `index.html`.
2. Click **Register**, choose **Administrator (first-time setup only)**, and create the admin account.
3. Log out. Register a senior and a volunteer in separate sessions.
4. As admin, approve the volunteer. The volunteer can then accept matching requests.

## Running the tests

Requires Node.js 18 or newer:

```bash
node --test tests/
```

## Important: this is a prototype

**Data is stored in each browser's localStorage.** That means:

- A senior and a volunteer on different devices will **not** see each other's requests.
  Real matching needs a shared database on a server.
- Anyone with access to the browser can read the stored data, including password hashes.
- Anyone can register as admin on a fresh browser, because the first-admin rule is only
  enforced by the stored data.
- Clearing browser data deletes everything.

Before using this with real seniors and volunteers, you would need:

1. A backend with a shared database (for example Firebase, Supabase, or a small Node/PHP server).
2. Server-side authentication, with admin accounts created by an administrator only.
3. Verification of volunteers (identity and background checks), not just an approval click.
4. HTTPS, a privacy policy, consent text, and a way to report abuse.

This version is good for showing the flows, testing the rules, or as a front end to build on.

## Matching rules

A volunteer can accept a request only when all of these hold:

- their account is verified by an admin,
- the request's category is in their skills,
- the request's preferred day is in their available days,
- the request area equals their area (case-insensitive).

The rule is in `js/store.js` (`isMatch`).
