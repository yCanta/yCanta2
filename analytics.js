// Production
window.analyticsURL = "https://script.google.com/macros/s/AKfycbwo2Sv5xIGyzSoYyB09YMmUVNhzvEyNImHTS2q-KAx4RpZ_5_2_2i3SOncObZxD9e9XnA/exec";


//HELPER FUNCTIONS
function getOS() {
  var userAgent = window.navigator.userAgent,
      platform = window.navigator?.userAgentData?.platform || window.navigator.platform,
      macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
      windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
      iosPlatforms = ['iPhone', 'iPad', 'iPod'],
      os = userAgent || platform;

  if (macosPlatforms.indexOf(platform) !== -1) {
    os = 'Mac OS';
  } else if (iosPlatforms.indexOf(platform) !== -1) {
    os = 'iOS';
  } else if (windowsPlatforms.indexOf(platform) !== -1) {
    os = 'Windows';
  } else if (/Android/.test(userAgent)) {
    os = 'Android';
  } else if (/CrOS|Chrome OS/.test(userAgent + platform)) { // was logged as the whole user agent
    os = 'ChromeOS';
  } else if (/Linux/.test(platform)) {
    os = 'Linux';
  }

  return os;
}
function getScreenSize() {
  const width  = window.innerWidth  || document.documentElement.clientWidth  || document.body.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;

  return `${width}x${height}`;
}
function isTouchCapable() {
  return window.matchMedia("(pointer: coarse)").matches;
}
function isInstalled() {
  // Detects if device is in standalone mode
  var isInStandaloneMode = false;
  if (matchMedia('(display-mode: standalone)').matches) { // replace standalone with fullscreen or minimal-ui according to your manifest
    isInStandaloneMode = true; // Android and iOS 11.3+
  } else if ('standalone' in navigator) {
    isInStandaloneMode = navigator.standalone; // useful for iOS < 11.3
  }
  return isInStandaloneMode;
}

/*
 * Analytics, version 2.
 * Each page load is a session: one record of the device and settings (setSessionInfo), plus a list
 * of events, like pages viewed, edits and exports (logData). Both wait in localStorage until the
 * backend says it saved them, so nothing is lost offline. The backend writes sessions to the
 * Sessions tab (one row each) and events to the Events tab.
 */
const ANALYTICS_QUEUE = 'analyticsQueue';
const MAX_QUEUED_EVENTS = 500; // so the queue can't grow forever if sending keeps failing
const MAX_QUEUED_SESSIONS = 50;
const MAX_POST_CHARS = 60000; // fetch keepalive allows 64KB
const LOCATION_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // look the location up once a month, not every load
const SESSION_FIELDS = ['darkMode', 'fontSize']; // logData names that update the session instead of adding an event
const analyticsSessionId = crypto.randomUUID();

window.addEventListener("load", (event) => {
  window.loadData = true;
});
window.addEventListener("visibilitychange", (event)=> {
  logData('timing', document.visibilityState); // 'hidden' / 'visible', so visits have a length
  if (document.visibilityState === 'hidden') submitLogData();
});

function analyticsAllowed() {
  return window.user && localStorage.getItem(window.user._id + 'analytics') !== 'false';
}

function readAnalyticsQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(ANALYTICS_QUEUE));
    if (queue && Array.isArray(queue.events) && queue.sessions && typeof queue.sessions === 'object') return queue;
  } catch {}
  return { sessions: {}, events: [] };
}
function writeAnalyticsQueue(queue) {
  try {
    localStorage.setItem(ANALYTICS_QUEUE, JSON.stringify(queue));
  } catch (error) {
    console.error("Analytics Error:", error.message); // storage full or blocked
  }
}

// Add facts about this visit (user, device, settings). They're sent again whenever they change.
function setSessionInfo(fields) {
  if (!analyticsAllowed()) return;
  const queue = readAnalyticsQueue();
  const session = queue.sessions[analyticsSessionId] || {
    id: analyticsSessionId,
    install: localStorage.getItem('analyticID'),
    start: Date.now()
  };
  Object.assign(session, fields, { lastSeen: Date.now(), rev: (session.rev || 0) + 1 });
  queue.sessions[analyticsSessionId] = session;
  // Same idea as MAX_QUEUED_EVENTS: keep only the newest visits while the backend can't be reached
  const oldest = Object.values(queue.sessions).sort((a, b) => b.start - a.start).slice(MAX_QUEUED_SESSIONS);
  oldest.forEach(s => delete queue.sessions[s.id]);
  writeAnalyticsQueue(queue);
}

// Capture function: one event, e.g. logData('hashchanged', location.hash)
function logData(header, information, time = new Date().getTime()) {
  if (!analyticsAllowed()) return;

  // If information is empty, return
  if (information === undefined || information === null || information.toString().trim() === '') {
    return
  }

  if (SESSION_FIELDS.includes(header)) {
    setSessionInfo({ [header]: information });
    return;
  }

  const queue = readAnalyticsQueue();
  queue.events.push({
    id: crypto.randomUUID(), // so a send can remove exactly what it sent, even with two tabs open
    t: time,
    s: analyticsSessionId,
    u: window.user._id,
    e: header,
    v: information
  });
  if (queue.events.length > MAX_QUEUED_EVENTS) {
    queue.events = queue.events.slice(-MAX_QUEUED_EVENTS);
  }
  const session = queue.sessions[analyticsSessionId];
  if (session) {
    session.lastSeen = time;
    session.rev = (session.rev || 0) + 1;
  }
  writeAnalyticsQueue(queue);
}

// The location is a third-party lookup by IP, so do it at most once a month per device
function updateAnalyticsLocation() {
  if (!analyticsAllowed()) return;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('analyticsLocation')); } catch {}
  if (saved?.value && Date.now() - saved.at < LOCATION_MAX_AGE) {
    setSessionInfo({ location: saved.value });
    return;
  }
  fetch('https://ipapi.co/json/')
    .then(response => response.json())
    .then(data => {
      if (!data.country_name) return; // rate limited or blocked
      const value = [data.country_name, data.region, data.city].filter(Boolean).join(', ');
      localStorage.setItem('analyticsLocation', JSON.stringify({ value, at: Date.now() }));
      setSessionInfo({ location: value });
    })
    .catch(error => console.error('Error fetching location:', error));
}

// SUBMIT VIA POST
let analyticsSending = false;
async function submitLogData() {
  if (analyticsSending) return;
  const queue = readAnalyticsQueue();
  // The version 1 queue: entries an older copy of the app saved but never got to send
  const legacy = (() => {
    try { return (JSON.parse(localStorage.getItem('dataLog')) || []).filter(e => e && typeof e === 'object'); } catch { return []; }
  })();

  const sessions = Object.values(queue.sessions).filter(s => s.rev !== s.sentRev);
  let events = queue.events.slice(0, 300);
  if (sessions.length === 0 && events.length === 0 && legacy.length === 0) return;

  const payloadFor = events => JSON.stringify({
    action: "log",
    v: 2,
    sessions: sessions.map(({ rev, sentRev, ...session }) => session),
    events: events.map(e => [e.t, e.s, e.u, e.e, e.v]),
    legacy
  });
  let body = payloadFor(events);
  while (body.length > MAX_POST_CHARS && events.length > 1) {
    events = events.slice(0, Math.ceil(events.length / 2));
    body = payloadFor(events);
  }

  analyticsSending = true;
  try {
    const response = await fetch(window.analyticsURL, {
      method: "POST",
      body,
      keepalive: body.length <= MAX_POST_CHARS, // lets the send finish when the page is closing
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        // Note: Using text/plain avoids "CORS preflight" checks in Apps Script
      }
    });

    if (!response.ok) throw new Error("Request failed " + response.statusText);

    const result = await response.json();

    if (result.result === "success") { // Only remove what was sent once the backend saved it
      const sentIds = new Set(events.map(e => e.id));
      const sentRevs = Object.fromEntries(sessions.map(s => [s.id, s.rev]));
      const latest = readAnalyticsQueue(); // re-read: more may have been logged while sending
      latest.events = latest.events.filter(e => !sentIds.has(e.id));
      for (const [id, session] of Object.entries(latest.sessions)) {
        if (sentRevs[id] !== undefined) session.sentRev = sentRevs[id];
        // A finished visit from an earlier page load that is fully sent can go
        if (id !== analyticsSessionId && session.sentRev === session.rev) delete latest.sessions[id];
      }
      writeAnalyticsQueue(latest);
      if (legacy.length) localStorage.removeItem('dataLog');
    } else {
      throw new Error(result.error || 'not saved');
    }
  } catch (error) {
    console.error("Analytics Error:", error.message);
  } finally {
    analyticsSending = false;
  }
}
