/**
 * Seed a realistic Calley account through the public API, so screenshots
 * show the app with the kind of density a real user's calendar has.
 */
const API = 'http://localhost:4000';

const EMAIL = 'maya.rios@calley.app';
const PASSWORD = 'designreview2026';
const NAME = 'Maya Rios';

let cookieJar = new Map();

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Cookie: cookieHeader(),
    Origin: 'http://localhost:5173',
    ...(options.headers ?? {}),
  };
  const method = (options.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && cookieJar.has('csrf_token')) {
    headers['X-CSRF-Token'] = cookieJar.get('csrf_token');
  }
  const res = await fetch(`${API}${path}`, { ...options, headers });
  storeCookies(res);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

// ── Dates: anchor everything on the current week so views look populated ──
const now = new Date();
const TZ_OFFSET_NOTE =
  'times are constructed in UTC; user timezone is UTC for predictable screenshots';

function startOfWeek(d) {
  const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  c.setUTCDate(c.getUTCDate() - c.getUTCDay());
  return c;
}

const weekStart = startOfWeek(now);

/** day: 0=Sun..6=Sat within the current week; hour/min in UTC */
function at(day, hour, min = 0) {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + day);
  d.setUTCHours(hour, min, 0, 0);
  return d.toISOString();
}

function plus(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function dayOnly(day) {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + day);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  // ── Account ──
  try {
    await api('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name: NAME, email: EMAIL, password: PASSWORD }),
    });
    console.log('signed up', EMAIL);
  } catch (err) {
    console.log('signup failed, trying login:', err.message);
    cookieJar = new Map();
    await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    console.log('logged in');
  }

  const me = await api('/auth/me');
  console.log('me:', me.email ?? JSON.stringify(me).slice(0, 120));

  // ── Categories ──
  const existing = await api('/categories');
  const cats = Array.isArray(existing) ? existing : (existing.data ?? existing.categories ?? []);
  console.log('existing categories:', cats.map((c) => c.name).join(', ') || '(none)');

  const byName = new Map(cats.map((c) => [c.name, c]));

  async function ensureCategory(name, color) {
    if (byName.has(name)) return byName.get(name);
    const created = await api('/categories', {
      method: 'POST',
      body: JSON.stringify({ name, color }),
    });
    byName.set(name, created);
    return created;
  }

  const work = await ensureCategory('Work', '#bd4c26');
  const personal = cats.find((c) => c.isDefault) ?? (await ensureCategory('Personal', '#3a6b5c'));
  const health = await ensureCategory('Health', '#2563eb');
  const family = await ensureCategory('Family', '#7c3aed');

  console.log('categories ready');

  // ── Events across the current week ──
  const events = [
    // Monday
    { title: 'Standup', start: at(1, 9, 15), min: 15, cat: work, location: 'Zoom' },
    {
      title: 'Design system review',
      start: at(1, 10, 0),
      min: 60,
      cat: work,
      location: 'Studio A',
      description: 'Walk through the token audit and the new calendar surfaces.',
    },
    {
      title: 'Lunch with Priya',
      start: at(1, 12, 30),
      min: 60,
      cat: personal,
      location: 'Cafe Lune',
    },
    { title: 'Roadmap sync', start: at(1, 14, 0), min: 45, cat: work },
    { title: 'Physio', start: at(1, 17, 30), min: 45, cat: health, location: 'Northside Clinic' },

    // Tuesday
    { title: 'Standup', start: at(2, 9, 15), min: 15, cat: work, location: 'Zoom' },
    { title: 'Usability sessions', start: at(2, 10, 0), min: 150, cat: work, location: 'Lab 2' },
    { title: 'Deep work — recurrence engine', start: at(2, 13, 30), min: 120, cat: work },
    { title: 'Dentist', start: at(2, 16, 0), min: 45, cat: health },

    // Wednesday
    { title: 'Standup', start: at(3, 9, 15), min: 15, cat: work, location: 'Zoom' },
    { title: 'Sprint planning', start: at(3, 10, 0), min: 90, cat: work, location: 'Studio A' },
    {
      title: 'Coffee with Sam',
      start: at(3, 11, 0),
      min: 30,
      cat: personal,
      location: 'Blue Bottle',
    },
    { title: '1:1 with Devon', start: at(3, 14, 0), min: 30, cat: work },
    { title: 'Accessibility audit walkthrough', start: at(3, 15, 0), min: 60, cat: work },
    { title: 'Yoga', start: at(3, 18, 30), min: 60, cat: health, location: 'Still Point' },

    // Thursday
    { title: 'Standup', start: at(4, 9, 15), min: 15, cat: work, location: 'Zoom' },
    { title: 'Customer call — Northwind', start: at(4, 11, 0), min: 45, cat: work },
    { title: 'Design critique', start: at(4, 13, 0), min: 60, cat: work, location: 'Studio A' },
    { title: 'School pickup', start: at(4, 15, 30), min: 30, cat: family },
    {
      title: 'Dinner with the Rileys',
      start: at(4, 19, 0),
      min: 120,
      cat: family,
      location: 'Home',
    },

    // Friday
    { title: 'Standup', start: at(5, 9, 15), min: 15, cat: work, location: 'Zoom' },
    { title: 'Release checkpoint', start: at(5, 10, 30), min: 60, cat: work },
    { title: 'Team retro', start: at(5, 15, 0), min: 60, cat: work, location: 'Studio A' },
    { title: 'Grocery run', start: at(5, 17, 0), min: 45, cat: personal },

    // Weekend
    { title: 'Long run', start: at(6, 8, 0), min: 90, cat: health, location: 'Riverside loop' },
    {
      title: "Ella's football match",
      start: at(6, 11, 0),
      min: 90,
      cat: family,
      location: 'Fields 3',
    },
    { title: 'Farmers market', start: at(0, 10, 0), min: 90, cat: personal },
    { title: 'Sunday roast', start: at(0, 17, 0), min: 120, cat: family, location: 'Home' },
  ];

  for (const e of events) {
    await api('/events', {
      method: 'POST',
      body: JSON.stringify({
        title: e.title,
        description: e.description ?? null,
        location: e.location ?? null,
        startAt: e.start,
        endAt: plus(e.start, e.min),
        isAllDay: false,
        categoryId: e.cat.id,
        visibility: 'private',
      }),
    });
  }
  console.log(`created ${events.length} timed events`);

  // ── All-day events ──
  const allDay = [
    { title: 'Design offsite', day: 2, span: 2, cat: work },
    { title: 'Ella — school holiday', day: 5, span: 1, cat: family },
  ];
  for (const a of allDay) {
    await api('/events', {
      method: 'POST',
      body: JSON.stringify({
        title: a.title,
        startAt: dayOnly(a.day),
        endAt: dayOnly(a.day + a.span),
        isAllDay: true,
        categoryId: a.cat.id,
        visibility: 'private',
      }),
    });
  }
  console.log(`created ${allDay.length} all-day events`);

  // ── Recurring events ──
  const recurring = [
    {
      title: 'Weekly planning',
      start: at(1, 8, 30),
      min: 30,
      cat: work,
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
    },
    {
      title: 'Swim practice',
      start: at(2, 7, 0),
      min: 60,
      cat: health,
      rrule: 'FREQ=WEEKLY;BYDAY=TU,TH',
    },
  ];
  for (const r of recurring) {
    await api('/events', {
      method: 'POST',
      body: JSON.stringify({
        title: r.title,
        startAt: r.start,
        endAt: plus(r.start, r.min),
        isAllDay: false,
        categoryId: r.cat.id,
        rrule: r.rrule,
        visibility: 'private',
      }),
    });
  }
  console.log(`created ${recurring.length} recurring events`);

  // ── Tasks ──
  const tasks = [
    { title: 'Finalise colour token audit', due: at(1, 17, 0), priority: 'high', cat: work },
    { title: 'Write the recurrence RFC', due: at(2, 17, 0), priority: 'high', cat: work },
    {
      title: 'Review Devon’s PR',
      due: at(1, 12, 0),
      priority: 'medium',
      cat: work,
      status: 'in_progress',
    },
    { title: 'Book the offsite venue', due: at(3, 17, 0), priority: 'medium', cat: work },
    { title: 'Update onboarding copy', due: at(4, 17, 0), priority: 'low', cat: work },
    { title: 'Renew passport', due: at(5, 12, 0), priority: 'high', cat: personal },
    { title: 'Pay the electricity bill', due: at(3, 9, 0), priority: 'medium', cat: personal },
    { title: 'Order Ella’s football boots', due: at(4, 12, 0), priority: 'low', cat: family },
    { title: 'Refill prescription', due: at(2, 10, 0), priority: 'medium', cat: health },
    { title: 'Schedule annual checkup', due: null, priority: 'low', cat: health },
    { title: 'Plan the summer trip', due: null, priority: 'none', cat: family },
    { title: 'Archive Q1 research notes', due: at(-2, 17, 0), priority: 'medium', cat: work },
    {
      title: 'Send the sponsor thank-yous',
      due: at(-1, 17, 0),
      priority: 'low',
      cat: personal,
      status: 'done',
    },
    {
      title: 'Ship the token migration',
      due: at(0, 17, 0),
      priority: 'high',
      cat: work,
      status: 'done',
    },
  ];

  for (const t of tasks) {
    const created = await api('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: t.title,
        dueAt: t.due,
        priority: t.priority,
        categoryId: t.cat.id,
      }),
    });
    if (t.status && t.status !== 'todo') {
      await api(`/tasks/${created.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: t.status }),
      });
    }
  }
  console.log(`created ${tasks.length} tasks`);

  console.log('\nSeed complete.');
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
  console.log(`  note:     ${TZ_OFFSET_NOTE}`);
}

main().catch((err) => {
  console.error('SEED FAILED:', err.message);
  process.exit(1);
});
