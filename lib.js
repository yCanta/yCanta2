String.prototype.count=function(s1) { 
    return (this.length - this.replace(new RegExp(s1,"g"), '').length) / s1.length;
};
// Search text without accents, so "jesus" finds "Jesús" (issue #124). list.min.js strips them from the query.
function stripAccents(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
// Escape user-entered text before putting it into innerHTML
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Song text shows as text, never as page code: a title like <img onerror=...> would otherwise run for
// everyone who opens the list. Fields are plain text (the editor saves them as text). A lyric line keeps
// the markup songs really carry: chords (<c>), line breaks, blocks pasted in (<div>), and links to web
// pages (in comment sections). Anything else in a line shows as its text.
function safeSongLine(line) {
  const box = document.createElement('template'); // parsed inert: nothing in it loads or runs
  box.innerHTML = String(line ?? '');
  const walk = parent => [...parent.childNodes].map(node => {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.localName;
    if (tag === 'c') return `<c>${escapeHtml(node.textContent)}</c>`;
    if (tag === 'br') return '<br>';
    if (tag === 'div') return `<div>${walk(node)}</div>`;
    if (tag === 'a') {
      const href = node.getAttribute('href') || '';
      return /^https?:\/\//i.test(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${walk(node)}</a>` : walk(node);
    }
    return walk(node); // any other tag: just its text
  }).join('');
  return walk(box.content);
}
// A song's scripture refs are typed as one line split at its commas, so "Ps 95:1,2,6,7" came apart into
// "Ps 95:1", "2", "6", "7". A piece with no letters in it (a verse, a range, a chapter:verse) goes back
// onto the ref before it; one with a book's name ("1 John 4:8", "Rom 8:11") starts a new ref.
function joinScriptureRefs(refs) {
  const joined = [];
  refs.forEach(ref => {
    const piece = String(ref ?? '').trim();
    if (joined.length && piece && !/\p{L}/u.test(piece) && joined.at(-1)) joined[joined.length - 1] += ', ' + piece;
    else joined.push(piece);
  });
  return joined;
}
// A copy of a song in the shape the app expects, whatever an old import, a bug or another app saved: text
// where text belongs, lists where lists belong, and its words as parts of lines. Used before showing,
// presenting or exporting a song, so one bad record can't stop them. The song itself never changes.
function songShape(doc) {
  if (!doc) return doc;
  const textOf = value => (value == null ? '' : String(value));
  const listOf = value => (Array.isArray(value) ? value : [value]).map(textOf); // a missing one is ['']
  const content = Array.isArray(doc.content) ? doc.content
    : doc.content == null ? [] : [[{ type: 'verse' }, [doc.content]]]; // plain text or a number: one verse
  return {
    ...doc,
    title: textOf(doc.title), key: textOf(doc.key), introduction: textOf(doc.introduction), copyright: textOf(doc.copyright),
    authors: listOf(doc.authors), scripture_ref: joinScriptureRefs(listOf(doc.scripture_ref)),
    categories: doc.categories == null ? [] : listOf(doc.categories),
    content: content.map(chunk => [
      { ...(chunk?.[0] && typeof chunk[0] === 'object' ? chunk[0] : {}), type: textOf(chunk?.[0]?.type || 'verse') },
      (Array.isArray(chunk?.[1]) ? chunk[1] : chunk?.[1] == null ? [] : [chunk[1]]).map(textOf),
    ]),
  };
}

// A copy of a song to show: its fields as text, its lines through safeSongLine. The song itself (saved,
// edited, kept in old versions) never changes.
function displaySong(doc) {
  if (!doc) return doc;
  doc = songShape(doc);
  const text = value => escapeHtml(value);
  return {
    ...doc,
    title: text(doc.title), key: text(doc.key), introduction: text(doc.introduction), copyright: text(doc.copyright),
    authors: doc.authors.map(text), scripture_ref: doc.scripture_ref.map(text), categories: doc.categories.map(text),
    cclis: typeof doc.cclis === 'string' ? text(doc.cclis) : doc.cclis,
    search: typeof doc.search === 'string' ? text(doc.search) : doc.search,
    content: doc.content.map(chunk => [
      { ...chunk[0], type: chunk[0].type.replace(/[^a-z -]/gi, '') },
      chunk[1].map(safeSongLine),
    ]),
  };
}
// Tells the user a database call failed (#1), with the details in the console.
// whatFailed finishes "Couldn't ...", for example 'save the song'.
// stay: the most serious failures (work not saved, sync stopped) stay on screen until closed instead of
// fading after 5 seconds (#137); more adds a sentence; onClick makes the message a "try again". Returns
// the sticky message.
function reportDbError(err, whatFailed, { stay = false, more = '', onClick = null } = {}) {
  console.error(`Couldn't ${whatFailed}:`, err);
  let why;
  if (err?.status === 409 || err?.name === 'conflict') why = 'someone else changed it at the same time. Reload and try again.';
  else if (err?.status === 401 || err?.name === 'unauthorized') why = 'please log in again.';
  else if (err?.status === 403 || err?.name === 'forbidden') why = "you don't have permission.";
  else if (err?.status === 404 || err?.name === 'not_found') why = "it wasn't found.";
  else if (!navigator.onLine || err?.status === 0 || err?.name === 'unknown_error') why = "the server can't be reached.";
  else why = (err?.message || String(err)) + '.';
  const message = `Couldn't ${escapeHtml(whatFailed)}: ${escapeHtml(why)}${more ? ' ' + escapeHtml(more) : ''}`;
  if (!stay) {
    notyf.error(message);
    return null;
  }
  return stickyError(onClick ? `${message} Tap here to try again.` : message, onClick, whatFailed);
}

// A red message at the top that stays until it's closed (#137), or tapped when it offers to try again.
// One per kind: a second failure of the same kind (a save tried again) replaces the first.
const stickyErrors = new Map();
function stickyError(message, onClick = null, kind = message) {
  clearStickyError(kind);
  const notice = dysmyssable.open({ type: 'error', message, background: 'crimson' });
  stickyErrors.set(kind, notice);
  notice.on('dismiss', () => { if (stickyErrors.get(kind) === notice) stickyErrors.delete(kind); });
  if (onClick) notice.on('click', () => {
    clearStickyError(kind);
    onClick();
  });
  return notice;
}
// Take a kind's message away, e.g. when the save it was about worked after all
function clearStickyError(kind) {
  const notice = stickyErrors.get(kind);
  if (!notice) return;
  stickyErrors.delete(kind);
  dysmyssable.dismiss(notice);
}
// One style for errors (UX audit #24): the app's own red note, never the browser's alert box. A short one fades
// after 5 seconds in the corner; stay: true keeps it at the top until it's closed, for one worth reading twice
// (it has details or a list). The message is plain text: a new line in it starts a new line.
function showError(message, { stay = false } = {}) {
  const html = escapeHtml(message).replace(/\n/g, '<br>');
  if (stay) return stickyError(html);
  notyf.error(html);
  return null;
}
// A step-by-step dialog for tasks that need input: adding people, passwords, recovery email.
// It is the browser's own <dialog> and <form>: showModal() dims the page, keeps keyboard focus inside
// and closes on Esc, and the inputs' required/minlength/type checks show the browser's own messages.
// One dialog stays open through every step. While it waits it says what it is doing, an error shows
// in place so the person can fix it and try again, and the last step stays until they close it.
//
//   const d = new TaskDialog('Add someone');
//   const result = await d.run({ text, fields: [{ name, label, type }], submit: 'Add', action: async values => ... });
//   if (result === null) return;          // cancelled
//   await d.finish('Added.');             // shows the result until they close it
//
// (The floating #dialog is a different thing: song info and the YouTube player, beside the page.)
class TaskDialog {
  constructor(title) {
    const titleId = 'task-title-' + Math.random().toString(36).slice(2);
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'task-dialog';
    this.dialog.setAttribute('aria-labelledby', titleId);
    this.dialog.innerHTML = `<form method="dialog">
        <h2 id="${titleId}">${escapeHtml(title)}</h2>
        <fieldset>
          <div class="task-body"></div>
          <p class="task-error" role="alert" hidden></p>
          <p class="task-status" role="status"></p>
          <div class="task-buttons"></div>
        </fieldset>
      </form>`;
    this.form = this.dialog.querySelector('form');
    this.fieldset = this.dialog.querySelector('fieldset');
    this.body = this.dialog.querySelector('.task-body');
    this.errorLine = this.dialog.querySelector('.task-error');
    this.statusLine = this.dialog.querySelector('.task-status');
    this.buttons = this.dialog.querySelector('.task-buttons');
    this.settle = null;
    this.busy = false;
    // Esc: cancel, unless something is in progress
    this.dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    this.dialog.addEventListener('close', () => {
      // Browsers close a dialog on a second Esc even when the first was refused: while something is
      // in progress, open it again, so the person still sees how it ends
      if (this.busy) {
        this.dialog.showModal();
        return;
      }
      this.resolveWith(null);
      this.dialog.remove();
    });
    document.body.append(this.dialog);
    this.dialog.showModal();
  }

  resolveWith(value) {
    const settle = this.settle;
    this.settle = null;
    if (settle) settle(value);
  }

  render({ text = '', html = '', fields = [], submit = '', cancel = 'Cancel', danger = false }) {
    this.setBusy(false); // new content after working() must be usable (working() sets busy again after this)
    this.errorLine.hidden = true;
    const paragraphs = text ? text.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('') : '';
    this.body.innerHTML = paragraphs + html + fields.map(field => {
      const attrs = [
        `name="${escapeHtml(field.name)}"`,
        `type="${escapeHtml(field.type || 'text')}"`,
        field.value ? `value="${escapeHtml(field.value)}"` : '',
        field.required === false ? '' : 'required',
        field.minlength ? `minlength="${field.minlength}"` : '',
        field.maxlength ? `maxlength="${field.maxlength}"` : '',
        field.accept ? `accept="${escapeHtml(field.accept)}"` : '',
        `autocomplete="${escapeHtml(field.autocomplete || 'off')}"`,
        field.inputmode ? `inputmode="${escapeHtml(field.inputmode)}"` : '',
        field.type === 'text' || !field.type ? 'autocapitalize="off" spellcheck="false"' : '',
      ].filter(Boolean).join(' ');
      const help = field.help ? `<small>${escapeHtml(field.help)}</small>` : '';
      return `<label>${escapeHtml(field.label)}${help}<input ${attrs}></label>`;
    }).join('');
    this.buttons.innerHTML =
      (cancel ? `<button type="button" class="btn" data-cancel>${escapeHtml(cancel)}</button>` : '') +
      (submit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${escapeHtml(submit)}</button>` : '');
    this.buttons.querySelector('[data-cancel]')?.addEventListener('click', () => this.close());

    // "Password again" fields must match the field they repeat
    for (const field of fields.filter(f => f.match)) {
      const again = this.form.elements[field.name];
      const first = this.form.elements[field.match];
      const check = () => again.setCustomValidity(again.value && again.value !== first.value ? "The passwords don't match." : '');
      again.addEventListener('input', check);
      first.addEventListener('input', check);
    }
    (this.body.querySelector('input:not([value]), input') || this.buttons.querySelector('[type="submit"]'))?.focus();
  }

  setBusy(message) {
    this.busy = !!message;
    this.fieldset.disabled = this.busy;
    this.statusLine.innerHTML = message ? `<span class="spinner" aria-hidden="true"></span>${escapeHtml(message)}` : '';
  }

  showError(err) {
    let message = err?.message || err?.reason || err?.name || String(err);
    if (!navigator.onLine) message += ' You seem to be offline.';
    this.errorLine.textContent = message;
    this.errorLine.hidden = false;
  }

  // One step: show it, and when it is submitted run action(values). Resolves with what action returns
  // (true if nothing), or null if they cancel. If action throws, the error shows and they can retry.
  run(spec) {
    this.setBusy(false); // a step after working() must start unlocked
    this.render(spec);
    return new Promise(resolve => {
      this.settle = resolve;
      this.form.onsubmit = async event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(this.form)); // before the fieldset is disabled
        for (const field of spec.fields || []) {
          if (!['password', 'file', 'checkbox'].includes(field.type)) values[field.name] = (values[field.name] || '').trim();
        }
        this.errorLine.hidden = true;
        this.setBusy(spec.working || 'Working…');
        try {
          const result = await spec.action(values);
          this.setBusy(false);
          this.resolveWith(result === undefined ? true : result);
        } catch (err) {
          console.error(err);
          this.setBusy(false);
          this.showError(err);
          this.body.querySelector('input')?.focus();
        }
      };
    });
  }

  // Something is happening and there is nothing to fill in yet
  working(message) {
    this.render({ cancel: '' });
    this.setBusy(message);
  }

  // The last step: a result that stays until they close it
  finish(text, { html = '', error = false } = {}) {
    this.setBusy(false);
    this.render({ text, html, submit: 'Close', cancel: '' });
    if (error) this.body.classList.add('task-error');
    return new Promise(resolve => {
      this.settle = resolve;
      this.form.onsubmit = event => {
        event.preventDefault();
        this.close();
      };
    });
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  // A one-step message, e.g. when a quick change fails
  static async message(title, text) {
    await new TaskDialog(title).finish(text);
  }
}

const copyToClipboard = str => {
  const el = document.createElement('textarea');  // Create a <textarea> element
  el.value = str;                                 // Set its value to the string that you want copied
  el.setAttribute('readonly', '');                // Make it readonly to be tamper-proof
  el.style.position = 'absolute';                 
  el.style.left = '-9999px';                      // Move outside the screen to make it invisible
  document.body.appendChild(el);                  // Append the <textarea> element to the HTML document
  const selected =            
    document.getSelection().rangeCount > 0        // Check if there is any content selected previously
      ? document.getSelection().getRangeAt(0)     // Store selection if found
      : false;                                    // Mark as false to know no selection existed before
  el.select();                                    // Select the <textarea> content
  document.execCommand('copy');                   // Copy - only works as a result of a user action (e.g. click events)
  document.body.removeChild(el);                  // Remove the <textarea> element
  if (selected) {                                 // If a selection existed before copying
    document.getSelection().removeAllRanges();    // Unselect everything on the HTML document
    document.getSelection().addRange(selected);   // Restore the original selection
  }
  notyf.info('Format copied to your clipboard', 'var(--export-color)');
  blueHighlight(document.getElementById('export_copy'));
};
// Paste export settings someone copied. It says so only once they're in, and says plainly when the
// clipboard holds something else, or the browser won't let the app read it (#131).
async function pasteFromClipboard() {
  blueHighlight(document.getElementById('export_paste'));
  let settings;
  try {
    settings = JSON.parse(await navigator.clipboard.readText());
  } catch (err) {
    console.warn('Could not paste export settings:', err);
    notyf.error(err instanceof SyntaxError
      ? "The clipboard doesn't hold export settings. Use Copy on an export first."
      : "Couldn't read the clipboard. Allow this site to paste, or try again.");
    return;
  }
  if (!Array.isArray(settings) || !settings.every(s => s && typeof s.name === 'string')) {
    notyf.error("The clipboard doesn't hold export settings. Use Copy on an export first.");
    return;
  }
  set_value_by_id(settings);
  document.getElementById('paper_margin_top').dispatchEvent(new Event('change', { bubbles: true }));
  notyf.info('Format pasted from your clipboard', 'var(--export-color)');
}
function blueHighlight(highlightElement){
  highlightElement.classList.add('bluehighlight'); 
  setTimeout(function(){ highlightElement.classList.remove('bluehighlight')}, 300);
}
/*!
 * Check if two objects or arrays are equal
 * (c) 2017 Chris Ferdinandi, MIT License, https://gomakethings.com
 * @param  {Object|Array}  value  The first object or array to compare
 * @param  {Object|Array}  other  The second object or array to compare
 * @return {Boolean}              Returns true if they're equal
 */
var isEqual = function (value, other) {
  // Get the value type
  var type = Object.prototype.toString.call(value);
  // If the two objects are not the same type, return false
  if (type !== Object.prototype.toString.call(other)) return false;
  // If items are not an object or array, return false
  if (['[object Array]', '[object Object]'].indexOf(type) < 0) return false;
  // Compare the length of the length of the two items
  var valueLen = type === '[object Array]' ? value.length : Object.keys(value).length;
  var otherLen = type === '[object Array]' ? other.length : Object.keys(other).length;
  if (valueLen !== otherLen) return false;
  // Compare two items
  var compare = function (item1, item2) {
    // Get the object type
    var itemType = Object.prototype.toString.call(item1);
    // If an object or array, compare recursively
    if (['[object Array]', '[object Object]'].indexOf(itemType) >= 0) {
      if (!isEqual(item1, item2)) return false;
    }
    // Otherwise, do a simple comparison
    else {
      // If the two items are not the same type, return false
      if (itemType !== Object.prototype.toString.call(item2)) return false;
      // Else if it's a function, convert to a string and compare
      // Otherwise, just compare
      if (itemType === '[object Function]') {
        if (item1.toString() !== item2.toString()) return false;
      } else {
        if (item1 !== item2) return false;
      }
    }
  };
  // Compare properties
  if (type === '[object Array]') {
    for (var i = 0; i < valueLen; i++) {
      if (compare(value[i], other[i]) === false) return false;
    }
  } else {
    for (var key in value) {
      if (value.hasOwnProperty(key)) {
        if (compare(value[key], other[key]) === false) return false;
      }
    }
  }
  // If nothing failed, return true
  return true;
};

// Warn if overriding existing method
if(Array.prototype.equals)
    console.warn("Overriding existing Array.prototype.equals. Possible causes: New API defines the method, there's a framework conflict or you've got double inclusions in your code.");
// attach the .equals method to Array's prototype to call it on any array
Array.prototype.equals = function (array) {
    // if the other array is a falsy value, return
    if (!array)
        return false;

    // compare lengths - can save a lot of time 
    if (this.length != array.length)
        return false;

    for (var i = 0, l=this.length; i < l; i++) {
        // Check if we have nested arrays
        if (this[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!this[i].equals(array[i]))
                return false;       
        }           
        else if (this[i] != array[i]) { 
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;   
        }           
    }       
    return true;
}
// Hide method from for-in loops
Object.defineProperty(Array.prototype, "equals", {enumerable: false});

var notyf = new Notyf({
  duration: 5000,
  position: {x: 'left', y: 'bottom'},
  types: [{
      type: 'info',
      background: 'var(--songbookList-color)',
      icon: false
    },{
      type: 'success',
      background: 'var(--song-color)',
      icon: false
    }]
});

notyf.info = function(message, color='var(--songbookList-color)', url=false){
  if(url){
    notyf.open({
      type: 'info',
      message: message,
      background: color
    }).on('click', ({target, event}) => {
      window.location.href = url;
    });
  } else {
    notyf.open({
      type: 'info',
      message: message,
      background: color
    });
  }
}

var dysmyssable = new Notyf({
  duration: 0,
  position: {x: 'center', y: 'top'},
  types: [{
      type: 'info',
      background: 'var(--songbookList-color)',
      icon: true
    }],
  dismissible: true
});

dysmyssable.info = function(message, color='var(--songbookList-color)', url=false){
  if(url){
    dysmyssable.open({
      type: 'info',
      message: message,
      background: color
    }).on('click', ({target, event}) => {
      window.location.hash = url;
    });
  } else {
    dysmyssable.open({
      type: 'info',
      message: message,
      background: color
    });
  }
}

// A card in the bottom right corner that stays until it's closed: a click on it does what it offers
// (style.css .corner-card: the pointer)
const cornerCard = new Notyf({
  duration: 0,
  position: {x: 'right', y: 'bottom'},
  types: [{ type: 'info', background: 'var(--songbookList-color)', icon: false }],
  dismissible: true
});

// The person's own settings that follow them to every device: kept on their user record, which only they can
// change (database/validate.js)
// Revisions of the user record saved here, so the changes feed doesn't say "User Updated" for them (db.js).
// .saving: saves under way, since the feed can hear of one before upsert returns.
const ownUserRevs = Object.assign(new Set(), { saving: 0 });
async function saveUserSettings(fields, tries = 0) {
  Object.assign(window.user, fields);
  ownUserRevs.saving++;
  try {
    // Not on this device yet (a first sign-in still downloading): wait for it, so a bare record isn't made
    // to fight the real one
    const here = await db.get(window.user._id).then(() => true, err => (err.status === 404 ? false : Promise.reject(err)));
    if (!here) {
      if (tries < 12) setTimeout(() => saveUserSettings(fields, tries + 1), 5000);
      return;
    }
    const saved = await db.upsert(window.user._id, doc => ({ ...doc, ...fields }));
    ownUserRevs.add(saved.rev);
  } catch (err) {
    reportDbError(err, 'save your settings');
  } finally {
    setTimeout(() => { ownUserRevs.saving--; }, 1000);
  }
}

// Settings' analytics switch. Turned off, the last thing sent says so; turned on, the first.
function setAnalytics(on) {
  if (!on) logData('analytics', false);
  saveUserSettings({ analytics: on });
  if (on) logData('analytics', true);
}

// Once for each person (on their user record, so not again on their other devices): what analytics sends, and
// where to turn it off. A click opens that switch; closing it is enough to have seen it.
function showAnalyticsNotice() {
  if (window.user.analytics === false || window.user.analyticsNoticed) return;
  let seen = false;
  const noticed = () => {
    if (seen) return;
    seen = true;
    saveUserSettings({ analyticsNoticed: Date.now() });
  };
  const card = cornerCard.open({
    type: 'info',
    className: 'corner-card',
    message: 'yCanta sends information to help us improve how it works. You can <u>toggle this in settings</u>.',
  });
  card.on('dismiss', noticed);
  card.on('click', () => {
    noticed();
    cornerCard.dismiss(card);
    openSetting('analytics');
  });
}

// Settings (on the home page, as the account menu's Settings button opens it), scrolled to one setting
// ---- The menu under your name: a list that jumps to the home page's cards (My Profile, Settings, Categories,
// Trash, Admin) and opens the one picked, so it's two taps away from anywhere. Help opens over the screen you're
// on. Esc or a click outside closes it; ↑ ↓ move through it.
function toggleAccountMenu(open, fromKeyboard = false) {
  const box = document.querySelector('.accountBtn');
  const show = open ?? box.classList.contains('closed');
  box.classList.toggle('closed', !show);
  document.getElementById('username_legend').setAttribute('aria-expanded', String(show));
  if (show && fromKeyboard) accountMenuItems()[0]?.focus({ preventScroll: true }); // a mouse or a tap leaves focus be
}
const accountMenuItems = () => [...document.querySelectorAll('#account_menu button')].filter(b => b.offsetParent);
// Go home, open a card there (its header's click runs whatever it loads), and bring it into view
function openHomeCard(id) {
  const card = document.getElementById(id);
  if (!card) return;
  const atHome = () => location.hash === '#' || location.hash === '';
  const show = () => {
    if (!atHome()) return; // they stayed, at "you'll lose your changes"
    if (card.classList.contains('closed')) card.querySelector(':scope > legend')?.click();
    setTimeout(() => card.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350);
  };
  if (atHome()) show();
  else { location.hash = '#'; setTimeout(show, 300); }
}
document.addEventListener('DOMContentLoaded', () => {
  const box = document.querySelector('.accountBtn'), menu = document.getElementById('account_menu');
  if (!box || !menu) return;
  menu.addEventListener('click', e => {
    const item = e.target.closest('[data-open]');
    if (!item) return;
    toggleAccountMenu(false);
    const what = item.dataset.open;
    if (what === 'help') openHelp();
    else if (what === 'logout') dbLogout();
    else if (what === 'install') showInstallSteps();
    else openHomeCard(what);
  });
  document.getElementById('username_legend').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAccountMenu(undefined, true); }
  });
  box.addEventListener('keydown', e => {
    if (box.classList.contains('closed')) return;
    const items = accountMenuItems(), at = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); toggleAccountMenu(false); document.getElementById('username_legend').focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const down = e.key === 'ArrowDown';
      items[at < 0 ? (down ? 0 : items.length - 1) : (at + (down ? 1 : items.length - 1)) % items.length]?.focus();
    }
  });
  document.addEventListener('pointerdown', e => {
    if (!box.classList.contains('closed') && !box.contains(e.target)) toggleAccountMenu(false);
  }, true);
});

function openSetting(id) {
  if (location.hash !== '#' && location.hash !== '') location.hash = '#';
  setTimeout(() => {
    goToSettings();
    setTimeout(() => document.getElementById(id)?.closest('.content')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
  }, 100);
}

// What a presentation showed (#158). When it closes it sends its list here (presentation.js, endReport): it
// goes to the analytics sheet, and a card in the corner offers to show it until it's closed.
const presentationsEnded = new Set();
window.presentationEnded = function(json) {
  let report;
  try { report = JSON.parse(json); } catch (err) { return; }
  if (!report?.items?.length || presentationsEnded.has(report.id)) return;
  presentationsEnded.add(report.id);
  logData('presented', {
    book: report.book,
    minutes: Math.round((report.end - report.start) / 6000) / 10,
    // [title, CCLI # or translation, seconds on screen, slides shown, slides, counted]
    items: report.items.map(it => [it.title, it.ccli, it.seconds, it.shown, it.total, it.counted ? 1 : 0]),
    used: report.used || [], // features used: 'whole song', 'grid', 'mirror', 'shared', 'background', 'motion gentle'...
  }, report.start);
  const counted = report.items.filter(it => it.counted);
  const songs = counted.filter(it => it.kind === 'song').length, passages = counted.length - songs;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const what = [songs && plural(songs, 'song'), passages && plural(passages, 'Bible passage')].filter(Boolean).join(' and ');
  cornerCard.open({
    type: 'info',
    className: 'corner-card', // the whole card opens the list
    message: `${what ? `Counted ${what} for your CCLI report.` : 'Nothing was on screen long enough to count for your CCLI report.'} <u>See the list</u>`
  }).on('click', () => showPresentationReport(report));
};
// The list, as the presentation showed it: counted ones ticked, to copy for a CCLI report
function showPresentationReport(report) {
  const dialog = new TaskDialog('Presented');
  dialog.dialog.classList.add('report-dialog');
  const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const time = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = new Date(report.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const row = (it, i) => `<tr><td><input type="checkbox" data-i="${i}"${it.counted ? ' checked' : ''} aria-label="Count it"></td>
    <td>${it.kind === 'passage' ? '📖 ' : ''}${escapeHtml(it.title)}</td><td>${escapeHtml(it.ccli)}</td>
    <td>${clock(it.seconds)}</td><td>${it.shown} of ${it.total}</td></tr>`;
  const head = '<tr class="report-head"><td></td><td>Song or scripture</td><td>CCLI #</td><td>On screen</td><td>Slides</td></tr>';
  const rows = filter => report.items.map((it, i) => filter(it) ? row(it, i) : '').join('');
  const counted = rows(it => it.auto), brief = rows(it => !it.auto);
  dialog.render({
    html: `<p>${escapeHtml(report.book)}, ${escapeHtml(day)}, ${escapeHtml(time(report.start))} to ${escapeHtml(time(report.end))}</p>`
      + (counted ? `<table class="report-list">${head}${counted}</table>` : '')
      + (brief ? `<p>Shown briefly, not counted:</p><table class="report-list">${head}${brief}</table>` : ''),
    cancel: 'Close',
  });
  dialog.body.addEventListener('change', e => {
    const it = report.items[e.target.dataset.i];
    if (it) it.counted = e.target.checked;
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn primary';
  copy.textContent = 'Copy list';
  copy.addEventListener('click', async () => {
    const lines = report.items.filter(it => it.counted)
      .map(it => it.title + (it.ccli ? (it.kind === 'song' ? ` (CCLI ${it.ccli})` : ` (${it.ccli})`) : ''));
    try {
      await navigator.clipboard.writeText([`${report.book}, ${day}, ${time(report.start)} to ${time(report.end)}`, ...lines].join('\n'));
      copy.textContent = 'Copied';
    } catch (err) {
      copy.textContent = "Couldn't copy";
    }
    setTimeout(() => { copy.textContent = 'Copy list'; }, 1500);
  });
  dialog.buttons.append(copy);
}

window.addEventListener("resize", function(){
  window.setTimeout(function(){
    document.activeElement.scrollIntoView({block: 'start'});
  },0);
});
let export_form = {};

let margins = [];
margins['narrow'] = [.5,.5,.5,.5,.5,0];
margins['wide'] = [1,2,1,2,1,1];
margins['normal'] = [1,1,1,1,1,1];
margins['phone'] = [.3,.3,.3,.3,.3,0]; // a 4" wide phone page (#146)

let text = [];
text['default'] = [
  {name: 'booktitle_size', value: '24'},{name: 'booktitle_space',    value:  '26'},
  {name: 'songtitle_size', value: '14'},{name: 'songtitle_space',    value:  '6' },
  {name: 'small_size',     value: '8' },{name: 'small_space',        value:  '8' },
  {name: 'songline_size',  value: '12'},{name: 'songline_space',     value:  '4' },{name: 'resize_percent', value:  '100'},
  {name: 'songchord_size', value: '12'},{name: 'songchord_space',    value:  '1' },
  {name: 'songchunk_b4',   value: '12'},{name: 'song_space_after',   value:  '12'},
  {name: 'copyright_size', value: '8' },{name: 'copyright_space_b4', value:  '3' }
];

text['small'] = [
  {name: 'booktitle_size', value: '18'},{name: 'booktitle_space',    value: '18'},
  {name: 'songtitle_size', value: '12'},{name: 'songtitle_space',    value: '4' },
  {name: 'small_size',     value: '6' },{name: 'small_space',        value: '6' },
  {name: 'songline_size',  value: '10'},{name: 'songline_space',     value: '2' },{name: 'resize_percent', value: '75'},
  {name: 'songchord_size', value: '8' },{name: 'songchord_space',    value: '1' },
  {name: 'songchunk_b4',   value: '10'},{name: 'song_space_after',   value: '10'},
  {name: 'copyright_size', value: '6' },{name: 'copyright_space_b4', value: '2' }
];

text['large'] = [
  {name: 'booktitle_size', value: '36'},{name: 'booktitle_space',    value: '30'},
  {name: 'songtitle_size', value: '18'},{name: 'songtitle_space',    value: '10'},
  {name: 'small_size',     value: '10'},{name: 'small_space',        value: '10'},
  {name: 'songline_size',  value: '14'},{name: 'songline_space',     value: '6' },{name: 'resize_percent', value: '100'},
  {name: 'songchord_size', value: '14'},{name: 'songchord_space',    value: '4' },
  {name: 'songchunk_b4',   value: '14'},{name: 'song_space_after',   value: '14'},
  {name: 'copyright_size', value: '10'},{name: 'copyright_space_b4', value: '4' }
];

let index = [];
index['default'] = [
  {name: 'index_title_size', value: '18'},{name: 'index_title_space', value: '6'},{name: 'index_title_font', value: 'Times-Roman'},
  {name: 'index_title_b4',   value: '20'},
  {name: 'index_cat_size',   value: '14'},{name: 'index_cat_space',   value: '6'},{name: 'index_cat_font',   value: 'Times-Roman'},
  {name: 'index_cat_b4',     value: '12'},
  {name: 'index_song_size',  value: '12'},{name: 'index_song_space',  value: '4'},{name: 'index_song_font',  value: 'Times-Roman'},
  {name: 'index_first_line_size',  value: '11'},{name: 'index_first_line_space',  value: '4'},{name: 'index_first_line_font',  value: 'Times-Italic'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'}
];
index['small'] = [
  {name: 'index_title_size', value: '14'},{name: 'index_title_space', value: '4'},{name: 'index_title_font', value: 'Times-Roman'},
  {name: 'index_title_b4',   value: '16'},
  {name: 'index_cat_size',   value: '12'},{name: 'index_cat_space',   value: '4'},{name: 'index_cat_font',   value: 'Times-Roman'},
  {name: 'index_cat_b4',     value: '10'},
  {name: 'index_song_size',  value: '10'},{name: 'index_song_space',  value: '2'},{name: 'index_song_font',  value: 'Times-Roman'},
  {name: 'index_first_line_size',  value: '9'},{name: 'index_first_line_space',  value: '2'},{name: 'index_first_line_font',  value: 'Times-Italic'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'}
];
index['large'] = [
  {name: 'index_title_size', value: '26'},{name: 'index_title_space', value: '10'},{name: 'index_title_font', value: 'Times-Roman'},
  {name: 'index_title_b4',   value: '24'},
  {name: 'index_cat_size',   value: '18'},{name: 'index_cat_space',   value: '10'},{name: 'index_cat_font',   value: 'Times-Roman'},
  {name: 'index_cat_b4',     value: '16'},
  {name: 'index_song_size',  value: '16'},{name: 'index_song_space',  value: '8'},{name: 'index_song_font',  value: 'Times-Roman'},
  {name: 'index_first_line_size',  value: '14'},{name: 'index_first_line_space',  value: '6'},{name: 'index_first_line_font',  value: 'Times-Italic'},
  {name: 'index_cat_exclude',   value: 'Needs,Duplicate'}
];

let def_configs = [];
def_configs['1-column'] = [
  {name: 'font_face',           value: 'Times-Roman'}, // Text Options
  {name: 'display_chords',      value: 'no'},
  {name: 'start_song_on_new_page', value: 'no'},
  {name: 'hide_booktitle',      value: 'yes'},
  {name: 'songtitle_format',    value: '${num} '},
  {name: 'scripture_location',  value: 'under-title'},
  {name: 'text',                value: 'default' },
  {name: 'columns',             value: '1'},           // Page Options
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_orientation',   value: 'portrait'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'margin',              value: 'normal'},
  {name: 'paper_margin_gutter', value: '1'},
  {name: 'display_index',       value: 'no-index'},    // Index Options
  {name: 'include_first_line',  value: false},
  {name: 'display_cat_index',   value: 'no-index'},
  {name: 'display_scrip_index', value: 'no-index'},
  {name: 'index',               value: 'default'}
];
def_configs['2-column'] = [
  {name: 'font_face',           value: 'Times-Roman'}, // Text Options
  {name: 'display_chords',      value: 'no'},
  {name: 'start_song_on_new_page', value: 'no'},
  {name: 'hide_booktitle',      value: 'yes'},
  {name: 'songtitle_format',    value: '${num} '},
  {name: 'scripture_location',  value: 'under-title'},
  {name: 'text',                value: 'default' },
  {name: 'columns',             value: '2'},           // Page Options
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_orientation',   value: 'portrait'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'margin',              value: 'narrow'},
  {name: 'display_index',       value: 'no-index'},    // Index Options
  {name: 'include_first_line',  value: false},
  {name: 'display_cat_index',   value: 'no-index'},
  {name: 'display_scrip_index', value: 'no-index'},
  {name: 'index',               value: 'default'}
];
def_configs['3-column'] = [
  {name: 'font_face',           value: 'Times-Roman'}, // Text Options
  {name: 'display_chords',      value: 'no'},
  {name: 'start_song_on_new_page', value: 'no'},
  {name: 'hide_booktitle',      value: 'yes'},
  {name: 'songtitle_format',    value: '${num} '},
  {name: 'scripture_location',  value: 'under-title'},
  {name: 'text',                value: 'default' },
  {name: 'columns',             value: '3'},           // Page Options
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_orientation',   value: 'landscape'},
  {name: 'paper_size',          value: 'LETTER'},
  {name: 'margin',              value: 'narrow'},
  {name: 'display_index',       value: 'no-index'},    // Index Options
  {name: 'include_first_line',  value: false},
  {name: 'display_cat_index',   value: 'no-index'},
  {name: 'display_scrip_index', value: 'no-index'},
  {name: 'index',               value: 'default'}
];
// To read on a phone or send in a chat: 4" wide, a page per song, each as long as its song (#146, #39)
def_configs['Phone'] = [
  {name: 'font_face',           value: 'Times-Roman'}, // Text Options
  {name: 'display_chords',      value: 'no'},
  {name: 'start_song_on_new_page', value: 'page'},
  {name: 'hide_booktitle',      value: 'yes'},
  {name: 'songtitle_format',    value: '${num} '},
  {name: 'scripture_location',  value: 'under-title'},
  {name: 'text',                value: 'default' },
  {name: 'columns',             value: '1'},           // Page Options
  {name: 'page_layout',         value: 'single-sided'},
  {name: 'paper_orientation',   value: 'portrait'},
  {name: 'paper_size',          value: 'PHONE'},
  {name: 'margin',              value: 'phone'},
  {name: 'display_index',       value: 'no-index'},    // Index Options
  {name: 'include_first_line',  value: false},
  {name: 'display_cat_index',   value: 'no-index'},
  {name: 'display_scrip_index', value: 'no-index'},
  {name: 'index',               value: 'default'}
];

// "Start each song" was an on/off switch: saved setups have true (a new column) or false (#145)
function exportSettingValue(element, value) {
  if (element.id === 'start_song_on_new_page' && typeof value === 'boolean') return value ? 'on' : 'no';
  return value;
}

export_form.margins = margins;
export_form.text = text;
export_form.def_configs = def_configs;
export_form.index = index;
window.export = export_form;

function set_value_by_id(list) {
  for(const item of list) {
    let element = document.getElementById(item.name);
    if (!element) continue; // a setting this version of the app doesn't have (pasted, or from an older config)
    if(element.type == 'checkbox'){
      element.checked = item.value;
    }
    else{
      element.value = exportSettingValue(element, item.value);
    }
    if(['margin','text','index'].includes(item.name)){
      document.getElementById(item.name).dispatchEvent(new Event('change', { bubbles: true })); //trigger specifics
    }
  }
}
// A new version (UX audit #23): sw.js takes over as soon as it installs, but this page still runs the old code
// until it reloads. Say so once, and let a click reload. Not during a presentation (it would show on the
// projector): it waits until the presentation closes.
function offerUpdateReload() {
  if (offerUpdateReload.shown) return;
  if (document.body.classList.contains('present')) {
    window.addEventListener('hashchange', offerUpdateReload, { once: true });
    return;
  }
  offerUpdateReload.shown = true;
  const toast = notyf.open({
    type: 'info',
    duration: 0, // stays until it's clicked or closed
    dismissible: true,
    background: 'var(--songbookList-color)',
    message: 'A new version of yCanta is ready. <u>Reload</u>',
  });
  toast.on('click', () => {
    if (window.songEditing || window.songbookEditing) {
      notyf.info('Save or cancel your changes first, then reload.', 'var(--songbookList-color)');
      return;
    }
    location.reload();
  });
}
if ('serviceWorker' in navigator) {
  // only an update: the first visit has no worker yet, and getting one isn't news
  if (navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', offerUpdateReload);
  navigator.serviceWorker.register('sw.js', {
    scope: './'
  })
  .then((serviceWorker) => {
    console.log('service worker registration successful');
  })
  .catch((err) => {
    console.error('service worker registration failed');
    console.error(err);
  });
} else {
  console.log('service worker unavailable');
}

function scaleRemove(el, time=250) {
  el.style = "transform: scale(1.2,0); background-color: orangered;";
  setTimeout(function(){ el.remove(); }, time);
}

// A chord line in the editor: every word on it looks like a chord (C, Am7, F#m, Gsus4, D/F#, |), or it's a
// long line that is mostly spaces. A short line of words ("Amen", "Oh", "Lord") stays words.
const CHORD_WORD = /^\(?[A-G](#|b)?(m|maj|min|dim|aug|sus|add|M)?\d*((sus|add|maj|b|#)\d+)*(\/[A-G](#|b)?)?\)?$|^(\||-|\/|N\.?C\.?|x\d+)$/;
function isChord(line) {
  var fraction = 0.45;
  var count = line.count(' ');

  if((line.length == 0) || !(line.match(/[a-z]/i))) {
    return false;
  }
  else if (line.trim().split(/\s+/).every(word => CHORD_WORD.test(word))) { // C  G  Am
    return true;
  }
  else if (line.length > 4 && count/line.length > fraction) { // spread out over the words below
    return true;
  }
  else { // you're not a chord
    return false;
  }
}
function is_chord_line(line) {
  if(line.search('<c>') != -1) {
    return true;
  }
  else {
    return false;
  }
}
function remove_chords(line){
  return line.replace(/<([^>]+?)([^>]*?)>(.*?)<\/\1>/ig, "");
}
function expand_chord(line){
  var CHORD_SPACE_RATIO = 0.45;
  var tmp = document.createElement('line');
  tmp.innerHTML = line;
  
  var old_line = Array.from(tmp.childNodes);
  line = '';
  var chord_line = '';
  old_line.forEach(function(item){
    if(item.nodeName === 'C'){
      chord_line += item.innerText;
    }
    else if(item.nodeName == '#text'){
      line += item.wholeText;
      if(line.length > chord_line.length) {
        chord_line += ' '.repeat(line.length - chord_line.length);
      }
    }
  });
  
  // Add space to the end of the chord line to make the chord recognized as a chord when reimporting.
  var w = chord_line.count(' ');
  var char = chord_line.length - w;

  var w_ad = parseInt(((CHORD_SPACE_RATIO * char)/(1-CHORD_SPACE_RATIO) - w) + 1);
  if (w_ad > 0) {
    chord_line += ' '.repeat(w_ad);
  }

  var expanded_line = chord_line + '\n' + line.trimEnd();
  return expanded_line;
}
function combine(chord, text) {
  //make text at least as long a chord length
  if (text.length < chord.length) {
    text += ' '.repeat(chord.length - text.length);
  }

  //convert chord to dictionary with [start, chord]
  var chords = {};
  var re = /[\S]+/g;
  while ((match = re.exec(chord)) != null) {
    chords[match.index] = chord.substring(match.index,(match.index + match[0].length));
  }

  //combine
  var line = text;
  var chord_keys = Object.keys(chords);
  chord_keys.sort((a, b) => b - a);
  for (let key in chord_keys) {
    line = line.substring(0,chord_keys[key])+'<c>'+chords[chord_keys[key]] + '</c>' + line.substring(chord_keys[key],line.length);
  }
  return line;
}
function parseHash(part) {
  // The first id in the hash that starts with part ('s-' or 'sb-'), or undefined if there is none
  if (part == 's-' || part == 'sb-') {
    return location.hash.match(new RegExp(`(?:^#|&)(${part}.*?)(\\?|&|$)`))?.[1];
  }
}
function sortFavSongbooks(a,b){
  //console.log(a);
  if(a._values['songbook-id'] == 'sb-allSongs'){
    return 2;
  }
  else if(b._values['songbook-id'] == 'sb-allSongs'){
    return -2;
  }
  else if(a._values['songbook-id'] == 'sb-favoriteSongs'){
    return 1;
  }
  else if(b._values['songbook-id'] == 'sb-favoriteSongs'){
    return -1;
  }
  else if(a._values['user-fav'] == b._values['user-fav']){
    if(a._values['songbook-title'] > b._values['songbook-title']) {
      return -1;
    }
    if(a._values['songbook-title'] < b._values['songbook-title']) {
      return 1;
    }
    return 0
  }
  else if(a._values['user-fav'] > b._values['user-fav']) {
    return 1;
  }
  else {
    return -1;
  }
}

function updateAllLinks(whatChanged = 'all') {
  const songbook_id = window.songbook._id || 'sb-allSongs';
  const song_id = window.song._id;
  const formattedSbId = formatSbID(songbook_id);

  // Helper function to update multiple elements
  function updateElements(selector, href) {
    document.querySelectorAll(selector).forEach(el => el.setAttribute('href', href)); // attribute, like jQuery .attr: buttons need it for CSS too
  }

  // Helper function to toggle highlighting. A list's rows that its search or filter hides are taken out of
  // the page (List.js), so they're reached through the lists too; else one hidden while another song was
  // picked comes back still highlighted (#154).
  const listRows = [window.songbooks_list, window.songbook_list, window.songbook_edit_togglesongs_list]
    .flatMap(list => list?.items || []).map(item => item.elm).filter(el => el && !el.isConnected);
  function toggleHighlight(selector, className, condition) {
    [...document.querySelectorAll(selector), ...listRows.filter(el => el.matches(selector))].forEach(el =>
      el.classList.toggle(className, condition(el))
    );
  }

  // Update all links
  updateElements('[data-song-edit]', `#${formattedSbId}&${song_id}?edit`);
  updateElements('[data-song-edit="new"]', `#${formattedSbId}&s-new-song?edit`);
  updateElements('[data-song]', `#${formattedSbId}&${song_id}`);
  updateElements('[data-song-export]', `#${formattedSbId}&${song_id}?export`);
  updateElements('[data-songbook-edit]', `#${songbook_id}?edit`);
  updateElements('[data-songbook-edit="new"]', '#sb-new-songbook?edit');
  updateElements('[data-songbook-present]', `#${songbook_id}?present`);
  updateElements('[data-songbook]', `#${songbook_id}`);
  updateElements('[data-songbook-export]', `#${songbook_id}?export`);
  updateElements('[data-home]', '#');
  // While a song is being edited its title is a text field, not a link
  if (window.songEditing) {
    document.querySelector('#song .title_link')?.removeAttribute('href');
  }

  // Update highlights
  toggleHighlight('.song-highlight', 'song-highlight', () => false);
  toggleHighlight(`[data-song-id='${song_id}']`, 'song-highlight', () => !location.hash.includes('&r-'));
  if (location.hash.includes('&r-')) { // a reading open instead (#157)
    const open = decodeURIComponent(location.hash);
    toggleHighlight(`[data-song-id='reading']`, 'song-highlight', el => decodeURIComponent(el.querySelector('a')?.getAttribute('href') || '') === open);
  }
  toggleHighlight('.songbook-highlight', 'songbook-highlight', () => false);
  toggleHighlight(`[data-songbook-id='${songbook_id}']`, 'songbook-highlight', () => true);
}

function formatSbID(songbook_id) {
  return songbook_id + (window.songbookEditing ? '?edit' : '');
}

document.addEventListener('DOMContentLoaded', function() {
  // float menu activation
  document.body.addEventListener('click', function(e) {
    const toggle = e.target.closest('.float-menu-toggle');
    if (toggle) {
      toggle.querySelector('.float-menu-icon')?.classList.toggle('icon-rotate');
      Array.from(toggle.parentElement.children)
        .filter(el => el !== toggle)
        .forEach(el => el.classList.toggle('uncollapsed'));
    }
  });

  // chord toggling
  document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('toggle-chords')) {
      const shown = !document.getElementById('song').classList.toggle('nochords');
      const chordSwitch = document.getElementById('chordSwitch');
      if (chordSwitch) chordSwitch.checked = shown;
    }
  });

  // The Present button: delegated, because #present is re-created each time a songbook renders. It always
  // presents in the page (#53): a second screen gets a mirrored window from the presentation's help, and
  // "Download" there makes a file that opens anywhere.
  document.getElementById('songList').addEventListener('click', function(e) {
    if (e.target.closest('#present')) window.location = '#' + window.songbook._id + '?present';
  });
});

//initial logging of alerts... probably better not to have it be the console ultimately?
if (typeof console  != "undefined") 
    if (typeof console.log != 'undefined')
        console.olog = console.log;
    else
        console.olog = function() {};

function toggleFullscreen(el) {
  const fullscreen = el.closest(".column");
  const isFull = fullscreen.classList.contains('fullscreen');

  document.querySelectorAll('.fullscreen').forEach(el => el.classList.remove('fullscreen'));
  if (!isFull) {
    fullscreen.classList.add('fullscreen');
    document.querySelector('main').classList.add('fullscreen');
  }
}
function highlightText(){
  let text = document.querySelector('#songList .search').value
  text = (text.indexOf(`"`)<0 ? `"${text}"` : text).match(/(?:"[^"]*"|\S+)/g).map(word => word.replace(/^"|"$/g, '').replace(/^.*?:/g,''));
  if(!document.getElementById('song').classList.contains('edit')){
    instance.unmark().mark(text, {
      "exclude": [
          "c"
      ],
      "ignorePunctuation": ":;.,-–—‒_(){}[]!'\"+=".split(""),
      "acrossElements": true,
      "separateWordSearch": false
    });
    markSongFilter();
  }
}
// The songbook's filter marks what it picked on the open song, as the search marks its words (#155): the
// key, the categories, and the scripture or CCLI line for "Has". Only those fields, so a key "G" doesn't
// mark every G in the words. The search's unmark() clears these too: it removes the <mark data-markjs>s
// that mark.js makes.
function markSongFilter() {
  const f = songFilters.book;
  const song = document.querySelector('#song song');
  if (!f || !song) return;
  const mark = el => { if (!el.querySelector('mark')) el.innerHTML = `<mark data-markjs="true">${el.innerHTML}</mark>`; };
  const picked = (sel, set) => song.querySelectorAll(sel).forEach(el => set.has(el.textContent.trim()) && mark(el));
  picked('key, #keyToggle .key-name', f.key);
  picked('cat', f.cat);
  if (f.has.has('scripture')) song.querySelectorAll('scrip_ref').forEach(el => el.textContent.trim() && mark(el));
  if (f.has.has('ccli')) song.querySelectorAll('cclis').forEach(el => el.textContent.trim() && mark(el));
}
// The keyboard in the searchable lists (#66): ↓ from the search box goes to the first result, ↑ and ↓ move
// through the results (Home and End to the ends), and ↑ from the first result or Esc goes back to the
// search box. Enter does what a click does: a link does that by itself; a category's checkbox is ticked.
// A songbook's section headings are skipped (nothing to open), but "New Section" in "Add songs" is not.
const KEYBOARD_LISTS = '#songbooks_container, #songbook_content, #songbook_edit_togglesongs, #categories';
document.addEventListener('keydown', e => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Enter'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
  const box = e.target.closest?.(KEYBOARD_LISTS);
  if (!box || e.target.isContentEditable) return;
  const search = box.querySelector('.search');
  const stops = [...box.querySelectorAll('.list > li')]
    .filter(li => li.offsetParent !== null && !(box.id === 'songbook_content' && li.dataset.songId === 'section')) // a reading opens its verses
    .map(li => li.querySelector('a, input'))
    .filter(Boolean);
  const onSearch = e.target === search;
  const at = stops.indexOf(e.target);
  if (!onSearch && at < 0) return;
  if (e.key === 'Enter') {
    if (e.target.type === 'checkbox') {
      e.preventDefault();
      e.target.click();
    }
    return; // a link opens by itself
  }
  let next = null;
  if (e.key === 'ArrowDown') next = onSearch ? stops[0] : stops[at + 1];
  else if (onSearch) return; // ↑, Home, End and Esc keep their usual job in the search box
  else if (e.key === 'ArrowUp') next = at > 0 ? stops[at - 1] : search;
  else if (e.key === 'Home') next = stops[0];
  else if (e.key === 'End') next = stops.at(-1);
  else if (e.key === 'Escape') next = search;
  if (!next || next.disabled) return;
  e.preventDefault(); // and the page doesn't scroll
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
});

function bindSearchToList(list, id) {
  const updateCountDisplay = (list, targetId) => {
    const countElement = document.querySelector(`${targetId} .search + span`);
    if (!countElement) return;

    if (list === window.songbook_list) {
      const songs = list.visibleItems.filter(item => !isBookExtra(item.values()['song-id'])); // not its sections and readings
      const songPlacement = songs.findIndex(
        el => el._values['song-id'] === window.song?._id // no song open after a cancelled edit
      ) + 1;
      const visibleCount = songs.length;
      countElement.dataset.numberVisible = `${songPlacement ? `${songPlacement}/` : ''}${visibleCount}`;
    } else {
      countElement.dataset.numberVisible = songCount(list);
    }
  };
  // "New Section" and "New Reading" in "Add songs" aren't songs
  const songCount = list => list.visibleItems.filter(item => !isBookExtra(item.values()['song-id'])).length;

  const handleSearchComplete = () => {
    updateCountDisplay(list, id);
    highlightText();
  };

  // Initial count setup
  if (list === window.songbook_list) {
    const initialPlacement = list.visibleItems.findIndex(
      el => el._values['song-id'] === window.song?._id
    ) + 1;
    const totalCount = document.querySelectorAll(`${id} .list li`).length;
    const countElement = document.querySelector(`${id} .search + span`);
    if (countElement) {
      countElement.dataset.numberVisible = `${initialPlacement ? `${initialPlacement}/` : ''}${totalCount}`;
    }
  } else {
    const countElement = document.querySelector(`${id} .search + span`);
    if (countElement) {
      countElement.dataset.numberVisible = songCount(list);
    }
  }

  // Bind search complete event (and filter, for the Category menu in "Add songs")
  list.on('searchComplete', handleSearchComplete);
  list.on('filterComplete', handleSearchComplete);
}

function bindToSongEdit() {
  const song = document.getElementById('song');
  if (!song) return;

  // Handle category checkbox changes
  song.querySelector('#categories')?.addEventListener('change', e => {
    if (e.target.type === 'checkbox') {
      const cats = document.querySelector('categories');
      if (!cats) return;
      
      const currentCats = cats.textContent.trim().split(/\s*,\s*/).filter(Boolean);
      const catName = e.target.nextElementSibling?.textContent.trim();
      
      if (catName) {
        const updatedCats = e.target.checked
          ? [...currentCats, catName].sort()
          : currentCats.filter(c => c !== catName);
        cats.textContent = updatedCats.join(', ');
      }
    }
  });

  // A part's type menu: the type goes on its part (the chunk in the same .wrap), which saveSong reads. It
  // used to go on the menu's next sibling, which has been the drag grip since v11, so a changed type was
  // lost on save and the grip showed the label ("Chorus:").
  song.addEventListener('change', e => {
    if (e.target.matches('.wrap > select[name="types"]')) {
      e.target.closest('.wrap').querySelector('chunk')?.setAttribute('type', e.target.value);
    }
  });
}

function checkLogin() {
  const dbSelect = document.getElementById('db_select');
  const pinInput = document.getElementById('pin');
  const pwdInput = document.getElementById('pwd');
  const usernameInput = document.getElementById('username');

  const dbName = dbSelect.options[dbSelect.selectedIndex].value;
  const pin = pinInput.value.trim();
  const pwd = pwdInput.value.trim();
  const username = usernameInput.value.trim();

  let isValid = true;

  if (dbName.endsWith('(local)') && (pin === '' || username === '')) {
    isValid = false;
    showError('Type your username and PIN.');
  } else if (dbName.endsWith('(remote)') && (pwd === '' || username === '')) {
    isValid = false;
    showError('Type your username and password.');
  }

  return isValid;
}

function checkCreateNew() {
  const dbNameInput = document.getElementById('newDbName');
  const pinInput = document.getElementById('pin');
  const pin2Input = document.getElementById('pin2');
  const usernameInput = document.getElementById('username');

  // Get and validate inputs
  const dbName = dbNameInput.value.trim();
  const pin = pinInput.value.trim();
  const pin2 = pin2Input.value.trim();
  const username = usernameInput.value.trim();

  // Check for invalid database name
  if (!dbName) {
    showError('Give your songs a name.');
    return false;
  }
  if (dbName.includes('(local)')) {
    showError(`The name can't have "(local)" in it.`);
    return false;
  }

  // Validate required fields
  if (!username || !pin) {
    showError('Type a username and a PIN.');
    return false;
  }

  // Check pin confirmation
  if (pin !== pin2) {
    showError(`The two PINs don't match.`);
    return false;
  }

  // Check if database already exists
  const databases = JSON.parse(localStorage.getItem('databases') || '{}');
  const fullDbName = `${dbName}(local)`;
  
  if (databases[fullDbName]) {
    showError('You already have songs by that name on this device. Pick another name.');
    return false;
  }

  // If all validations pass, proceed with login
  dbLogin('create_local');
  return true;
}

function parseUrl(url, username=false, pwd=false){
  //browser parts of an a element ['href','protocol','host','hostname','port','pathname','search','hash']
  let a = document.createElement('a');
  a.href = url;

  if(username){ //we want to add username/pwd
    if(a['host']!=''){
      url = `${a['protocol']}//${encodeURIComponent(username)}:${encodeURIComponent(pwd)}@${a['host']}${a['pathname']}`;
    } else { //no protocol included
      url = `http://${encodeURIComponent(username)}:${encodeURIComponent(pwd)}@${url}`;
    }
  }
  else {  //we want to strip out the username/pwd
    if(a['host']!=''){
      url = `${a['protocol']}//${a['host']}${a['pathname']}`;
    } else { //no protocol included
      url = `http://${url}`;
    }
  }
  return url;
}

function addDBtoLocalStorage(dbName, type, remote_url=false){
  //UPDATE LOCAL STORAGE DATABASES
  let new_db = {};
  new_db.name = dbName;
  new_db.type = type;
  if(remote_url){
    new_db.url = parseUrl(remote_url);
  }
  let databases = JSON.parse(localStorage.getItem('databases'));
  if(!databases){databases = {};}
  databases[dbName] = new_db;
  localStorage.setItem('databases',JSON.stringify(databases));
}
function removeDbfromLocalStorage(dbName){
  let databases = JSON.parse(localStorage.getItem('databases'));
  delete databases[dbName];
  localStorage.setItem('databases',JSON.stringify(databases)); 
}

async function updateUser() {
  // the name from the record's id when the record has none (an old or odd record, or a moment during a
  // second sign-in on the same page, which the app test hit)
  const name = String(window.user?.name ?? window.user?._id?.slice(2) ?? '').trim();
  if (!name) return;
  const usernameContainer = document.getElementById('username_d');
  const userContent = document.getElementById('user_content');

  // Update username display
  let html = '';
  for (const word of name.split(/\W+/).filter(Boolean)) {
    html += `${word[0]}<span class="closing">${word.substring(1)} </span>`;
  }
  usernameContainer.innerHTML = html;

  // Build user profile content
  let profileHtml = `<h3>${escapeHtml(name)}</h3>`;

  // Favorite Songbooks
  const favSongbooks = (Array.isArray(window.user.fav_sbs) ? window.user.fav_sbs : []).filter(sb => typeof sb === 'string' && sb.length !== 0);
  profileHtml += '<h4>Favorite Songbooks</h4><ul>';
  
  if (favSongbooks.length) {
    try {
      const result = await db.allDocs({
        include_docs: true,
        keys: favSongbooks
      });
      
      profileHtml += result.rows
        .sort((a, b) => String(a.doc?.title ?? '').localeCompare(String(b.doc?.title ?? '')))
        .filter(sb => sb.doc)
        .map(sb => `<li><a class="link" href="#${escapeHtml(sb.doc._id)}">${escapeHtml(sb.doc.title)}</a></li>`)
        .join('');
    } catch (err) {
      console.error('Error loading favorite songbooks:', err);
    }
  } else {
    profileHtml += '<li>None yet!</li>';
  }
  profileHtml += '</ul>';

  // Favorite Songs
  const favSongs = (Array.isArray(window.user.fav_songs) ? window.user.fav_songs : []).filter(song => typeof song === 'string' && song.length !== 0);
  profileHtml += '<h4>Favorite Songs</h4><ul>';
  
  if (favSongs.length) {
    try {
      const result = await db.allDocs({
        include_docs: true,
        keys: favSongs
      });
      
      // A deleted favorite shows its old title when that can be found (#69)
      const favorites = await Promise.all(result.rows.map(async row => ({
        id: row.key,
        title: row.doc ? row.doc.title : (row.value?.deleted && await deletedTitle(row.key, row.value.rev)),
        deleted: !row.doc
      })));
      profileHtml += favorites
        .sort((a, b) => String(a.title ?? '').localeCompare(String(b.title ?? '')))
        .map(fav => {
          const label = fav.deleted ? `<s>${fav.title || 'deleted song'}</s> (deleted)` : fav.title;
          return `<li><a class="link" href="#sb-favoriteSongs&${fav.id}">${label}</a></li>`;
        }).join('');
    } catch (err) {
      console.error('Error loading favorite songs:', err);
    }
  } else {
    profileHtml += '<li>None yet!</li>';
  }
  profileHtml += '</ul>';

  // Permissions
  const access = window.church || {};
  const permissions = [
    access.serverAdmin ? 'Server admin' : access.admin ? 'Church admin' : access.editor ? 'Editor' : 'User',
    access.editor ? 'can change any song or songbook' : 'can change the songs and songbooks you add',
  ].join(': ');
  
  profileHtml += `<h4>Permissions</h4><ul class="fit-text">${permissions}</ul>`;
  if (remoteDb) profileHtml += '<h4>Recovery email</h4><div id="recovery_email">…</div>';

  // Buttons
  profileHtml += `
    <button onclick="editProfileName()" class="btn">
      <span class="mirror">&#9998;</span> Name
    </button>
    <button onclick="change${document.documentElement.classList.contains('_admin') ? 'Admin' : 'User'}Password(window.user._id.replace('u-', ''))" class="btn">
      ↻ Password
    </button>`;

  userContent.innerHTML = profileHtml;
  if (remoteDb) loadRecoveryEmail();
}

async function loadCategories() {
  const categoryContent = document.getElementById('category_content');
  
  try {
    // Get categories from database
    const result = await db.get('categories');
    
    // Build HTML content
    let html = `<h3>Ordered List <button type="button" class="btn btn-small editor-only" onclick="editCategories()"><span class="mirror">&#9998;</span> Edit</button></h3><ul>`;

    // Each category as a list item. A "-----" divider starts a group: "----- Seasons" shows Seasons as a
    // heading, a plain "-----" a line (#84). A category listed twice shows once.
    const seen = new Set();
    result.categories.forEach(raw => {
      const cat = String(raw).trim();
      const divider = cat.match(/^-{3,}\s*(.*)$/);
      if (divider) {
        html += divider[1].trim()
          ? `</ul><h4 class="category-group">${escapeHtml(divider[1].trim())}</h4><ul>`
          : '</ul><hr class="category-divider"><ul>';
      } else if (cat && !seen.has(cat)) {
        seen.add(cat);
        html += `
        <li><a href="#sb-allSongs" onclick="searchSBfor(this.textContent)">${escapeHtml(cat)}</a></li>`;
      }
    });

    html += '</ul>';
    html = html.replace(/<ul><\/ul>/g, ''); // a list that starts with a divider
    
    // Update DOM
    categoryContent.innerHTML = html;
    
  } catch (err) {
    console.error('Error loading categories:', err);
    categoryContent.innerHTML = '<p>Error loading categories</p>';
  }
}

// ---- Plain forms for the profile and the categories (UX audit #21). They used to open a raw record editor
// that showed field names like fav_sbs and analyticsNoticed.

// Your name, as others see it ("updated by", "Added by"). Signing in still uses the account name.
async function editProfileName() {
  const account = window.user._id.replace(/^u-/, '');
  const dialog = new TaskDialog('Your name');
  const done = await dialog.run({
    text: `How others see your name, like on songs you add or change. You still sign in as ${account}.`,
    fields: [{ name: 'name', label: 'Name', value: window.user.name || account, maxlength: 60, autocomplete: 'name' }],
    submit: 'Save',
    working: 'Saving…',
    action: async ({ name }) => {
      if (!name) throw new Error('Please type a name.');
      await saveUserSettings({ name });
    },
  });
  if (done === null) return;
  dialog.close();
  updateUser();
}

// The category list, edited in place: drag to reorder, type to rename, × to remove, and group headings
// ("----- Seasons" in the list). A renamed category can be renamed on the songs that have it too.
async function editCategories() {
  const box = document.getElementById('category_content');
  let doc;
  try {
    doc = await db.get('categories');
  } catch (err) {
    reportDbError(err, 'load the categories');
    return;
  }
  const row = (kind, text, original = '') => `<li class="cat-row${kind === 'heading' ? ' cat-heading' : ''}" data-kind="${kind}" data-original="${escapeHtml(original)}">
      <span class="cat-grip" aria-hidden="true" title="Drag to move">⠿</span>
      <input type="text" value="${escapeHtml(text)}" aria-label="${kind === 'heading' ? 'Group heading' : 'Category name'}" placeholder="${kind === 'heading' ? 'A line, or a group name' : 'Category name'}">
      <button type="button" class="cat-remove" aria-label="Remove" title="Remove">×</button>
    </li>`;
  const rows = (doc.categories || []).map(raw => {
    const cat = String(raw).trim();
    const divider = cat.match(/^-{3,}\s*(.*)$/);
    return divider ? row('heading', divider[1].trim()) : cat ? row('cat', cat, cat) : '';
  }).join('');
  box.innerHTML = `<div class="cat-edit">
      <p class="cat-edit-help">Drag ⠿ to move. A group heading starts a new group. Removing a category here doesn't take it off songs that have it.</p>
      <ul class="cat-list">${rows}</ul>
      <div class="cat-edit-buttons">
        <button type="button" class="btn btn-small" data-add="cat">+ Category</button>
        <button type="button" class="btn btn-small" data-add="heading">+ Group heading</button>
      </div>
      <div class="cat-edit-buttons">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="button" class="btn primary" data-save>Save</button>
      </div>
    </div>`;
  const list = box.querySelector('.cat-list');
  Sortable.create(list, { handle: '.cat-grip', animation: 150 });
  box.querySelector('.cat-edit').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('cat-remove')) button.closest('.cat-row').remove();
    else if (button.dataset.add) {
      // a new category goes at the end; a new heading too, ready for categories under it
      list.insertAdjacentHTML('beforeend', row(button.dataset.add, ''));
      list.lastElementChild.querySelector('input').focus();
    }
    else if (button.hasAttribute('data-cancel')) loadCategories();
    else if (button.hasAttribute('data-save')) saveCategoryEdits(box, doc);
  });
}

async function saveCategoryEdits(box, doc) {
  const categories = [], renames = new Map(), seen = new Set();
  box.querySelectorAll('.cat-row').forEach(li => {
    const text = li.querySelector('input').value.trim().replace(/\s+/g, ' ');
    if (li.dataset.kind === 'heading') {
      categories.push(text ? `----- ${text}` : '-----');
    } else if (text && !seen.has(text)) {
      seen.add(text);
      categories.push(text);
      if (li.dataset.original && li.dataset.original !== text) renames.set(li.dataset.original, text);
    }
  });
  try {
    await db.put({ ...doc, categories });
  } catch (err) {
    reportDbError(err, 'save the categories');
    return;
  }
  window.songCategories = categories;
  notyf.info('Categories saved', 'var(--edit-color)');
  loadCategories();
  if (renames.size) await renameCategoryOnSongs(renames);
}

// After a rename in the list: the songs that have the old name, renamed too (if the person says so)
async function renameCategoryOnSongs(renames) {
  let songs;
  try {
    songs = (await db.allDocs({ startkey: 's-', endkey: 's-￿', include_docs: true })).rows
      .map(r => r.doc).filter(song => Array.isArray(song?.categories) && song.categories.some(c => renames.has(c)));
  } catch (err) {
    reportDbError(err, 'find the songs with that category');
    return;
  }
  if (!songs.length) return;
  const names = [...renames].map(([from, to]) => `"${from}" → "${to}"`).join(', ');
  const changed = new Set();
  const dialog = new TaskDialog('Rename on songs too?');
  const done = await dialog.run({
    text: `You renamed ${names}. ${songs.length} song${songs.length === 1 ? ' has' : 's have'} the old name. Change ${songs.length === 1 ? 'it' : 'them'} too?`,
    submit: `Change ${songs.length} song${songs.length === 1 ? '' : 's'}`,
    cancel: 'Only the list',
    working: 'Changing the songs…',
    action: async () => {
      let failed = 0;
      for (const song of songs) {
        if (changed.has(song._id)) continue; // a retry does only the ones that failed
        song.categories = [...new Set(song.categories.map(c => renames.get(c) ?? c))];
        // the song's search text has its categories too ("c:A c:B"), so c: searches find the new name
        if (typeof song.search === 'string') {
          song.search = song.search.replace(/(^|\0)c:[^\0]*\0/, `$1c:${song.categories.length ? song.categories.join(' c:') : '!c'}\0`)
            .replace(/editedBy:[^\0]*\0/, `editedBy:${window.user._id.replace(/^u-/, '')}\0`);
        }
        song.edited = Date.now();
        song.editedBy = window.user._id;
        try {
          song._rev = (await saveWithHistory(song)).rev;
          changed.add(song._id);
        } catch (err) {
          failed++;
          console.error('Could not rename the category on', song._id, err);
        }
      }
      if (failed) throw new Error(`${failed} song${failed === 1 ? '' : 's'} couldn't be changed. Try again to finish them.`);
    },
  });
  if (done !== null) dialog.close();
}

// Mirrors database/validate.js: editors and church admins change anything; everyone else what they added
function canEdit(doc) {
  if (!doc || doc._id == 'sb-allSongs' || doc._id == 'sb-favoriteSongs') return false; // not real docs
  if (window.church?.editor) return true;
  return !!doc.addedBy && !!window.user?._id && doc.addedBy.trim() === window.user._id.trim();
}

function searchSBfor(text) {
  const searchInput = document.querySelector('#songbook_header .search');
  if (searchInput) {
    searchInput.value = `"c:${text}"`;
    searchInput.dispatchEvent(new KeyboardEvent('keyup'));
  }
}

// ---- The install notice (#126). On a phone or tablet in a browser (not the installed app), the name
// button gets a dot and its menu an "Install yCanta" button with the steps for this device. Desktops and
// laptops never see it. The dot goes once the steps have been opened; the button once the app is installed
// (Android says so) or after "Don't show this again".
const installNotice = { prompt: null }; // the browser's own install prompt, when it offers one (Android)
const installKey = name => `install-${name}`;
function installFlag(name, value) {
  try {
    if (value === undefined) return localStorage.getItem(installKey(name)) === '1';
    localStorage.setItem(installKey(name), '1');
  } catch (err) {
    return false; // no storage (private browsing): the notice just doesn't remember
  }
}
// iPads say they're Macs, but Macs have no touch screen
const onIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const onPhoneOrTablet = () => onIos() || /Android/i.test(navigator.userAgent);
const runningInstalled = () => ['standalone', 'fullscreen', 'minimal-ui'].some(mode => matchMedia(`(display-mode: ${mode})`).matches) || navigator.standalone === true;

function updateInstallNotice() {
  const offer = onPhoneOrTablet() && !runningInstalled() && !installFlag('hidden') && !installFlag('done');
  document.documentElement.classList.toggle('install-offer', offer);
  document.documentElement.classList.toggle('install-dot', offer && !installFlag('seen'));
}
window.addEventListener('beforeinstallprompt', event => {
  if (!onPhoneOrTablet()) return; // desktops keep the browser's own install icon
  event.preventDefault(); // our button offers it instead of the browser's banner
  installNotice.prompt = event;
});
window.addEventListener('appinstalled', () => {
  installFlag('done', true);
  installNotice.prompt = null;
  updateInstallNotice();
});
updateInstallNotice();

async function showInstallSteps() {
  installFlag('seen', true);
  updateInstallNotice();
  const why = "Installed, yCanta opens from your home screen like any other app, full screen, and works better without a connection.";
  const prompt = installNotice.prompt;
  let steps;
  if (prompt) steps = 'Tap Install, then confirm.';
  else if (onIos()) steps = 'Tap the Share button (a square with an arrow pointing up). In Safari on an iPhone it\'s at the bottom; on an iPad, and in Chrome, it\'s at the top.\n\nThen tap "Add to Home Screen" (scroll down if you don\'t see it), then "Add".';
  else steps = 'Open your browser\'s menu (⋮, at the top right), then tap "Install app" or "Add to Home screen".';
  const dialog = new TaskDialog('Install yCanta');
  const pending = dialog.run({
    text: `${why}\n\n${steps}`,
    html: '<p><button type="button" class="install-hide">Don\'t show this again</button></p>',
    submit: prompt ? 'Install' : 'OK',
    cancel: prompt ? 'Not now' : '',
    action: async () => {
      if (!prompt) return 'closed';
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      installNotice.prompt = null; // the browser offers each prompt once
      return outcome;
    },
  });
  dialog.body.querySelector('.install-hide').addEventListener('click', () => {
    installFlag('hidden', true);
    updateInstallNotice();
    dialog.close();
  });
  const result = await pending;
  if (result === 'accepted') await dialog.finish('Installing. Look for yCanta on your home screen.');
  else dialog.close();
}

function handleDarkMode(){
  let value = document.querySelector('input[name="darkmode"]:checked').value;
  switch(value) {
    case 'dark':
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      break;
    case 'light':
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      break;
    case 'auto':
      document.getElementById('autoRadio').checked = true;
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.remove('light');
  }
  //save value to system/user prefs.  
  localStorage.setItem(window.user._id+'darkMode',value);
}
function goToSettings(){
  document.getElementById('appSettings').classList.remove('closed');
  setTimeout(function() {scrollIntoViewIfNeed(document.getElementById('appSettings'))},300);
}
// route: false shows the logged-in state but doesn't open the linked page or load the lists yet, for
// while the first download runs. takeNextStep calls it again with route: true once that's done.
function setLoginState({ route = true } = {}) {
  window.loggedin = true;
  
  // Update user interface
  updateUser();
  
  // Add logged-in class to HTML element
  document.documentElement.classList.add('loggedin');
  
  // Update title display
  const titleLink = document.getElementById('title').querySelector('a');
  if (titleLink) {
    const dbNameParts = (window.dbChoice || window.db.name).split('('); // the church, not this person's copy (#139)
    const dbName = capEachWord(dbNameParts[0], "_");
    // Plain words, not LOCAL / REMOTE (UX audit #24): a church's songs need no tag; songs kept only here get one
    const onlyHere = dbNameParts[1]?.startsWith('local') ? 'on this device only' : '';

    titleLink.innerHTML = `${dbName}<sup style="font-size: .8rem; font-weight: normal; color: var(--songList-color);"> ${onlyHere}</sup>`;
  }
  
  if (!route) return;

  // Handle login hash
  if (location.hash.startsWith('#login?')) {
    location.hash = location.hash.split('?').slice(1).join('?');
  } else if (location.hash.startsWith('#login')) {
    location.hash = '#';
  }
  
  // Remove loading state
  setTimeout(() => {
    document.body.classList.remove('loading');
  }, 20);
  
  updateInstallNotice(); // logging out cleared its classes (#126)

  // Load additional data
  loadRecentSongs();
  initializeSongbooksList();
  loadUsersObject();
}

function setLogoutState() {
  window.loggedin = false;
  
  // Reset document classes
  document.documentElement.className = '';
  
  // Update location hash
  location.hash = '#login';
  
  // Clear user and roles
  window.user = '';
  window.roles = '';
  window.church = null;
  sessionPwd = null;
  
  // Remove loggedin state from localStorage
  localStorage.removeItem('loggedin');
  
  // Update title display
  const titleLink = document.getElementById('title').querySelector('a');
  if (titleLink) {
    titleLink.textContent = 'yCanta';
  }
  
  // Hide dialog
  const dialog = document.getElementById('dialog');
  if (dialog) {
    dialog.style.display = 'none';
  }
  if (document.getElementById('playerDock')?.hidden === false) closePlayer();

  // Clear all users display
  const allUsers = document.getElementById('all_users');
  if (allUsers) {
    allUsers.innerHTML = '';
  }
  
  // Close admin settings
  const adminSettings = document.getElementById('adminSettings');
  if (adminSettings) {
    adminSettings.classList.add('closed');
  }
}

// A user field ("u-name") as the name, '' when it's missing or odd (a bad record mustn't break a list)
const userName = by => (typeof by === 'string' ? by.slice(2) : '');

// Build list rows one record at a time, leaving out (and noting in the console) any record that can't be
// shown, so one bad record doesn't stop a whole list from loading
function rowsFrom(records, toRow) {
  const rows = [];
  for (const record of records) {
    try {
      rows.push(toRow(record));
    } catch (err) {
      console.warn('Left a record out of the list (it has missing or odd fields):', record?.id || record?.doc?._id, err);
    }
  }
  return rows;
}

function mapSongbookRowToValue(row) {
  return { 'songbook-id':           row.doc._id,
    'songbook-rev':                 row.doc._rev,
    'songbook-title':        't:' + stripAccents(row.doc.title) + '\0'
  + 'addedBy:' + stripAccents(userName(row.doc.addedBy)) + '\0'
  + 'editedBy:' + stripAccents(userName(row.doc.editedBy)) + '\0',
    'link': '#'+row.doc._id,
    'name': escapeHtml(row.doc.title ?? '(no title)') // List.js shows it as page code: make it text
  };
}
// A songbook row that isn't a song: a section heading, or a Bible reading (#157)
function isBookExtra(id) {
  return id === 'section' || id === 'reading';
}
function mapSongRowToValue(row) {
  let id, rev, search, status, title, deleted;
  deleted = false;
  if(row.status === undefined){  status = "";}
  else {status = row.status;}
  try { 
    if(row.deleted || row.value.deleted){ deleted = true;}
  }
  catch {}

  if(row.id=="section"){
    id = row.id;
    search = row.title;
    title = row.title;
  }
  else if(row.id=="reading"){ // a Bible reading (#157): its reference, or "New Reading" in "Add songs"
    id = row.id;
    title = row.ref ?? row.title ?? '';
    search = row.search ?? title;
  }
  else if(deleted){
    deleted = true;
    id = row.id;
    try {
      rev = row.value.rev;
    }
    catch {
      rev = row.doc._id;
    } 
    search = "";
    status = status;
    title = row.deletedTitle ? `${row.deletedTitle} (deleted)` : "Deleted";
  }
  else {
    id = row.doc._id;
    rev = row.doc._rev;
    title = row.doc.title ?? '(no title)';
    search = typeof row.doc.search === 'string' ? row.doc.search : 't:' + title; // a record without one still turns up by title
    status = status;
  }
  return { 'song-id':           id,
    'song-rev':                 rev,
    'song-search':              stripAccents(search),
    'song-status':              status,
    'song-deleted':             deleted,
    'link': id === 'reading' ? readingLink(title) : '#'+window.songbook._id+'&'+id, // a reading opens its verses (#157)
    'name': escapeHtml(title), // List.js shows it as page code: make it text (a section's title too)
    'facts': (deleted || isBookExtra(row.id)) ? null : songFacts(row.doc), // for the song filter (#84)
  };
}

function setSongbookInfo(songbook) {
  const titleEl = document.getElementById('songbook_title');
  const contentEl = document.getElementById('songbook_content');
  
  // Reset elements
  titleEl.removeAttribute('contenteditable');
  document.getElementById('sb_buttonsRight')?.remove();
  const searchInput = contentEl.querySelector('.search');
  searchInput.disabled = false; // editSongbook disables the input itself
  searchInput.parentElement.removeAttribute('disabled');
  contentEl.querySelector('.edit-search-note')?.remove(); // the editor's note on why search was gone
  contentEl.classList.remove('showStatus', 'showComments');
  contentEl.classList.toggle('all-songs', songbook._id === 'sb-allSongs'); // an empty All Songs offers Import (UX audit #18)
  
  // Set status/comment visibility
  if (songbook.showStatus) contentEl.classList.add('showStatus');
  if (songbook.showComments) contentEl.classList.add('showComments');

  //remove disabled-hidden
  document.querySelectorAll('.disabled-hidden').forEach(el => el.classList.remove('disabled-hidden'));
  
  // Update title
  const isSpecial = ['sb-allSongs', 'sb-favoriteSongs'].includes(songbook._id);
  titleEl.innerHTML = isSpecial ? `<i>${escapeHtml(songbook.title)}</i>` : escapeHtml(songbook.title); // text, not page code
  titleEl.dataset.rev = songbook._rev;
  titleEl.dataset.songbookId = songbook._id;
  
  // Add buttons if not special songbook
  if (!isSpecial) {
    titleEl.closest('.title').insertAdjacentHTML('beforeend', 
      `<span class="buttonsRight" id="sb_buttonsRight">
        <span class="star" role="button" tabindex="0" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" aria-label="Favorite songbook" title="Favorite" onclick="event.stopPropagation(); toggleFavorite('${songbook._id}','fav_sbs')"></span>
        <info role="button" tabindex="0" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" aria-label="Songbook info" title="Info" onclick="event.stopPropagation(); loadInfo(false);"></info>
      </span>`);
  }

  // Update float menu
  const editable = canEdit(songbook);
  // Rebuilt only when it would change: All Songs reloads on every synced change, and a menu replaced
  // under a finger (or a click) loses that tap, as "Add Song" did in the app test
  const floatMenu = document.querySelector('#songList .float-menu');
  const menuKey = `${songbook._id}|${editable}`;
  if (floatMenu.dataset.builtFor !== menuKey) {
    floatMenu.dataset.builtFor = menuKey;
    floatMenu.innerHTML = `
      ${songbook._id === 'sb-allSongs' ? '<a data-song-edit="new" class="float-menu-item"><span class="float-menu-icon">+</span>Add Song</a>' : ''}
      ${editable ? `<button data-home onclick="deleteSongbook('${songbook._id}')" class="float-menu-item delete"><span class="float-menu-icon">&#128465;</span>Delete</button>` : ''}
      <button data-songbook-present class="float-menu-item" id="present"><span class="float-menu-icon">&#128253;</span>Present</button>
      <a data-songbook-export class="float-menu-item"><span class="float-menu-icon">&#128424;</span>Export</a>
      ${editable ? '<a data-songbook-edit class="float-menu-item"><span class="float-menu-icon">&#9998;</span>Edit</a>' : ''}
      <span class="float-menu-item float-menu-toggle"><button type="button" class="float-menu-icon" aria-label="Actions" title="Actions: present, export, edit">+</button></span>`;
  }

  // Handle info dialog
  const dialog = document.getElementById('dialog');
  if (dialog.style.display === "block" && !parseHash('s-') && dialog.dataset.use === "info") {
    loadInfo(false);
  }
  // The float menu was just rebuilt without hrefs (a sync reload doesn't go through the router)
  if (window.songbook && window.song) updateAllLinks();
}

function buildSongbookList(songs, target_class='songbook_content', 
                          template='song-item-template', edit=false) {
  const options = {    
    valueNames: [
      { data: ['song-id'] },
      { data: ['song-rev'] },
      { data: ['song-search'] },
      { data: ['song-status'] },
      { data: ['song-deleted'] },
      { name: 'link', attr: 'href'},
      'name'
    ],
    item: template
  };

  const values = rowsFrom(songs, mapSongRowToValue);

  // The church's categories, for the song filter's Category choices
  db.get('categories').then(categories => {
    window.songCategories = categories.categories || [];
    renderSongFilter(edit ? 'adder' : 'book');
  }).catch(err => reportDbError(err, 'load the category filter'));

  // Make the list once, then empty and refill it. Each new List on the same box added another set of
  // search listeners to it, which never went away: every keystroke ran one more search for each songbook
  // opened since the page loaded. (Clearing right before refilling also keeps reloads that overlap, from
  // several sync changes at once, from listing every song several times.)
  if (!edit) {
    if (window.songbook_list) {
      window.songbook_list.clear();
      window.songbook_list.add(values);
    } else {
      window.songbook_list = new List(target_class, options, values);
      bindSearchToList(window.songbook_list, '#songbook_content');
      window.songbook_list.on('searchComplete', () => renderSongFilter('book'));
    }
    applySongFilter('book');
    const searchInput = document.querySelector('#songbook_content .search');
    searchInput.dispatchEvent(new KeyboardEvent('keyup')); // the search box's words, on the new songs
  } else {
    if (window.songbook_edit_togglesongs_list) {
      window.songbook_edit_togglesongs_list.clear();
      window.songbook_edit_togglesongs_list.add(values);
    } else {
      window.songbook_edit_togglesongs_list = new List(target_class, options, values);
      // Keep "New Section" in the add-song list during a search (issue #82). List.js runs handlers last-added
      // first, so adding this before bindSearchToList leaves the section out of the count.
      window.songbook_edit_togglesongs_list.on('searchComplete', list => {
        const extras = ['section', 'reading'].map(id => list.get('song-id', id)[0]).filter(item => item && !item.found);
        if (extras.length) {
          extras.forEach(item => { item.found = true; });
          list.update();
        }
      });
      bindSearchToList(window.songbook_edit_togglesongs_list, '#songListEdit');
      window.songbook_edit_togglesongs_list.on('searchComplete', () => renderSongFilter('adder'));
    }
    clearSongFilter('adder'); // a new editor starts with everything shown
    document.querySelector('#songbook_edit_togglesongs .search')?.dispatchEvent(new KeyboardEvent('keyup'));
  }
  // A list rebuilt by a sync change has no hrefs or current-song highlight yet
  if (window.songbook && window.song) updateAllLinks();
}

// ---- The song filter (#84): a Filter button beside a song list's search box, its panel, and chips
// for what's on. Two lists have one: 'book' (the open songbook's songs) and 'adder' ("Add songs" in the
// songbook editor). Each keeps its own choices for the visit. Filters work together with the search box.
const SONG_FILTER_HAS = [
  ['chords', 'Chords', facts => facts.chords],
  ['video', 'A video', facts => facts.yt > 0],
  ['ccli', 'CCLI number', facts => facts.ccli],
  ['scripture', 'Scripture', facts => facts.scripture],
];
const SONG_FILTER_SORTS = [['title', 'Title'], ['added', 'Recently added'], ['edited', 'Recently edited']];
const NO_CATEGORY = '!c';
const songFilters = {};
const songFilterState = name => songFilters[name] ||= { cat: new Set(), key: new Set(), has: new Set(), yt: new Set(), sort: 'title' };
const songFilterList = name => name === 'adder' ? window.songbook_edit_togglesongs_list : window.songbook_list;
const songFilterCount = f => f.cat.size + f.key.size + f.has.size + f.yt.size;
const songFilterOn = name => { const f = songFilterState(name); return songFilterCount(f) > 0 || f.sort !== 'title'; };
const videoLabel = n => n ? String(n) : 'None';
// Sorting only where there's no order of its own to keep: All Songs, Favorite Songs and "Add songs"
const songFilterSorts = name => name === 'adder' || ['sb-allSongs', 'sb-favoriteSongs'].includes(window.songbook?._id);

// What the filter needs to know about a song, from its doc (null for a deleted one)
function songFacts(doc) {
  if (!doc) return null;
  const list = value => (Array.isArray(value) ? value : []); // a bad record's field may be text, a number or missing
  return {
    cats: list(doc.categories).filter(cat => typeof cat === 'string' && cat),
    key: typeof doc.key === 'string' ? doc.key : '',
    chords: list(doc.content).some(chunk => list(chunk?.[1]).some(line => String(line).includes('<c>'))), // stops at the first

    yt: Number(doc.yt) || 0,
    ccli: !!doc.cclis,
    scripture: list(doc.scripture_ref).some(ref => String(ref ?? '').trim()),
    added: Number(doc.added) || 0,
    edited: Number(doc.edited) || 0,
  };
}

// Does a song pass the filter? `skip` leaves one group out, to count that group's choices.
function songFilterPasses(f, facts, skip) {
  if (!facts) return false;
  if (skip !== 'cat' && f.cat.size && ![...f.cat].some(c => c === NO_CATEGORY ? !facts.cats.length : facts.cats.includes(c))) return false;
  if (skip !== 'key' && f.key.size && !f.key.has(facts.key)) return false;
  if (skip !== 'has' && SONG_FILTER_HAS.some(([id, , test]) => f.has.has(id) && !test(facts))) return false;
  if (skip !== 'yt' && f.yt.size && !f.yt.has(videoLabel(facts.yt))) return false;
  return true;
}

// Apply a list's filter and sort, then redraw its button, chips and (open) panel
function applySongFilter(name) {
  const list = songFilterList(name);
  const f = songFilterState(name);
  if (list) {
    if (songFilterCount(f)) {
      list.filter(item => {
        const v = item.values();
        if (isBookExtra(v['song-id'])) return name === 'adder'; // "New Section" and "New Reading" stay; a book's sections and readings hide
        return songFilterPasses(f, v.facts);
      });
    } else {
      list.filter();
    }
    if (songFilterSorts(name)) {
      const key = item => isBookExtra(item.values()['song-id']) ? -Infinity : item.values().facts;
      const byTitle = (a, b) => (isBookExtra(a.values()['song-id']) ? -1 : isBookExtra(b.values()['song-id']) ? 1 : (a.values().name || '').localeCompare(b.values().name || ''));
      list.sort('name', {
        sortFunction: f.sort === 'title' ? byTitle : (a, b) => {
          const ka = key(a), kb = key(b);
          if (ka === -Infinity || kb === -Infinity) return ka === -Infinity ? -1 : 1;
          return ((kb?.[f.sort] || 0) - (ka?.[f.sort] || 0)) || byTitle(a, b);
        },
      });
    }
  }
  renderSongFilter(name);
  if (name === 'book') highlightText(); // the open song's marks follow the filter (#155)
}

function clearSongFilter(name) {
  const f = songFilterState(name);
  ['cat', 'key', 'has', 'yt'].forEach(group => f[group].clear());
  f.sort = 'title';
  f.find = '';
  applySongFilter(name);
}

// The Filter button and × for a list, built once beside its search box
function songFilterControls(name) {
  const nav = document.querySelector(`.song-filter[data-list="${name}"]`);
  if (nav && !nav.dataset.ready) {
    nav.dataset.ready = '1';
    nav.innerHTML = `<button type="button" class="filter-btn" aria-haspopup="dialog" aria-expanded="false" title="Filter songs">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v2.2a2 2 0 0 1-.6 1.4L15 12v7l-6 2v-8.5L4.6 7.6A2 2 0 0 1 4 6.2z"/></svg><span class="filter-label">Filter</span><span class="filter-count"></span></button><button type="button" class="filter-clear" title="Clear filters" aria-label="Clear filters" hidden>&times;</button>`;
    nav.querySelector('.filter-btn').addEventListener('click', () => toggleSongFilterPanel(name));
    nav.querySelector('.filter-clear').addEventListener('click', () => clearSongFilter(name));
  }
  return nav;
}

function renderSongFilter(name) {
  const f = songFilterState(name);
  const count = songFilterCount(f);
  const sorted = songFilterSorts(name) && f.sort !== 'title';
  const nav = songFilterControls(name);
  if (nav) {
    nav.classList.toggle('on', count > 0 || sorted);
    nav.querySelector('.filter-count').textContent = count || '';
    nav.querySelector('.filter-clear').hidden = !(count || sorted);
  }
  // the chips under the search box
  const chips = document.querySelector(`.filter-chips[data-list="${name}"]`);
  if (chips) {
    const hasLabel = id => SONG_FILTER_HAS.find(([h]) => h === id)[1].toLowerCase();
    const items = [
      ...[...f.cat].map(c => ['cat', c, c === NO_CATEGORY ? 'No category' : c]),
      ...[...f.key].map(k => ['key', k, `Key: ${k}`]),
      ...[...f.has].map(h => ['has', h, `Has ${hasLabel(h)}`]),
      ...[...f.yt].map(n => ['yt', n, n === 'None' ? 'No videos' : `Videos: ${n}`]),
    ];
    if (sorted) items.push(['sort', f.sort, `Sort: ${SONG_FILTER_SORTS.find(([s]) => s === f.sort)[1].toLowerCase()}`]);
    chips.hidden = !items.length;
    chips.innerHTML = items.map(([group, value, label]) =>
      `<button type="button" class="filter-chip sel" data-group="${group}" data-value="${escapeHtml(value)}" title="Remove">${escapeHtml(label)} <span aria-hidden="true">&times;</span></button>`).join('') +
      (items.length > 1 ? '<button type="button" class="filter-clear-all">Clear all</button>' : '');
  }
  const panel = document.getElementById(`filter_panel_${name}`);
  if (panel?.classList.contains('open')) fillSongFilterPanel(name, panel);
}

// The church's categories in the groups its "-----" dividers make: "----- Seasons" starts a group named
// Seasons, a plain "-----" one with no name. Categories songs have that aren't in the list come last.
function songCategoryGroups(songs) {
  const groups = [{ name: '', cats: [] }];
  const seen = new Set();
  for (const raw of window.songCategories || []) {
    const cat = String(raw).trim();
    const divider = cat.match(/^-{3,}\s*(.*)$/);
    if (divider) groups.push({ name: divider[1].trim(), cats: [] });
    else if (cat && !seen.has(cat)) {
      seen.add(cat);
      groups.at(-1).cats.push(cat);
    }
  }
  const missing = [...new Set(songs.flatMap(facts => facts.cats))].filter(cat => !seen.has(cat)).sort((a, b) => a.localeCompare(b));
  if (missing.length) groups.push({ name: 'Not in the category list', cats: missing });
  return groups.filter(group => group.cats.length);
}

// What drawing a list's panel needs: the songs it counts (those the search leaves) and a chip maker
function songFilterContext(name) {
  const f = songFilterState(name);
  const list = songFilterList(name);
  const songs = (list?.items || []).filter(item => !isBookExtra(item.values()['song-id']) && (!list.searched || item.found)).map(item => item.values().facts).filter(Boolean);
  const countWith = (group, test) => songs.filter(facts => songFilterPasses(f, facts, group) && test(facts)).length;
  const chip = (group, value, label, n) => `<button type="button" class="filter-chip${f[group].has(value) ? ' sel' : ''}${n === 0 && !f[group].has(value) ? ' none' : ''}" data-group="${group}" data-value="${escapeHtml(value)}" aria-pressed="${f[group].has(value)}">${escapeHtml(label)} <span class="n">${n}</span></button>`;
  const catChip = cat => chip('cat', cat, cat === NO_CATEGORY ? 'No category' : cat, countWith('cat', facts => cat === NO_CATEGORY ? !facts.cats.length : facts.cats.includes(cat)));
  return { f, list, songs, countWith, chip, catChip };
}

// The Category section below its find box: what the box finds, or the groups (small ones open at first)
function songCategoryBody(name) {
  const { f, songs, catChip } = songFilterContext(name);
  const groups = songCategoryGroups(songs);
  const find = (f.find || '').trim().toLowerCase();
  if (find) {
    const hits = groups.flatMap(group => group.cats).filter(cat => cat.toLowerCase().includes(find));
    return hits.length ? `<div class="filter-options">${hits.map(catChip).join('')}</div>` : '<p class="filter-none">No category has that in its name.</p>';
  }
  f.openGroups ||= new Map();
  return groups.map(group => {
    const chips = `<div class="filter-options">${group.cats.map(catChip).join('')}</div>`;
    if (!group.name) return `<div class="filter-group unnamed">${chips}</div>`;
    const open = f.openGroups.has(group.name) ? f.openGroups.get(group.name) : group.cats.length <= 10;
    const empty = group.cats.filter(cat => !songs.some(facts => facts.cats.includes(cat))).length;
    const picked = group.cats.filter(cat => f.cat.has(cat)).length;
    const about = [group.cats.length, empty && `${empty} with no songs`, picked && `${picked} picked`].filter(Boolean).join(' · ');
    return `<div class="filter-group"><button type="button" class="filter-group-head" data-cat-group="${escapeHtml(group.name)}" aria-expanded="${open}">${escapeHtml(group.name)} <span class="about">${about}</span><span class="arrow" aria-hidden="true">${open ? '▾' : '▸'}</span></button>${open ? chips : ''}</div>`;
  }).join('');
}

// The panel's choices, each with how many songs it would leave given the other choices and the search
function fillSongFilterPanel(name, panel) {
  const { f, list, songs, countWith, chip, catChip } = songFilterContext(name);
  const section = (title, html) => html ? `<div class="filter-section"><h4>${title}</h4><div class="filter-options">${html}</div></div>` : '';
  const keys = [...new Set(songs.map(facts => facts.key).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const videos = [...new Set(songs.map(facts => videoLabel(facts.yt)))].sort((a, b) => (a === 'None' ? -1 : +a) - (b === 'None' ? -1 : +b));
  const shown = list ? list.visibleItems.filter(item => !isBookExtra(item.values()['song-id'])).length : 0;
  const finding = document.activeElement?.classList.contains('filter-find') && panel.contains(document.activeElement);
  // Category: what's picked and "No category" first, then the find box, then the groups
  const picked = [...f.cat].filter(cat => cat !== NO_CATEGORY);
  const category = `<div class="filter-section"><h4>Category</h4>
      <div class="filter-options">${[...picked, NO_CATEGORY].map(catChip).join('')}</div>
      <input type="search" class="filter-find" placeholder="Find a category" aria-label="Find a category" value="${escapeHtml(f.find || '')}">
      <div class="filter-cat-body">${songCategoryBody(name)}</div></div>`;
  const scrolled = panel.scrollTop; // a redraw (a pick, or a sync change under it) keeps your place
  panel.innerHTML = `<div class="filter-grip" aria-hidden="true"></div>` + category +
    section('Key', keys.map(k => chip('key', k, k, countWith('key', facts => facts.key === k))).join('')) +
    section('Has', SONG_FILTER_HAS.map(([id, label, test]) => chip('has', id, label, countWith('has', test))).join('')) +
    section('Video links', videos.length > 1 ? videos.map(v => chip('yt', v, v, countWith('yt', facts => videoLabel(facts.yt) === v))).join('') : '') +
    (songFilterSorts(name) ? section('Sort', SONG_FILTER_SORTS.map(([id, label]) =>
      `<button type="button" class="filter-chip${f.sort === id ? ' sel' : ''}" data-sort="${id}" aria-pressed="${f.sort === id}">${label}</button>`).join('')) : '') +
    `<div class="filter-actions"><button type="button" class="btn btn-small filter-clear-all"${songFilterCount(f) || f.sort !== 'title' ? '' : ' hidden'}>Clear all</button><button type="button" class="btn btn-small filter-done">Show ${shown} song${shown === 1 ? '' : 's'}</button></div>`;
  panel.scrollTop = scrolled;
  if (finding) { // picking a found category redraws the panel: stay in the box
    const box = panel.querySelector('.filter-find');
    box.focus({ preventScroll: true });
    box.setSelectionRange(box.value.length, box.value.length);
  }
}

function songFilterPanel(name) {
  let panel = document.getElementById(`filter_panel_${name}`);
  if (!panel) {
    panel = document.createElement('div');
    panel.id = `filter_panel_${name}`;
    panel.className = 'filter-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Filter songs');
    // typing in "Find a category" redraws only what's under the box, so the box keeps its focus
    panel.addEventListener('input', e => {
      if (!e.target.classList.contains('filter-find')) return;
      songFilterState(name).find = e.target.value;
      panel.querySelector('.filter-cat-body').innerHTML = songCategoryBody(name);
    });
    panel.addEventListener('click', e => {
      const chip = e.target.closest('.filter-chip');
      const groupHead = e.target.closest('.filter-group-head');
      const f = songFilterState(name);
      if (groupHead) {
        const open = groupHead.getAttribute('aria-expanded') !== 'true';
        f.openGroups.set(groupHead.dataset.catGroup, open);
        panel.querySelector('.filter-cat-body').innerHTML = songCategoryBody(name);
        panel.querySelector(`.filter-group-head[data-cat-group="${CSS.escape(groupHead.dataset.catGroup)}"]`)?.focus({ preventScroll: true });
      } else if (chip?.dataset.sort) {
        f.sort = chip.dataset.sort;
        applySongFilter(name);
      } else if (chip) {
        const set = f[chip.dataset.group];
        set.has(chip.dataset.value) ? set.delete(chip.dataset.value) : set.add(chip.dataset.value);
        applySongFilter(name);
      } else if (e.target.closest('.filter-clear-all')) {
        clearSongFilter(name);
      } else if (e.target.closest('.filter-done')) {
        toggleSongFilterPanel(name, false);
      }
    });
    makeSheetDismissable(panel, () => toggleSongFilterPanel(name, false));
    document.body.append(panel);
  }
  return panel;
}

const songFilterPhone = () => window.matchMedia('(max-width: 39.99rem)').matches;

// A bottom sheet (.sheet, like the song filter on a phone) follows a finger pulled down and closes when let
// go far enough down or flicked, like the columns' pull-down to close; otherwise it springs back. Only from
// the sheet's top: while its content is scrolled down, a pull scrolls it back up instead.
function makeSheetDismissable(sheet, close) {
  let startY = null, startX = 0, startTime = 0, dy = 0, pulling = false;
  sheet.addEventListener('touchstart', e => {
    startY = null;
    if (!sheet.classList.contains('sheet') || e.touches.length > 1 || sheet.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    startTime = Date.now();
    dy = 0;
    pulling = false;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (startY === null) return;
    dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    if (!pulling) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return; // not decided yet
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) { startY = null; return; } // a scroll up, or sideways
      pulling = true;
      sheet.style.transition = 'none'; // it follows the finger
    }
    if (e.cancelable) e.preventDefault();
    sheet.style.transform = `translateY(${Math.max(dy, 0)}px)`;
  }, { passive: false });
  const letGo = () => {
    if (startY === null || !pulling) { startY = null; return; }
    startY = null;
    const flicked = dy > 40 && Date.now() - startTime < 250;
    sheet.style.removeProperty('transition'); // slides the rest of the way down, or back up
    sheet.style.removeProperty('transform');
    if (flicked || dy > Math.min(120, sheet.offsetHeight / 3)) close();
  };
  sheet.addEventListener('touchend', letGo);
  sheet.addEventListener('touchcancel', () => { dy = 0; letGo(); });
}

function toggleSongFilterPanel(name, open) {
  const panel = songFilterPanel(name);
  open ??= !panel.classList.contains('open');
  document.querySelectorAll('.filter-panel.open').forEach(other => { if (other !== panel) toggleSongFilterPanel(other.id.replace('filter_panel_', ''), false); });
  const button = document.querySelector(`.song-filter[data-list="${name}"] .filter-btn`);
  let scrim = document.getElementById('filter_scrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'filter_scrim';
    scrim.addEventListener('click', () => document.querySelectorAll('.filter-panel.open').forEach(p => toggleSongFilterPanel(p.id.replace('filter_panel_', ''), false)));
    document.body.append(scrim);
  }
  button?.setAttribute('aria-expanded', open);
  if (!open) {
    panel.classList.remove('open');
    scrim.classList.remove('open');
    return;
  }
  fillSongFilterPanel(name, panel);
  const phone = songFilterPhone();
  panel.classList.toggle('sheet', phone);
  panel.style.top = panel.style.left = panel.style.width = '';
  if (!phone && button) { // drop down under the button, over the list it filters, as wide as that list's column
    const r = button.getBoundingClientRect();
    const column = (button.closest('.subcolumn') || button.closest('.column'))?.getBoundingClientRect();
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const width = Math.min(24 * rem, Math.max(18 * rem, (column?.width || window.innerWidth) - 16), window.innerWidth - 16);
    panel.style.width = `${width}px`;
    panel.style.top = `${r.bottom + 6}px`;
    panel.style.left = `${Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))}px`;
  }
  scrim.classList.toggle('open', phone);
  requestAnimationFrame(() => panel.classList.add('open'));
  panel.querySelector('.filter-chip, button')?.focus({ preventScroll: true });
}

// Close an open panel: Esc, a click outside it (on desktop), a new screen or a resize
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.filter-panel.open').forEach(panel => {
    const name = panel.id.replace('filter_panel_', '');
    toggleSongFilterPanel(name, false);
    document.querySelector(`.song-filter[data-list="${name}"] .filter-btn`)?.focus();
  });
});
document.addEventListener('pointerdown', e => {
  if (e.target.closest('.filter-panel, .filter-btn, #filter_scrim')) return;
  document.querySelectorAll('.filter-panel.open:not(.sheet)').forEach(panel => toggleSongFilterPanel(panel.id.replace('filter_panel_', ''), false));
});
// A new screen closes any panel; a resize only the desktop dropdown (placed by the button), since on phones
// the keyboard opening for "Find a category", or the toolbar hiding, resizes the page under the sheet
window.addEventListener('hashchange', () =>
  document.querySelectorAll('.filter-panel.open').forEach(panel => toggleSongFilterPanel(panel.id.replace('filter_panel_', ''), false)));
window.addEventListener('resize', () =>
  document.querySelectorAll('.filter-panel.open:not(.sheet)').forEach(panel => toggleSongFilterPanel(panel.id.replace('filter_panel_', ''), false)));
// The chips under the search box: × takes one away, "Clear all" takes them all
document.addEventListener('click', e => {
  const row = e.target.closest('.filter-chips');
  if (!row) return;
  const name = row.dataset.list;
  const chip = e.target.closest('.filter-chip');
  if (chip) {
    const f = songFilterState(name);
    if (chip.dataset.group === 'sort') f.sort = 'title';
    else f[chip.dataset.group].delete(chip.dataset.value);
    applySongFilter(name);
  } else if (e.target.closest('.filter-clear-all')) {
    clearSongFilter(name);
  }
});
function dataxInBookUpdate(song, remove = false) {
   const songId = song.getAttribute('data-song-id');

   // Skip section headers and readings
   if (isBookExtra(songId)) {
     return;
   }

   const songElement = document.querySelector(`#songListEdit li[data-song-id="${songId}"]`);
   if (!songElement) {
     return;
   }

   let currentCount = parseInt(songElement.getAttribute('data-xInBook')) || 0;
   let newCount = remove ? currentCount - 1 : currentCount + 1;

   if (newCount <= 0) {
     songElement.removeAttribute('data-xInBook');
     songElement.removeAttribute('title');
   } else {
     songElement.setAttribute('data-xInBook', newCount);
     songElement.title = newCount === 1 ? 'Already in this songbook' : `In this songbook ${newCount} times`; // what the number means
   }
 }

function editHash(e) {
  e.preventDefault();
  if (e.target.closest('.status-btn')) return; // its own click changes the status (addBookRowButtons)
  if (isBookExtra(this.getAttribute('data-song-id'))) return; // nothing to open (a reading's pencil changes it)
  if(window.innerWidth <= 1150 && !document.body.classList.contains('song') && e.target.closest('#songbook_edit_togglesongs')) {
    return;  //we're not popping open edit song from the add song window.
  }
  location.hash = e.target.href.replace(/^.*#/,'').replace(window.songbook._id, window.songbook._id+'?edit');
}
function bind_songbook_edit(song){
  song.addEventListener('click', editHash, false);
}

// ---- Dragging to reorder, with SortableJS (Sortable.min.js) ----
// The same for every list: with a mouse a drag starts right away; with a finger, after holding still for a
// moment, so a quick swipe is still a scroll.
const SORTABLE_DRAG = {
  // a row picked up (held long enough) until it's let go: the side panels' swipe stays out of the way
  onChoose() { window.sortableHolding = true; },
  onUnchoose() { window.sortableHolding = false; },
  // touch and mouse events, not pointer events: with pointer events, a scroll that the browser takes over
  // leaves SortableJS stuck, and the row scrolled over ignores the next press-and-hold
  supportPointer: false,
  animation: 150,
  delay: 200,              // ms to hold before a finger drags
  delayOnTouchOnly: true,
  touchStartThreshold: 6,  // px a finger can wander while holding; more is a scroll
  fallbackTolerance: 3,
  ghostClass: 'sortable-ghost',
  chosenClass: 'sortable-chosen',
  dragClass: 'sortable-drag',
};
// Chrome on Android opens its link menu ("Open in new tab") on a long press, which takes the finger away
// from the drag. Not while a row is picked up; a tap still opens the song, and a mouse's right-click still
// gets its menu (a mouse never picks a row up by holding).
document.addEventListener('contextmenu', (e) => { if (window.sortableHolding) e.preventDefault(); }, true);
// The dragged row: a short highlight once it lands, and on screen
function landed(row) {
  scrollIntoViewIfNeed(row);
  setTimeout(() => flash(row), 200);
}
// A short highlight that fades: on a song row's pill (its link), the shape it has while dragged; else the box
function flash(row) {
  const pill = row.querySelector(':scope > a') || row;
  pill.classList.add('highlightBg');
  setTimeout(() => pill.classList.remove('highlightBg'), 3000);
}
// While a song is held, the song column (or the empty column, with no song open) is a place to drop it to
// open it. The browser's own drop does this with a mouse (sortable.js); with a finger, where it let go.
function dragViewStart(evt) {
  const id = evt.item.getAttribute('data-song-id');
  window.draggedSongId = id && !isBookExtra(id) ? id : null;
  if (!window.draggedSongId) return;
  document.getElementById(document.body.classList.contains('song') ? 'song' : 'column-filler').classList.add('dropHere');
}
// Was the song let go over the song column, to open it? (The browser's drop said so, or a finger let go there.)
function droppedToOpen(evt) {
  if (window.songDropOpened) return true;
  const e = evt.originalEvent;
  const point = e?.changedTouches?.[0] || (e && /^(pointer|touch)/.test(e.type) ? e : null);
  return !!(point && window.draggedSongId && document.elementFromPoint(point.clientX, point.clientY)?.closest('.dropHere'));
}
// Put a row back where it was picked up: on the way to the song column it may have passed over a list,
// and SortableJS moves a row into whatever list it's over
function putRowBack(evt) {
  evt.item.remove();
  evt.from.insertBefore(evt.item, evt.from.children[evt.oldIndex] || null);
}
function dragViewEnd(evt) {
  if (droppedToOpen(evt) && !window.songDropOpened) openDroppedSong(window.draggedSongId); // a finger's drop
  document.querySelector('.dropHere')?.classList.remove('dropHere');
  window.draggedSongId = null;
  window.songDropOpened = false;
}
function openDroppedSong(songId) {
  location.hash = `${location.hash.replace('#', '').split('&')[0]}&${songId}`;
}
// A song that's open while its row is moved or added in the editor follows it, as it always has
function openMovedSong(row) {
  if (!/&s-/.test(location.hash)) return;
  const href = row.querySelector('a')?.getAttribute('href') || '';
  const hash = href.replace(/^.*#/, '#').replace(window.songbook._id, window.songbook._id + '?edit');
  if (/&s-/.test(hash)) location.hash = hash;
}
// The trash button, and the pencil for a section, on a row in the book being edited. A song's row also gets
// its status as a button in front of its name (UX audit #15): shown while "Song Status" is on, a click moves it
// on, ~ new → ✓ approved → ✗ rejected → ~ new.
function addBookRowButtons(row) {
  if (row.getAttribute('data-song-id') === 'section') add_edit_pencil(row, () => editSection(row));
  if (row.getAttribute('data-song-id') === 'reading') add_edit_pencil(row, () => editReading(row));
  if (!isBookExtra(row.getAttribute('data-song-id')) && !row.querySelector(':scope > .status-btn')) {
    const statusBtn = document.createElement('button');
    statusBtn.type = 'button';
    statusBtn.className = 'status-btn';
    statusBtn.addEventListener('click', e => {
      e.stopPropagation(); // not the row's click, which opens the song
      cycleStatus(row);
    });
    row.prepend(statusBtn);
    labelStatusButton(row);
  }
  const deleteButton = document.createElement('button');
  deleteButton.innerHTML = '&#128465;';
  deleteButton.title = 'Take out of the songbook';
  deleteButton.setAttribute('aria-label', 'Take out of the songbook');
  deleteButton.addEventListener('click', () => {
    dataxInBookUpdate(row, true);
    scaleRemove(row);
  });
  row.appendChild(deleteButton);
}
// A new row for the book, copied from a row in "Add songs" (a click or a drag adds one)
function newBookRow(adderRow) {
  const row = adderRow.cloneNode(true);
  row.removeAttribute('data-xInBook');
  row.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag');
  row.removeAttribute('style');
  bind_songbook_edit(row);
  dataxInBookUpdate(row);
  addBookRowButtons(row);
  row.setAttribute('data-song-status', 'n');
  // a new reading asks for its verses once it's in the book, and comes back out if none are given
  if (row.getAttribute('data-song-id') === 'reading') setTimeout(() => editReading(row, true));
  return row;
}

// A reading opens in the song column, as a song does (#157): its verses in the church's translation, under
// its reference. Its link is #<book>&r-<reference>.
async function showReading(ref) {
  const content = document.querySelector('#song .content');
  document.querySelector('#song .float-menu').innerHTML = ''; // nothing to edit, delete or export on its own
  content.innerHTML = `
    <section class="song-card reading-card">
      <div class="column_header">
        <div class="title">
          <h3 class="song-title"><a class="title_link">📖 ${escapeHtml(ref)}</a></h3>
          <span class="buttonsRight"><span class="fsButton" role="button" tabindex="0" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }" aria-label="Full width" title="Full width" onclick="toggleFullscreen(this)"></span></span>
        </div>
      </div>
      <song><div class="reading-text">Loading…</div></song>
    </section>`;
  const box = content.querySelector('.reading-text');
  try {
    const passage = await Bible.passage(ref, await churchBible());
    const vs = passage.verses;
    const chapters = new Set(vs.map(v => v.book + v.chapter)).size > 1; // then each chapter's first verse says which
    box.innerHTML = vs.map((v, i) => {
      const num = chapters && (i === 0 || v.chapter !== vs[i - 1].chapter) ? `${v.chapter}:${v.verse}` : v.verse;
      return `<p><sup>${num}</sup> ${escapeHtml(v.text)}</p>`;
    }).join('')
      + `<p class="reading-credit">${escapeHtml(passage.translation.credit)}</p>`;
  } catch (err) {
    box.textContent = navigator.onLine ? (err.message || String(err)) : "These verses aren't saved on this device yet. Connect to the internet to load them.";
  }
}
function readingLink(ref) {
  return '#' + window.songbook._id + '&r-' + encodeURIComponent(ref);
}

// A row's name typed in a box in the row, in the songbook editor: a section's title (the pencil), or a
// reading's verses (#157). Under the box, check(text) says what it will be, or what's wrong:
// { value, hint } can be kept, { problem } can't, { hint } alone is nothing yet. Enter (or clicking away)
// keeps a good one with keep(value); Esc, or clicking away from a bad or empty one, leaves the row as it was,
// or takes a new one back out.
function editRowInline(row, { isNew = false, placeholder = '', check, keep }) {
  const link = row.querySelector('a');
  const open = row.querySelector('.row-input');
  if (open) return open.focus();
  const input = document.createElement('input');
  input.className = 'row-input';
  input.placeholder = placeholder;
  input.value = isNew ? '' : link.textContent;
  const hint = document.createElement('div');
  hint.className = 'row-hint';
  link.style.display = 'none'; // (the list's styles show a hidden link)
  link.after(input);
  row.append(hint);
  let result = {};
  const update = () => {
    result = check(input.value.trim());
    hint.classList.toggle('problem', !!result.problem);
    hint.textContent = result.problem || result.hint || '';
    hint.style.display = hint.textContent ? '' : 'none';
  };
  let done = false;
  const finish = keepIt => {
    if (done) return;
    done = true;
    input.remove();
    hint.remove();
    link.style.display = '';
    if (keepIt) keep(result.value);
    else if (isNew) scaleRemove(row);
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // the list's own keys stay out of the typing
    if (e.key === 'Enter') { e.preventDefault(); if (result.value) finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('click', e => e.stopPropagation()); // not the row's click
  input.addEventListener('blur', () => finish(!!result.value));
  update();
  input.focus();
  input.select();
}
function editSection(row) {
  const link = row.querySelector('a');
  editRowInline(row, {
    placeholder: 'Section name',
    check: text => text ? { value: text } : { problem: 'A section needs a name.' },
    keep: name => { link.textContent = name; },
  });
}
// A reading's verses: "ps 95:1-7" is kept as "Psalm 95:1–7"
async function editReading(row, isNew = false) {
  const link = row.querySelector('a');
  try {
    await Bible.ready();
  } catch (err) {
    notyf.error("The Bible list didn't load. Connect to the internet once, then try again.");
    if (isNew) row.remove();
    return;
  }
  editRowInline(row, {
    isNew,
    placeholder: 'Like Psalm 95:1-7 or John 3:16-21',
    check: text => {
      if (!text) return { hint: 'Type the verses for this reading.' };
      const found = Bible.parse(text);
      return found.error ? { problem: found.error } : { value: found.label, hint: `Reading: ${found.label}` };
    },
    keep: label => {
      link.textContent = label;
      link.setAttribute('href', readingLink(label));
      row.setAttribute('data-song-search', label);
    },
  });
}
// The songbook editor: the book's songs reorder; a song dragged in from "Add songs" is added (that list
// keeps its own, in order); a song dragged from the book back to "Add songs" comes out of the book.
// Made once per list; they only drag while the book is being edited.
function makeSongbookSortable() {
  const book = document.querySelector('#songbook_content ul.list');
  const adder = document.querySelector('#songbook_edit_togglesongs ul.list');
  const notEditing = (evt) => !window.songbookEditing || !!evt.target.closest('button, input'); // buttons still click, a reading's box still types
  const changed = () => window.songbook_list?.reIndex();
  if (book && !Sortable.get(book)) {
    Sortable.create(book, {
      ...SORTABLE_DRAG,
      group: { name: 'book', pull: true, put: ['adder'] },
      filter: notEditing,
      preventOnFilter: false,
      onStart: dragViewStart,
      onEnd: dragViewEnd,
      onUpdate(evt) { // moved within the book
        if (droppedToOpen(evt)) return putRowBack(evt);
        changed();
        landed(evt.item);
        openMovedSong(evt.item);
      },
      onAdd(evt) { // dragged in from "Add songs": a new row where it was dropped, and the original goes back
        const original = evt.item;
        const spot = document.createTextNode('');
        original.before(spot);
        if (evt.clone) evt.clone.replaceWith(original); // SortableJS's stand-in, in "Add songs"
        original.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag');
        if (droppedToOpen(evt)) return spot.remove(); // it was only passing over the book
        const row = newBookRow(original); // after the original is back, so its "in the book" count goes up
        spot.replaceWith(row);
        changed();
        landed(row);
        openMovedSong(row);
      },
    });
  }
  if (adder && !Sortable.get(adder)) {
    Sortable.create(adder, {
      ...SORTABLE_DRAG,
      group: { name: 'adder', pull: 'clone', put: ['book'] },
      sort: false, // it stays in title order
      filter: notEditing,
      preventOnFilter: false,
      onStart: dragViewStart,
      onEnd: dragViewEnd,
      onAdd(evt) { // a song dragged back from the book: it comes out of the book
        if (droppedToOpen(evt)) return putRowBack(evt); // it was only passing over this list
        evt.item.remove(); // first, so the count below is on this list's own row, not the dropped one
        dataxInBookUpdate(evt.item, true);
        changed();
      },
    });
  }
}
// The song editor: a song's chunks reorder by dragging their box (or the grip), not the text in it, so a
// click in the text still puts the cursor there. (This also takes care of #123, Firefox's cursor.)
function makeChunksSortable(songElement) {
  Sortable.create(songElement, {
    ...SORTABLE_DRAG,
    draggable: '.wrap',
    filter: 'chunk, select',
    preventOnFilter: false,
    onStart() { // no dropping the chunk into some text while it moves
      songElement.querySelectorAll('.wrap [contenteditable="true"]').forEach(el => {
        el.classList.add('contenteditable-disabled');
        el.removeAttribute('contenteditable');
      });
    },
    onEnd(evt) {
      songElement.querySelectorAll('.wrap .contenteditable-disabled').forEach(chunk => {
        chunk.classList.remove('contenteditable-disabled');
        chunk.setAttribute('contenteditable', 'true');
      });
      if (evt.oldIndex !== evt.newIndex) landed(evt.item);
    },
  });
}
// The ✏️ on a section's or a reading's row: edit() opens its box
function add_edit_pencil(song, edit) {
  const editBtn = document.createElement('button');
  editBtn.className = 'edit_pencil';
  editBtn.textContent = '✏️';
  editBtn.title = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit');
  editBtn.addEventListener('click', () => edit());

  // Insert button after the link
  const link = song.querySelector('a');
  if (link) {
    link.insertAdjacentElement('afterend', editBtn);
  }
}
function cycleStatus(el) {
  const status = el.getAttribute('data-song-status');
  
  switch(status) {
    case 'n':
      el.setAttribute('data-song-status', 'a');
      break;
    case 'a':
      el.setAttribute('data-song-status', 'r');
      break;
    case 'r':
      el.setAttribute('data-song-status', 'n');
      break;
    default:
      el.setAttribute('data-song-status', 'n');
  }
  labelStatusButton(el);
}
// What a row's status button says it is now and what a click makes it (its mark is drawn by style.css)
const STATUS_NAMES = { n: 'New', a: 'Approved', r: 'Rejected' };
const STATUS_NEXT = { n: 'a', a: 'r', r: 'n' };
function labelStatusButton(row) {
  const btn = row.querySelector(':scope > .status-btn');
  if (!btn) return;
  const now = STATUS_NAMES[row.getAttribute('data-song-status')] ? row.getAttribute('data-song-status') : 'n';
  btn.title = `Status: ${STATUS_NAMES[now]}. Click for ${STATUS_NAMES[STATUS_NEXT[now]]}.`;
  btn.setAttribute('aria-label', btn.title);
}
function cancelSongbook(el) {
  if (window.songbookEditing) {
    window.songbookEditing = false; // Reset editing state first
    const confirmed = confirmWhenEditing(); // Then check for confirmation
    if (!confirmed) {
      // A new songbook that was never saved has nowhere to go back to: show the songbooks list (#149)
      const isNew = window.songbook._id === 'sb-new-songbook';
      window.songbook._id = '';
      window.location.hash = isNew ? '#songbooks' : el.getAttribute('href'); // a button has no .href property
      window.songEditing = false;
    } else {
      window.songbookEditing = true; // Restore editing state if not confirmed
    }
  }
}
function resetSongbook() {
  if (window.songbookEditing || window.songEditing) {
    window.songbookEditing = false; // Reset editing state first
    window.songEditing = false; // Reset song editing state
    const confirmed = confirmWhenEditing(); // Then check for confirmation
    if (!confirmed) {
      location.reload(); // Reload the page to reset state
    } else {
      window.songbookEditing = true; // Restore editing state if not confirmed
      window.songEditing = true; // Restore song editing state
    }
  }
}

async function editSongbook() {
  // Create and append edit buttons
  const createEditButtons = () => {
    const buttons = document.createElement('div');
    buttons.className = 'edit_buttons';
    buttons.innerHTML = `
      <button data-songbook class="btn" onclick="saveSongbookFromEditor();">Save</button>
      <button data-songbook class="btn" onclick="cancelSongbook(this);">Cancel</button>
      <button data-songbook class="btn" onclick="resetSongbook();">Reset</button>`;
    const buttonsClone = buttons.cloneNode(true); // Create a deep copy
    document.getElementById('songbook_content').prepend(buttons);
    document.getElementById('songbook_content').append(buttonsClone);
  };

  // Enable editing for the songbook title
  const enableTitleEditing = () => {
    const titleElement = document.getElementById('songbook_title');
    titleElement.setAttribute('contenteditable', 'true');
  };

  // Disable search input and navigation
  const disableSearchAndNav = () => {
    const searchInput = document.querySelector('#songbook_content .search');
    // Clear any search first: List.js only keeps matching songs in the DOM, and saveSongbook saves what's there
    searchInput.value = '';
    searchInput.dispatchEvent(new KeyboardEvent('keyup'));
    searchInput.parentElement.classList.add('disabled-hidden');
    searchInput.disabled = true;
    // and any filter, for the same reason (#84)
    clearSongFilter('book');
    document.querySelectorAll('#songbook_content .song-filter, #songbook_content .filter-chips, #songbook_content .search-tips').forEach(el => el.classList.add('disabled-hidden'));
    // say why the search went away (UX audit #25)
    if (!document.querySelector('#songbook_header .edit-search-note')) {
      searchInput.parentElement.insertAdjacentHTML('afterend', '<p class="edit-search-note">While you edit, the book shows all its songs, so all of them are saved. To find songs to add, search in Add songs.</p>');
    }
  };

  // Add status and comments toggle buttons
  const addStatusAndCommentsToggle = () => {
    const header = document.getElementById('songbook_header');
    const toggleButtons = document.createElement('span');
    toggleButtons.className = 'edit_buttons';
    toggleButtons.innerHTML = `
      Song Status:
      <label id="showStatusID" class="switch" onchange="(function(checkbox) {
        const content = document.getElementById('songbook_content');
        const isChecked = checkbox.checked;
        if (isChecked) {
          content.classList.add('showStatus');
          window.songbook.showStatus = true;
        } else {
          content.classList.remove('showStatus');
          window.songbook.showStatus = false;
        }
      })(this.firstElementChild)">
        <input type="checkbox" id="statusON" ${window.songbook.showStatus ? 'checked' : ''}>
        <div class="slider"></div>
      </label>
      Comments:
      <label class="switch" onchange="(function(checkbox) {
        const content = document.getElementById('songbook_content');
        const isChecked = checkbox.checked;
        if (isChecked) {
          content.classList.add('showComments');
          window.songbook.showComments = true;
        } else {
          content.classList.remove('showComments');
          window.songbook.showComments = false;
        }
      })(this.firstElementChild)">
        <input type="checkbox" id="commentsON" ${window.songbook.showComments ? 'checked' : ''}>
        <div class="slider"></div>
      </label>`;
    header.appendChild(toggleButtons);
  };

  // Load all songs into the song adder
  async function loadSongsIntoAdder() {
    let result;
    try {
      result = await db.allDocs({
        include_docs: true,
        startkey: 's-',
        endkey: 's-\ufff0'
      });
    } catch (err) {
      reportDbError(err, 'load the songs you can add'); // the rest of the editor still works
      return;
    }

    const songs = result.rows.sort((a, b) => String(a.doc?.title ?? '').localeCompare(String(b.doc?.title ?? ''))); // a bad record's title may be a number
    songs.unshift({ id: 'section', title: 'New Section', search: 'new section' },
      { id: 'reading', title: 'New Reading', search: 'new reading bible scripture verses' }); // #157

    buildSongbookList(songs, 'songbook_edit_togglesongs', 'song-item-template-edit', true);
  }

  // Bind events to the songbook list
  const bindSongbookListEvents = () => {
    const songList = document.querySelectorAll('#songList #songbook_content ul li');
    songList.forEach((song) => {
      bind_songbook_edit(song);
      dataxInBookUpdate(song);
      addBookRowButtons(song);
    });

    document.querySelectorAll('#songList #songbook_edit_togglesongs ul li').forEach(bindAdderSong);
  };

  // Main logic
  createEditButtons();
  enableTitleEditing();
  disableSearchAndNav();
  addStatusAndCommentsToggle();
  await loadSongsIntoAdder();
  bindSongbookListEvents();
  makeSongbookSortable(); // drag to reorder, to add from "Add songs" and to take out
}

// One song in the songbook editor's "Add songs" list: clicking it adds a copy to the end of the book
function bindAdderSong(song) {
  bind_songbook_edit(song);
  song.addEventListener('click', () => {
    const copySong = newBookRow(song);
    document.querySelector('#songbook_content .list').appendChild(copySong);
    scrollIntoViewIfNeed(copySong);
    flash(copySong);
  });
}

// A song that shows up while the songbook editor is open (restored or added, maybe on another device):
// put it in "Add songs" in the list's order (title, unless the filter sorts it), after New Section
function addToSongAdder(values) {
  const adder = window.songbook_edit_togglesongs_list;
  const [item] = adder.add(values);
  applySongFilter('adder'); // a new item isn't filtered or sorted yet
  if (item?.elm) bindAdderSong(item.elm);
}

// Under an open song: the Key button opens and closes the key list, and picking a key closes it and shows
// the chords. The Chords switch, there only when the song has chords, shows and hides them (#143).
function bindKeyAndChords() {
  const container = document.getElementById('keyToggleContainer');
  const keyButton = document.getElementById('keyToggle');
  if (!container || !keyButton) return;
  const songColumn = document.getElementById('song');
  const chordSwitch = document.getElementById('chordSwitch');
  // The key list is one stop for Tab, and none while it's closed (#68): its picked key, or the first
  const keyLinks = () => [...container.querySelectorAll('.transpose-keys a')];
  const tabStop = () => container.querySelector('.transpose-keys a.selected') || keyLinks()[0];
  const setStop = link => keyLinks().forEach(a => { a.tabIndex = a === link ? 0 : -1; });
  const setOpen = open => {
    container.classList.toggle('active', open);
    keyButton.setAttribute('aria-expanded', open);
    setStop(open ? tabStop() : null);
    // the list opens over the song: keep it inside the song's right edge (on a phone the row can sit
    // beside the author, too far right for the whole list)
    const list = container.querySelector('.transpose-keys');
    if (open && list) {
      // (worked out from sizes: the list animates, so where it is right now may be where it was)
      const edge = songColumn.getBoundingClientRect().left + songColumn.clientWidth - 8;
      const over = Math.max(0, container.getBoundingClientRect().left + list.offsetWidth - edge);
      list.style.left = -over + 'px';
      // The button row's tab (#keyToggleFilter) starts at the list's left before any shift. Where an edge
      // of the list lines up with the tab, a rounded corner would leave a notch: round each top corner
      // only as far as the list reaches past the tab.
      const tabWidth = document.getElementById('keyToggleFilter').offsetWidth;
      const round = px => Math.round(Math.min(Math.max(px, 0), remToPx(1))) + 'px';
      list.style.borderTopLeftRadius = round(over);
      list.style.borderTopRightRadius = round(list.offsetWidth - over - tabWidth);
    }
  };
  // a tap anywhere else closes the open list, since it covers part of the song
  if (!window.keyListClosesOutside) {
    window.keyListClosesOutside = true;
    document.addEventListener('pointerdown', e => {
      const open = document.querySelector('#keyToggleContainer.active');
      if (open && !open.contains(e.target)) document.getElementById('keyToggle')?.click();
    }, true);
  }
  const setChords = show => {
    songColumn.classList.toggle('nochords', !show);
    chordSwitch.checked = show;
  };
  keyButton.addEventListener('click', event => {
    const open = !container.classList.contains('active');
    setOpen(open);
    if (open && event.detail === 0) tabStop()?.focus({ preventScroll: true }); // opened from the keyboard
  });
  chordSwitch.closest('label').hidden = !container.closest('song')?.querySelector('c');
  chordSwitch.checked = !songColumn.classList.contains('nochords');
  chordSwitch.addEventListener('change', () => setChords(chordSwitch.checked));
  // After a key is picked, keyboard users go back to the Key button; a tap or click leaves no focus ring
  let byKeyboard = false;
  container.addEventListener('keydown', () => { byKeyboard = true; });
  container.addEventListener('pointerdown', () => { byKeyboard = false; });
  Transposer(keyButton, {
    onPick: name => {
      keyButton.querySelector('.key-name').textContent = name;
      setOpen(false);
      setChords(true);
      if (byKeyboard) keyButton.focus({ preventScroll: true });
      else document.activeElement?.blur();
    },
  });
  setStop(null); // the list starts closed
  // In the open list: arrows move through the keys (up and down by row), Home and End, a letter jumps to
  // the next key starting with it (D, D#, Db, D ...), Esc closes it (#68). Enter or Space picks.
  container.querySelector('.transpose-keys')?.addEventListener('keydown', e => {
    const links = keyLinks();
    const current = links.indexOf(document.activeElement);
    if (current < 0) return;
    let next = null;
    const rowStep = dir => { // the nearest key in the row above or below
      const here = links[current].getBoundingClientRect();
      const row = links.filter(a => dir > 0 ? a.getBoundingClientRect().top > here.top + 4 : a.getBoundingClientRect().top < here.top - 4);
      const rowTop = dir > 0 ? Math.min(...row.map(a => a.getBoundingClientRect().top)) : Math.max(...row.map(a => a.getBoundingClientRect().top));
      const inRow = row.filter(a => Math.abs(a.getBoundingClientRect().top - rowTop) < 4);
      return inRow.sort((a, b) => Math.abs(a.getBoundingClientRect().left - here.left) - Math.abs(b.getBoundingClientRect().left - here.left))[0] || null;
    };
    if (e.key === 'ArrowRight') next = links[Math.min(links.length - 1, current + 1)];
    else if (e.key === 'ArrowLeft') next = links[Math.max(0, current - 1)];
    else if (e.key === 'ArrowDown') next = rowStep(1);
    else if (e.key === 'ArrowUp') next = rowStep(-1);
    else if (e.key === 'Home') next = links[0];
    else if (e.key === 'End') next = links.at(-1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      keyButton.focus({ preventScroll: true });
      return;
    } else if (/^[a-g]$/i.test(e.key)) {
      const matches = links.filter(a => a.textContent[0].toLowerCase() === e.key.toLowerCase());
      next = matches[(matches.indexOf(links[current]) + 1) % matches.length];
    }
    if (!next) return;
    e.preventDefault();
    setStop(next);
    next.focus({ preventScroll: true });
  });
}

async function editSong() {
  await loadSong(window.song._id);
  if (window.song._deleted) { // a deleted song is restored, not edited (#69); this only happens with a typed ?edit link
    notyf.error('This song was deleted. Restore it to edit it.', 'red');
    window.location.hash = window.location.hash.replace(/\?edit\b(?!.*\?edit)/, ''); // the song's (last) one
    return;
  }

  // Create and add edit buttons
  const buttonsHTML = `
    <div class="edit_buttons">
      <button data-song class="btn" onclick="prepSaveSong(this)">Save</button>
      <a ${window.song._id === 's-new-song' ? 'data-songbook' : 'data-song'} 
              class="btn" 
              onclick="window.songEditing=false; delete window.song; window.location.hash=this.getAttribute('href');">
        Cancel
      </a>
      <button data-song class="btn" title="Throw away your changes and start this song's edit over"
              onclick="if (confirm('Throw away your changes to this song and start over?')) { window.songEditing=false; location.reload(); }">
        Reset
      </button>
    </div>`;
  
  const songElement = document.querySelector('#song .song-card'); // the card: the buttons go above its header and below the song

  songElement.insertAdjacentHTML('afterbegin', buttonsHTML);
  songElement.insertAdjacentHTML('beforeend', buttonsHTML);

  // Process chunks
  const chunks = Array.from(songElement.getElementsByTagName('chunk'));
  chunks.forEach(chunk => {
    const content = Array.from(chunk.getElementsByTagName('line'))
      .map(line => is_chord_line(line.innerHTML) ? expand_chord(line.innerHTML) : line.innerHTML)
      .join('\n');
    
    chunk.innerHTML = content;
    chunk.classList.add('pre');

    // Create wrapper and select element
    const wrapper = document.createElement('div');
    wrapper.className = 'wrap';
    
    const select = document.createElement('select');
    select.name = 'types';
    select.size = 1;
    select.innerHTML = `
      <option value="verse">Verse</option>
      <option value="chorus">Chorus</option>
      <optgroup label="Misc">
        <option value="pre-chorus">Pre-Chorus</option>
        <option value="final chorus">Final Chorus</option>
        <option value="bridge">Bridge</option>
        <option value="ending">Ending</option>
        <option value="no label">No Label</option>
        <option value="indented no label">Indented No Label</option>
        <option value="comment">Comment</option>
      </optgroup>`;
    
    select.value = chunk.getAttribute('type').toLowerCase();
    wrapper.appendChild(select);
    // how this part will look in a presentation (#156)
    wrapper.insertAdjacentHTML('beforeend', `<button type="button" class="btn btn-tiny chunk-preview" onclick="previewChunk(this)"
      title="See how this part will show in a presentation">Preview</button>`);
    // something to hold to drag the chunk, easy to find with a finger (the whole box works too)
    const grip = document.createElement('span');
    grip.className = 'drag-grip';
    grip.title = 'Drag to move';
    grip.setAttribute('aria-hidden', 'true');
    grip.textContent = '⠿';
    wrapper.appendChild(grip);
    chunk.parentNode.insertBefore(wrapper, chunk);
    wrapper.appendChild(chunk);
  });
  makeChunksSortable(songElement.querySelector("song")); // drag the chunks to reorder them (they are <song>'s children)

  // Update metadata fields
  const updateField = (selector, joinChar = ', ') => {
    const elements = Array.from(songElement.querySelectorAll(selector));
    return elements.map(el => el.textContent).join(joinChar);
  };

  songElement.querySelector('authors').textContent = updateField('author');
  songElement.querySelector('scripture_ref').textContent = updateField('scrip_ref');

  //categories
  const songCategories = songElement.querySelector('categories');
  songCategories.textContent = updateField('cat');
  songCategories.classList.add('contenteditable-disabled');
  songCategories.tabIndex = 0;

  songCategories.addEventListener('click', function() {
    const songEdit = document.getElementById('song-edit');
    songEdit.classList.toggle('sidebar-open');

    setTimeout(() => {
      const searchElement = songEdit.querySelector('.search');
      if (searchElement) {
        searchElement.focus();
      }
    }, 400);
  });

  // Handle CCLI
  const cclisElement = songElement.querySelector('cclis'); // Find the cclis element.

  if (cclisElement) {
    const cclisText = cclisElement.textContent.replace('CCLI Song #: ', '').trim(); // Extract CCLI text.

    const wrapper = document.createElement('div'); // Create wrapper div.
    wrapper.style.marginBottom = '1rem'; // Add margin to wrapper.

    const checkbox = document.createElement('input'); // Create checkbox.
    checkbox.type = 'checkbox';
    checkbox.id = 'ccli-checkbox';
    checkbox.checked = !!cclisText; // Set checkbox state.

    const label = document.createElement('label'); // Create label.
    label.textContent = 'CCLI: ';
    label.htmlFor = 'ccli-checkbox'; // Associate label with checkbox.

    // Insert wrapper before the original cclisElement.
    cclisElement.parentNode.insertBefore(wrapper, cclisElement);

    wrapper.append(label, checkbox, cclisElement); // Add label, checkbox, and cclis to wrapper.

    cclisElement.textContent = isNaN(cclisText) ? '' : cclisText; // Update CCLI text.
    cclisElement.style.display = checkbox.checked ? 'inline-block' : 'none'; // Set CCLI display.

    checkbox.onchange = () => cclisElement.style.display = checkbox.checked ? 'inline-block' : 'none'; // Add checkbox change handler.
  }

  // Load categories
  try {
    const categories = await db.get('categories');
    // search: the name without accents, which is what list.min.js compares the query with
    const options = { valueNames: ['name', { data: ['search'] }], item: 'category-template' };
    const seen = new Set();
    const values = categories.categories
      .filter(cat => !seen.has(cat) && seen.add(cat))
      .map(cat => ({ name: escapeHtml(cat), search: stripAccents(cat) })); // shown as page code by List.js: make it text
    // One list, emptied and refilled each time a song is edited (a new List each time added search
    // listeners that never went away, and kept categories since taken off the church's list)
    if (window.categories_list) {
      window.categories_list.clear();
      window.categories_list.add(values);
    } else {
      window.categories_list = new List('categories', options, values);
      bindSearchToList(window.categories_list, '#categories');
    }
    document.querySelector('#categories .search')?.dispatchEvent(new KeyboardEvent('keyup'));

    // Set checkboxes based on current categories
    const currentCategories = songElement.querySelector('categories').textContent.split(',').map(c => c.trim());
    document.querySelectorAll('#categories [type="checkbox"]').forEach(checkbox => {
      checkbox.checked = currentCategories.includes(checkbox.nextElementSibling.textContent.trim());
    });
  } catch (err) {
    console.error('Error loading categories:', err);
  }

  window.songEditing = true;
  updateAllLinks();

  const elements = songElement.querySelectorAll('.song-title .title_link, authors, scripture_ref, introduction, key, chunk, copyright, cclis');
  convertChunksToEditable(elements);

  // How the editor works, which nothing else shows (UX audit #14); not part of the song (prepSaveSong drops it)
  const firstPart = songElement.querySelector('.wrap');
  if (firstPart && !songElement.querySelector('.edit-hint')) {
    firstPart.insertAdjacentHTML('beforebegin', '<p class="edit-hint">Put chords on their own line above the words, lined up with spaces. '
      + 'Press Enter twice to start a new part; Backspace at the start of a part joins it to the one above. Drag a part to move it. '
      + '<a href="#" contenteditable="false" onclick="openHelp(\'songs\'); return false;">More in Help</a></p>');
  }
  window.songEditSnapshot = songEditState(); // leaving without a change doesn't ask
}
// What the song editor holds, to tell whether anything changed before warning about leaving
function songEditState() {
  const card = document.querySelector('#song .song-card');
  if (!card) return '';
  return JSON.stringify([
    [...card.querySelectorAll('.song-title .title_link, authors, scripture_ref, introduction, key, chunk, copyright, cclis')].map(el => el.textContent),
    [...card.querySelectorAll('.wrap select')].map(select => select.value),
    [...document.querySelectorAll('#categories [type="checkbox"]')].map(box => box.checked),
    !!document.getElementById('ccli-checkbox')?.checked,
  ]);
}
function songEditChanged() { return !window.songEditSnapshot || songEditState() !== window.songEditSnapshot; }
// The song editor's scripture references (#157). While they're typed, a note under the box says how they'll
// be written, and which ones the Bible doesn't know and why. When the box is left, each one it knows is
// written the usual way ("ps 95:1,2" -> "Psalm 95:1, 2"), so they look alike, sort right in the PDF's index
// and show with r in a presentation. One it doesn't know stays as typed, and its note stays.
async function tidySongRefs(field, typing = false) {
  try {
    await Bible.ready();
  } catch (err) {
    return; // offline before the Bible list ever loaded: they stay as typed
  }
  const problems = [];
  const refs = joinScriptureRefs(field.textContent.split(',')).filter(Boolean).map(ref => {
    const found = Bible.parse(ref, Infinity); // a song can cite a long passage
    if (found.error) problems.push(`${ref}: ${found.error}`);
    return found.error ? ref : found.label.replace(/–/g, '-'); // a plain hyphen, as people type it to search
  });
  const text = refs.join(', ');
  const changes = text !== field.textContent.trim();
  if (changes && !typing) field.textContent = text;
  let note = field.nextElementSibling?.classList.contains('ref-note') ? field.nextElementSibling : null;
  if (!problems.length && !(typing && changes && text)) return note?.remove();
  if (!note) {
    note = document.createElement('div');
    note.className = 'ref-note';
    field.after(note);
  }
  note.innerHTML = (typing && changes && text ? `<span>Will show as: ${escapeHtml(text)}</span> ` : '')
    + problems.map(p => `<span class="problem">${escapeHtml(p)}</span>`).join(' ');
}
document.addEventListener('focusout', e => {
  if (window.songEditing && e.target.matches?.('#song scripture_ref.toTextarea')) tidySongRefs(e.target);
});
document.addEventListener('input', e => {
  if (window.songEditing && e.target.matches?.('#song scripture_ref.toTextarea')) tidySongRefs(e.target, true);
});

// The songbook editor's Save button. A failed save keeps the editor open and says why (#1).
async function saveSongbookFromEditor() {
  try {
    await saveSongbook(parseHash('sb-'));
    clearStickyError('save the songbook'); // an earlier failed try's message
  } catch (err) {
    window.songbookEditing = true;
    reportDbError(err, 'save the songbook', { stay: true }); // the editor stays open with the changes
  }
}

// A part being edited, as the song keeps it: <line>s, a chord line folded into the line under it as <c>s.
// Save and the part's preview (#156) both read it this way.
function editedChunkLines(chunk) {
  // Use innerHTML (not textContent) so &lt; and &amp; stay escaped like the old .html() did.
  // Browsers may turn typed newlines into <br> or <div>, so turn those back into \n first.
  const lines = chunk.innerHTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n');
  let prevIsChord = false;
  let content = '';

  lines.forEach((line, index) => {
    if (prevIsChord) {
      content += `<line>${combine(lines[index - 1], line)}</line>`;
      prevIsChord = false;
    } else if (isChord(line)) {
      prevIsChord = true;
    } else if (line.length > 0) { //we have a line
      content += `<line>${line}</line>`;
    }
  });
  // a chord line at the very end has no words under it: keep it as a line of its own, never drop it
  if (prevIsChord && lines[lines.length - 1].trim()) content += `<line>${lines[lines.length - 1]}</line>`;
  return content;
}

// ---- A part's presentation preview, while a song is edited (#156). A part's Preview button opens a floating
// window (index.html #chunkPreview) that drags like the Info window. It shows the part being edited as a
// presentation shows it: presentation.html's own styles in a frame the shape of the screen, the text fitted
// the way presentation.js fits it. It follows the part you click or type in, and changes as you type. A menu
// picks the screen's shape and a switch the chords. The shape, the chords and where it was left are kept
// for next time (on this device). It closes when the editor does.
const PREVIEW_RATIOS = [['16:9', 16 / 9], ['16:10', 16 / 10], ['4:3', 4 / 3]];
const PREVIEW_WIDTH = 1280; // the frame's own width: the text sizes match a big screen's, then it's shrunk to fit
let presentationStyles; // presentation.html's <style>, read once
let previewedChunk = null; // the part the preview shows
let previewTimer;

function previewSetting(name, fallback) {
  try { return localStorage.getItem('chunkPreview.' + name) ?? fallback; } catch { return fallback; }
}
function keepPreviewSetting(name, value) {
  try { localStorage.setItem('chunkPreview.' + name, value); } catch {}
}

// What presentation.js shows for one part (its build_chunk): the title, authors, scripture and key on a
// song's first part, a verse's number, and the copyright on its last. Comments aren't shown, so they
// don't count as first or last, and they're not numbered.
function previewSlideHtml(card, chunk) {
  const parts = [...card.querySelectorAll('song > .wrap > chunk')].filter(c => c.getAttribute('type') !== 'comment');
  const at = parts.indexOf(chunk);
  const type = chunk.getAttribute('type') || 'verse';
  const text = sel => escapeHtml(card.querySelector(sel)?.textContent.trim() || '');
  let html = '';
  if (at === 0) {
    html += `<stitle>${text('.song-title')}</stitle><author>${text('authors')}</author>`
          + `<scripture_ref>${text('scripture_ref')}</scripture_ref><key>${text('key')}</key>`;
  }
  html += `<chunk type="${escapeHtml(type)}">`;
  if (type === 'verse') html += `<span>${parts.slice(0, at).filter(c => c.getAttribute('type') === 'verse').length + 1}:</span>`;
  html += editedChunkLines(chunk) + '</chunk>';
  if (at === parts.length - 1) html += `<copyright>${text('copyright')}</copyright>`;
  return html;
}

// presentation.js scaleText: the biggest text size (in steps) that fits the screen
function fitPreviewSlide(win) {
  const slide = win.document.getElementById('cur_slide');
  const content = slide.querySelector('.content');
  const tooBig = () => slide.scrollWidth > win.innerWidth || slide.scrollHeight > win.innerHeight;
  let small = 50, big = 1500, percent = (big + small) / 2;
  while (big - small > 10) {
    content.style.fontSize = percent + '%';
    if (tooBig()) big = percent;
    else small = percent;
    percent = (big + small) / 2;
  }
  content.style.fontSize = (percent - 10) + '%';
  if (tooBig()) content.style.fontSize = small + '%';
}

// The frame (a big screen's size) shrunk to the window's width
function scalePreviewFrame() {
  const screen = document.querySelector('#chunkPreview .slide-preview');
  if (screen.clientWidth) screen.querySelector('iframe').style.transform = `scale(${screen.clientWidth / PREVIEW_WIDTH})`;
}

// A part's Preview button: open the window (filled once with presentation.html's look) on that part
async function previewChunk(button) {
  const win = document.getElementById('chunkPreview');
  const frame = win.querySelector('iframe');
  previewedChunk = button.closest('.wrap').querySelector('chunk');
  if (!frame.dataset.ready) {
    if (presentationStyles === undefined) {
      try {
        const page = await (await fetch('presentation.html')).text();
        presentationStyles = new DOMParser().parseFromString(page, 'text/html').querySelector('style')?.textContent || '';
      } catch {
        notyf.error("Couldn't load the presentation's look. Try again when you're online.", 'red');
        return;
      }
    }
    win.querySelector('[name="ratio"]').innerHTML = PREVIEW_RATIOS.map(([label]) => `<option>${label}</option>`).join('');
    win.hidden = false; // the frame is measured, so it's shown before it's filled
    const loaded = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${presentationStyles}</style>
      <style>#statusbar, #slides::before, #slides::after { display: none; }</style></head>
      <body class="presentation"><div id="slides"><div id="cur_slide" class="slide"><div class="content"></div></div></div></body></html>`;
    await loaded;
    frame.dataset.ready = '1';
    new ResizeObserver(scalePreviewFrame).observe(win.querySelector('.slide-preview'));
  }
  const opening = win.hidden || !win.dataset.placed;
  win.querySelector('[name="ratio"]').value = previewSetting('ratio', '16:9');
  win.querySelector('[name="chords"]').checked = previewSetting('chords', 'false') === 'true';
  win.hidden = false;
  drawChunkPreview();
  if (opening) { // where it was left, else the bottom right corner (out of the way on a phone); on screen either way
    win.dataset.placed = '1';
    let place = null;
    try { place = JSON.parse(previewSetting('place', 'null')); } catch {}
    const maxX = innerWidth - win.offsetWidth - 8, maxY = innerHeight - win.offsetHeight - 8;
    const [x, y] = Array.isArray(place) ? place : [maxX - 8, maxY - 8];
    win.style.transform = `translate3d(${Math.max(8, Math.min(maxX, x))}px, ${Math.max(8, Math.min(maxY, y))}px, 0)`;
  }
}

// Draw the part again: after typing, another part picked, the shape or the chords changed
function drawChunkPreview() {
  const win = document.getElementById('chunkPreview');
  if (win.hidden) return;
  const chunk = previewedChunk;
  if (!chunk?.isConnected || !window.songEditing) { // the editor closed (saved, cancelled, another page)
    closeChunkPreview();
    return;
  }
  const frame = win.querySelector('iframe');
  const doc = frame.contentDocument;
  if (!doc?.getElementById('cur_slide')) return; // still loading
  const shape = PREVIEW_RATIOS.find(([label]) => label === win.querySelector('[name="ratio"]').value)?.[1] || 16 / 9;
  win.querySelector('.slide-preview').style.aspectRatio = shape;
  frame.style.width = PREVIEW_WIDTH + 'px';
  frame.style.height = Math.round(PREVIEW_WIDTH / shape) + 'px';
  scalePreviewFrame();

  const card = chunk.closest('.song-card');
  const all = [...card.querySelectorAll('song > .wrap > chunk')];
  const typeName = chunk.closest('.wrap').querySelector('select')?.selectedOptions[0]?.text || '';
  win.querySelector('.preview-part').textContent = `${typeName} (${all.indexOf(chunk) + 1} of ${all.length})`;
  all.forEach(c => c.closest('.wrap').classList.toggle('previewed', c === chunk));
  doc.body.className = 'presentation' + (win.querySelector('[name="chords"]').checked ? '' : ' nochords');
  const content = doc.querySelector('#cur_slide .content');
  if (chunk.getAttribute('type') === 'comment') {
    content.innerHTML = `<p style="font-family: sans-serif; color: gray">A comment doesn't show in a presentation.</p>`;
    content.style.fontSize = '400%';
  } else {
    content.innerHTML = previewSlideHtml(card, chunk);
    fitPreviewSlide(frame.contentWindow);
  }
}

function closeChunkPreview() {
  document.getElementById('chunkPreview').hidden = true;
  document.querySelectorAll('#song .wrap.previewed').forEach(wrap => wrap.classList.remove('previewed'));
  previewedChunk = null;
}

// It follows the part you click or type in, and keeps up with your typing (a moment after you stop)
document.addEventListener('focusin', e => {
  const chunk = e.target.closest?.('#song song > .wrap > chunk');
  if (chunk && chunk !== previewedChunk && !document.getElementById('chunkPreview').hidden) {
    previewedChunk = chunk;
    drawChunkPreview();
  }
});
document.addEventListener('input', e => {
  if (!e.target.closest?.('#song')) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(drawChunkPreview, 150);
});
document.addEventListener('change', e => { // a part's type (bindToSongEdit has put it on the part by now)
  if (e.target.matches?.('#song .wrap > select[name="types"]')) drawChunkPreview();
});
window.addEventListener('hashchange', () => setTimeout(drawChunkPreview, 0)); // closes it once the editor has

async function prepSaveSong() {
  if (!document.querySelector('#song .song-card .song-title')?.textContent.trim()) {
    showError('Give the song a title before you save.');
    return;
  }
  else{
    window.songEditing=false;
  }
  // Save from a copy of the editor, so a failed save leaves the editor and its edits in place (#1)
  const editor = document.querySelector('#song .song-card'); // the card: its header holds the title
  const songElement = editor.cloneNode(true);
  songElement.querySelectorAll('.edit-hint').forEach(hint => hint.remove()); // the editor's how-to, not the song
  const ccliCheckbox = document.getElementById('ccli-checkbox');
  const ccliElement = songElement.querySelector('cclis');

  // Hide the editor while saving; a successful save loads the saved song in its place
  editor.style.display = 'none';

  // Process chunks
  songElement.querySelectorAll('chunk').forEach(chunk => { chunk.innerHTML = editedChunkLines(chunk); });

  // Handle CCLI checkbox
  if (ccliCheckbox?.checked && ccliElement) {
    if (!ccliElement.textContent.trim()) {
      ccliElement.textContent = 'on';
    }
  } else if (ccliElement) {
    ccliElement.textContent = '';
  }

  // Save the song
  const openSong = window.song;
  try {
    delete window.song;
    await saveSong(openSong._id, songElement);
    clearStickyError('save the song'); // an earlier failed try's message
  } catch (error) {
    // Back to the editor, edits intact
    window.song = openSong;
    window.songEditing = true;
    editor.style.display = '';
    reportDbError(error, 'save the song', { stay: true }); // the editor stays open with the changes
  }
}
// The export preview's viewer window, once its app has started up (pdf.js says so with initializedPromise).
// Throws if the viewer didn't load (offline, not saved on this device) or doesn't start in time.
async function exportViewerReady(frame, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    const app = frame.contentWindow.PDFViewerApplication; // a page that failed to load can't be read: throws
    if (app?.initializedPromise) {
      await app.initializedPromise;
      return frame.contentWindow;
    }
    if (Date.now() - started > timeoutMs) throw new Error('The PDF viewer did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function prepExport() {
  // Reset progress bar
  const progressBar = document.getElementById('pdf_progress');
  const progressText = document.getElementById('pdf_progress_text');
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  // No PDF yet: the big Download button waits, and the Preview's is empty
  document.getElementById('exportDownload').innerHTML = '<button type="button" class="btn export-download" disabled>&#11123; Download PDF</button>';
  document.getElementById('downloadPDF').innerHTML = '';
  loadExcludeChips();

  // Trigger chords display change
  const chordsDisplay = document.getElementById('display_chords');
  chordsDisplay.dispatchEvent(new Event('change', { bubbles: true }));

  // Reset PDF viewer
  const pdfViewer = document.getElementById('pdf');
  // The frame keeps the last viewer until this one has loaded: remember when it has
  window.exportViewerLoaded = new Promise(resolve => pdfViewer.addEventListener('load', resolve, { once: true }));
  pdfViewer.src = "pdfjs-2.8.335-dist/web/viewer.html?file=";

  // Initialize web worker if not already created
  if (typeof window.pdfFormatter === 'undefined') {
    window.pdfFormatter = await new Worker('pdfformatter.js');

    pdfFormatter.onmessage = async function(e) {
      if (e.data[0] === 'pdf') {
        // Two Download buttons: the big one at the top of the form, and the Preview's (handy in full width)
        const link = (cls, label) => `<a class="btn ${cls}" href="${escapeHtml(e.data[1])}" target="_blank" download="${escapeHtml(window.exportObject.title)}.pdf">${label}</a>`;
        document.getElementById('exportDownload').innerHTML = link('export-download', '&#11123; Download PDF');
        document.getElementById('downloadPDF').innerHTML = link('', 'Download ⭳');

        // Hand the PDF to the new viewer once it has started up: from the offline copy the PDF can be ready
        // first, and a viewer given it too early showed nothing. Offline on a device that hasn't saved the
        // viewer yet it can't open at all: say so, and the Download button still works.
        try {
          await window.exportViewerLoaded;
          (await exportViewerReady(pdfViewer)).yourMethod(e.data[1]);
        } catch (err) {
          console.warn("The export preview couldn't open:", err);
          notyf.error("The preview can't open offline on this device yet. Use Download to see the PDF.");
        }
        console.log('Message received from worker');
        logData('exported', `${window.exportObject._id}: ${JSON.stringify(read_config_form())}`);
      } else if (e.data[0] === 'progress') {
        progressBar.style.width = e.data[1];
        progressText.textContent = e.data[1];
      }
    };
  }

  await loadExportSetups();
}

// The export setups: the Format menu and the Save buttons. Saving or deleting a setup refreshes just
// these (it used to run all of prepExport, which also blanked the preview).
async function loadExportSetups() {
  try {
    const result = await db.allDocs({
      include_docs: true,
      startkey: `cfg-${window.exportObject._id}`,
      endkey: `cfg-${window.exportObject._id}\ufff0`,
    });

    const userIdCfg = `cfg-${window.exportObject._id}${window.user._id}`;
    const cfgButtons = document.getElementById('cfg_buttons');
    cfgButtons.innerHTML = '';

    // The menu's order: your Default, your other setups, other people's, then the built-in ones. The first is
    // what an export starts with (#146, #131).
    let myDefault = '', mine = '', others = '';
    result.rows.forEach(row => {
      const option = label => `<option value="${escapeHtml(JSON.stringify(row.doc.cfg))}">${label}</option>`;
      if (row.doc._id === userIdCfg) {
        myDefault = option(`Your ${escapeHtml(row.doc.name || 'Default')}`);
      } else if (row.doc._id.startsWith(userIdCfg + ':')) { // a named one (saveExport adds ':' and the name)
        // The whole button saves (it used to be only its label); the × deletes. saveExport lights up the
        // new button once the list is rebuilt, since this one is replaced then (#131).
        cfgButtons.insertAdjacentHTML('beforeend', `
          <button class="btn" data-save-name="${escapeHtml(row.doc.name || 'Default')}" onclick="saveExport(this.dataset.saveName);">
            Save as ${escapeHtml(row.doc.name || 'Default')}<span class="export_close" title="Delete this format"
              onclick="event.stopPropagation(); deleteExportCfg(${escapeHtml(JSON.stringify(row.doc._id))});">×</span>
          </button>`);
        mine += option(`Your ${escapeHtml(row.doc.name || 'Default')}`);
      } else {
        const userId = row.doc._id.match(/u-[^:]*/)?.[0]; // up to the ':' of a named setup
        others += option(`${escapeHtml(window.users?.[userId] || userId?.slice(2) || 'Someone')}'s ${escapeHtml(row.doc.name || 'Default')}`);
      }
    });
    let innerHTML = myDefault + mine + others;

    // Add default button
    cfgButtons.insertAdjacentHTML('afterbegin', `
      <button class="btn export-default" data-save-name="" onclick="saveExport('');">Save as Default</button>`);

    // Add predefined options
    const opts = window.export.def_configs;
    for (const opt in opts) {
      innerHTML += `<option value="${escapeHtml(JSON.stringify(opts[opt]))}">${opt}</option>`;
    }
    innerHTML += `<option value='[]'>Custom</option>`;

    // Update format select
    const formatSelect = document.getElementById('format');
    formatSelect.innerHTML = innerHTML;

    // Trigger font face change
    document.getElementById('font_face').dispatchEvent(new Event('change', { bubbles: true }));

    // Handle status visibility
    const exportContainer = document.getElementById('export');
    if (window.songbook.showStatus) {
      exportContainer.classList.add('showStatus');
    } else {
      exportContainer.classList.remove('showStatus');
    }

  } catch (error) {
    reportDbError(error, 'load the export setups');
  }
}
// An export that's just been opened starts with the first setup in the menu: your Default if you saved one,
// else 1-column (#146). (It used to start with the form's built-in values, which match no setup: "Custom".)
function applyFirstExportSetup() {
  const formatSelect = document.getElementById('format');
  if (!formatSelect.options.length) return;
  formatSelect.selectedIndex = 0;
  formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
}
// ---- The export form's controls (UX audit #17). The form's own fields are what a Format saves; these only
// stand in for them, so saved Formats, Copy and Paste are the same as before.
//   .seg[data-for]      a row of buttons for one select or number box: data-values "value=Label|…"; data-other
//                       adds a button that shows the field itself, for any other value; data-custom names the
//                       table of numbers a preset's "Custom" shows
//   select.font-select  the font menus, with plain names
//   #cat_exclude_chips  the categories, to tap in or out of the index's hidden "Leave out" list
const EXPORT_FONTS = [
  ['Times (serif)', [['Times-Roman', 'Times'], ['Times-Bold', 'Times Bold'], ['Times-Italic', 'Times Italic'], ['Times-BoldItalic', 'Times Bold Italic']]],
  ['Helvetica (plain)', [['Helvetica', 'Helvetica'], ['Helvetica-Bold', 'Helvetica Bold'], ['Helvetica-Oblique', 'Helvetica Italic'], ['Helvetica-BoldOblique', 'Helvetica Bold Italic']]],
  ['Courier (typewriter)', [['Courier', 'Courier'], ['Courier-Bold', 'Courier Bold'], ['Courier-Oblique', 'Courier Italic'], ['Courier-BoldOblique', 'Courier Bold Italic']]],
];
function setupExportForm() {
  const form = document.getElementById('export_form');
  if (!form) return;
  // Symbol and ZapfDingbats aren't fonts for words: kept, unlisted, so an old Format that has one still loads
  const fontOptions = EXPORT_FONTS.map(([group, fonts]) => `<optgroup label="${group}">`
      + fonts.map(([value, label]) => `<option value="${value}">${label}</option>`).join('') + '</optgroup>').join('')
    + '<option value="Symbol" hidden>Symbol</option><option value="ZapfDingbats" hidden>ZapfDingbats</option>';
  form.querySelectorAll('select.font-select').forEach(select => {
    select.innerHTML = fontOptions;
    select.value = select.id === 'index_first_line_font' ? 'Times-Italic' : 'Times-Roman';
  });

  form.querySelectorAll('.seg[data-for]').forEach(seg => {
    const field = document.getElementById(seg.dataset.for);
    const choices = seg.dataset.values.split('|').map(pair => pair.split('='));
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', seg.closest('.export-row')?.querySelector('.export-name')?.textContent || '');
    seg.innerHTML = choices.map(([value, label]) => `<button type="button" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`).join('')
      + (seg.dataset.other ? `<button type="button" data-other>${escapeHtml(seg.dataset.other)} ▾</button>` : '')
      + (seg.dataset.custom ? '<button type="button" data-custom>Custom ▾</button>' : '');
    seg.addEventListener('click', e => {
      const button = e.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-other')) {
        seg.classList.add('other-open');
        syncExportForm();
        field.focus();
        return;
      }
      if (button.hasAttribute('data-custom')) {
        // shows the numbers; the menu turns to Custom by itself once one of them is changed
        seg.classList.toggle('custom-open');
        syncExportForm();
        return;
      }
      seg.classList.remove('other-open');
      field.value = button.dataset.value;
      field.dispatchEvent(new Event('change', { bubbles: true })); // the form's change handler syncs
    });
  });

  document.getElementById('cat_exclude_chips').addEventListener('click', e => {
    const chip = e.target.closest('button[data-cat]');
    if (!chip) return;
    const out = excludedCategories();
    const at = out.indexOf(chip.dataset.cat);
    if (at < 0) out.push(chip.dataset.cat);
    else out.splice(at, 1);
    const input = document.getElementById('index_cat_exclude');
    input.value = out.join(',');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const excludedCategories = () => document.getElementById('index_cat_exclude').value.split(',').map(c => c.trim()).filter(Boolean);
const excludeChip = cat => `<button type="button" class="export-chip" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
// The church's categories as chips (headings and lines in the list left out). syncExportForm adds any in the
// "Leave out" list that aren't categories now, so they can still be taken out.
async function loadExcludeChips() {
  let cats = [];
  try {
    cats = (await db.get('categories')).categories || [];
  } catch (err) {
    if (err.status !== 404) console.warn("Couldn't read the categories for the export:", err);
  }
  cats = [...new Set(cats.map(c => String(c).trim()).filter(c => c && !/^-{3,}/.test(c)))];
  document.getElementById('cat_exclude_chips').innerHTML = cats.map(excludeChip).join('');
  syncExportForm();
}
// Brings the stand-ins in line with the fields: after a click, a Format, Paste, or any change
function syncExportForm() {
  const form = document.getElementById('export_form');
  const value = id => document.getElementById(id).value;
  form.querySelectorAll('.seg[data-for]').forEach(seg => {
    const field = document.getElementById(seg.dataset.for);
    let matched = false;
    seg.querySelectorAll('button[data-value]').forEach(button => {
      const on = button.dataset.value === String(field.value);
      button.setAttribute('aria-pressed', String(on));
      if (on) matched = true;
    });
    if (seg.dataset.other) {
      seg.querySelector('[data-other]').setAttribute('aria-pressed', String(!matched));
      seg.classList.toggle('show-field', !matched || seg.classList.contains('other-open'));
    }
    if (seg.dataset.custom) {
      const custom = field.value === 'custom';
      seg.querySelector('[data-custom]').setAttribute('aria-pressed', String(custom));
      document.getElementById(seg.dataset.custom).hidden = !custom && !seg.classList.contains('custom-open');
    }
  });

  form.classList.toggle('paper-phone', value('paper_size') === 'PHONE');
  const booklet = value('page_layout').includes('booklet'); // left and right margins are inside and outside
  form.querySelectorAll('[data-booklet]').forEach(span => {
    span.dataset.plain ??= span.textContent;
    span.textContent = booklet ? span.dataset.booklet : span.dataset.plain;
  });

  const chips = document.getElementById('cat_exclude_chips');
  const out = excludedCategories();
  out.filter(cat => ![...chips.children].some(chip => chip.dataset.cat === cat)).forEach(cat => chips.insertAdjacentHTML('beforeend', excludeChip(cat)));
  chips.querySelectorAll('[data-cat]').forEach(chip => chip.setAttribute('aria-pressed', String(out.includes(chip.dataset.cat))));

  // What's set under "More options", so it can be checked without opening it
  const font = document.getElementById('font_face');
  const preset = id => value(id) === 'custom' ? 'Custom' : value(id)[0].toUpperCase() + value(id).slice(1);
  const pressed = id => form.querySelector(`.seg[data-for="${id}"] [aria-pressed="true"]`)?.textContent;
  const parts = [
    font.options[font.selectedIndex]?.textContent || font.value,
    `${preset('text')} sizes`,
    `${preset('margin')} margins`,
    pressed('page_layout'),
  ];
  if (!document.body.classList.contains('song')) {
    if (value('display_cat_index') !== 'no-index') parts.push('Category index');
    if (value('display_scrip_index') !== 'no-index') parts.push('Scripture index');
    if (document.getElementById('export')?.classList.contains('showStatus')
      && ['print_a', 'print_n', 'print_r'].some(id => document.getElementById(id).checked)) parts.push('Some songs by status');
  }
  if (value('ccli').trim()) parts.push(`CCLI ${value('ccli').trim()}`);
  document.getElementById('export_more_summary').textContent = parts.filter(Boolean).join(' · ');
}
function export_form_summary_update() {
  // Helper function to get element value
  const getValue = (id) => {
    const el = document.getElementById(id);
    return el.type === 'checkbox' ? el.checked : el.value;
  };

  // Helper function to compare arrays
  const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
  };
  const arraysOfObjectsEqual = (a, b) => {
    if (a.length !== b.length) return false;

    // Use every() to check all objects
    return a.every((objA, i) => {
      const objB = b[i];
      // Check if the name and value strings are strictly equal (an old saved true/false read as the form shows it)
      const element = document.getElementById(objB.name);
      return objA.name === objB.name &&
        (element ? exportSettingValue(element, objA.value) === exportSettingValue(element, objB.value) : objA.value === objB.value);
    });
  };

  // Update format select
  const formatSelect = document.getElementById('format');
  formatSelect.value = JSON.stringify([]);
  for (const option of formatSelect.options) {
    const values = JSON.parse(option.value);
    if (values.length === 0) continue;

    const opts = values.map(item => ({
      name: item.name,
      value: getValue(item.name)
    }));
    if (arraysOfObjectsEqual(opts, values)) {
      formatSelect.value = option.value;
      break; // first match wins, so "Your Default" shows ahead of a built-in preset
    }
  }

  // Which margin preset the numbers match
  const margins = [
    parseFloat(document.getElementById('paper_margin_top').value),
    parseFloat(document.getElementById('paper_margin_right').value),
    parseFloat(document.getElementById('paper_margin_bottom').value),
    parseFloat(document.getElementById('paper_margin_left').value),
    parseFloat(document.getElementById('column_gutter').value),
    parseFloat(document.getElementById('paper_margin_gutter').value)
  ];
  
  const marginName = Object.entries(window.export.margins).find(([name, values]) => 
    arraysEqual(values, margins)
  )?.[0] || 'custom';

  document.getElementById('margin').value = marginName;

  // Which text size preset the numbers match
  const textValues = window.export.text.default.map(item => ({
    name: item.name,
    value: getValue(item.name)
  }));

  const textName = Object.entries(window.export.text).find(([name, values]) => 
    arraysOfObjectsEqual(values, textValues)
  )?.[0] || 'custom';


  document.getElementById('text').value = textName;

  // Which index size preset the numbers match
  const indexValues = window.export.index.default.map(item => ({
    name: item.name,
    value: getValue(item.name)
  }));

  const indexName = Object.entries(window.export.index).find(([name, values]) => 
    arraysOfObjectsEqual(values, indexValues)
  )?.[0] || 'custom';

  document.getElementById('index').value = indexName;

  syncExportForm(); // the button rows, the tables and the "More options" summary

  // Auto refresh
  if (document.getElementById('auto_refresh').checked) {
    clearTimeout(window.exportTimeout);
    window.exportTimeout = setTimeout(() => {
      pdfFormatter.postMessage([window.exportObject, read_config_form()]);
    }, 200);
  }
}
function read_config_form(){
  // Like jQuery serializeArray: checked boxes read 'on', unchecked and disabled fields are left out.
  // pdfformatter.js tests for 'on', so serializeForm's true/false values won't do here.
  let new_opts = {};
  for(let [name, value] of new FormData(document.getElementById('export_form'))) {
    new_opts[name] = value;
  }
  return new_opts;
}
// The id of the row before or after the open one in a list (a songbook's songs, or the songbooks), as the
// list shows it now; section headings and readings are skipped. null at either end.
function neighborRow(listSel, idKey, currentId, before) {
  const ids = [...document.querySelectorAll(`${listSel} > li`)].map(li => li.dataset[idKey]).filter(id => id && !isBookExtra(id));
  const at = ids.indexOf(currentId);
  if (at < 0) return null;
  return ids[before ? at - 1 : at + 1] || null;
}

// Touch gestures on a phone. The side panels (Song Categories, "Add songs", the export Preview) open and
// close with a sideways swipe or a tap on their tab ('right'); the columns pull down to close, slide out the
// column behind, or swipe to the next song ('top').
// A touch is either a scroll or a swipe, decided by its first few pixels of movement. Once it goes up or
// down it's a scroll and nothing here moves, so scrolling a list never opens or closes a panel. Nothing is
// moved until a touch is known to be a swipe, and everything moved is put back if it's cancelled.
const isPhone = () => window.matchMedia('(max-width: 39.99rem)').matches; // the phone layout in style.css
// The first song opened on a phone says the swipe is there (UX audit #15): once per device, then never again
function swipeHintOnce() {
  if (!isPhone()) return;
  try {
    if (localStorage.getItem('yCantaSwipeHint')) return;
    localStorage.setItem('yCantaSwipeHint', '1');
  } catch (err) { return; } // a private window: no way to say "once", so don't say it every time
  setTimeout(() => notyf.open({
    type: 'info',
    duration: 6000,
    background: 'var(--song-color)',
    message: 'Tip: swipe sideways on a song for the next or previous one. Help, in the menu under your name, has more.',
  }), 800);
}
function makeDraggable(dragEl, dragAction, dragSide='right') {
  const DECIDE = 10;    // px of movement before a touch counts as a scroll or a swipe
  const SIDEWAYS = 1.5; // a swipe goes at least this much more sideways than up or down
  let armed = false;    // this touch may become a swipe
  let axis = null;      // 'x' sideways, 'y' up or down, null not decided yet
  let startx = 0, starty = 0, baseX = 0, baseY = 0;
  let active = null, slideoutEl = null, row = null;
  let dragTop = false, slideout = false, slideback = false, navigate = false;

  const at = el => { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return [m.m41, m.m42]; };

  // the swipe has begun: things follow the finger with no animation
  function begin() {
    // a side panel shows in full while it's dragged, not just its tab (style.css)
    if (dragSide === 'right') dragEl.classList.add('sidebar-dragging');
    if (dragSide === 'right' || dragTop) {
      dragEl.style.transition = 'all 0s';
      if (dragTop && active) active.style.transition = 'all 0s';
    } else if (slideout) {
      slideoutEl.style.transition = 'all 0s';
    } else if (slideback) {
      dragEl.style.transition = 'all 0s';
    } else if (navigate) {
      row.style.transition = 'transform 0s';
    }
  }
  // put back everything the swipe moved, so the page's own layout takes over again
  function putBack() {
    if (dragSide === 'right') dragEl.classList.remove('sidebar-dragging');
    if (dragSide === 'right' || dragTop) {
      dragEl.style.removeProperty('transform');
      dragEl.style.removeProperty('transition');
      if (dragTop && active) {
        active.style.removeProperty('transform');
        active.style.removeProperty('transition');
      }
    } else if (slideout) {
      slideoutEl.removeAttribute('style');
    } else if (slideback) {
      dragEl.removeAttribute('style');
      dragEl.classList.add('slidout');
    } else if (navigate) {
      row.removeAttribute('style');
    }
  }

  dragEl.addEventListener('touchstart', function(e) {
    armed = false;
    axis = null;
    dragTop = slideout = slideback = navigate = false;
    if (!isPhone() || e.touches.length > 1) return; // not the phone layout, or a pinch
    const touch = e.changedTouches[0];
    startx = touch.clientX;
    starty = touch.clientY;

    if (dragSide === 'right') {
      const inUse = (window.songEditing && e.target.closest('#song')) ||
                    (window.songbookEditing && e.target.closest('#songList')) ||
                    e.target.closest('#export');
      // a closed panel swipes open from its tab (all that shows of it); an open one from anywhere on it
      if (!inUse || (!dragEl.classList.contains('sidebar-open') && !e.target.closest('.sidebar-tab'))) return;
      baseX = at(dragEl)[0];
      armed = true;
      return;
    }

    // 'top': not over a side panel (it has its own swipe)
    if (e.target.closest('.sidebar')) return;
    const editing = window.songEditing || window.songbookEditing;
    active = document.getElementsByClassName('active')[0];
    if (active === dragEl) active = null;
    slideoutEl = (!document.body.classList.contains('song') && document.body.classList.contains('export') ?
                  dragEl.previousElementSibling.previousElementSibling : dragEl.previousElementSibling);
    row = dragEl.getElementsByClassName('row')[0];
    [baseX, baseY] = at(dragEl);
    if (starty < remToPx(7.5)) {
      dragTop = true; // pull down to close, editing too (leaving an editor asks about unsaved changes)
    } else if (editing) {
      return; // the sideways gestures aren't used while editing
    } else if (dragEl.classList.contains('slidout')) {
      slideback = true;
    } else if (startx < window.innerWidth / 5) {
      slideout = true;
    } else if (window.innerWidth * .25 < startx && startx < window.innerWidth * .75 && row &&
               (document.body.classList.contains('song') ? dragEl.id === 'song' :
                 dragEl.id === 'songList' && document.body.classList.contains('songList') && !document.body.classList.contains('export'))) {
      navigate = true; // a song: to the next or previous song; a songbook's list: to the next or previous songbook
    } else {
      return;
    }
    armed = true;
  }, {passive: true});

  dragEl.addEventListener('touchmove', function(e) {
    if (!armed) return;
    if (e.touches.length > 1 || window.sortableHolding) { // a pinch, or a row being dragged: not a swipe
      if (axis) putBack();
      armed = false;
      return;
    }
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startx;
    const dy = touch.clientY - starty;

    if (!axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DECIDE) return;
      axis = Math.abs(dx) > SIDEWAYS * Math.abs(dy) ? 'x' : 'y';
      // a pull-down goes down; everything else here goes sideways. Anything else is a scroll: let it be.
      if (axis !== (dragTop ? 'y' : 'x')) {
        armed = false;
        return;
      }
      begin();
    }
    if (e.cancelable) e.preventDefault(); // it's a swipe: the page doesn't scroll along with it

    const dist = baseX + dx;
    if (dragSide === 'right') {
      dragEl.style.transform = 'translate3d(' + Math.min(Math.max(dist, 0), dragEl.offsetWidth) + 'px, 0, 0)';
    } else if (dragTop) {
      const disty = Math.max(baseY + dy, 0);
      dragEl.style.transform = 'translate3d(0,' + disty + 'px, 0)';
      if (active) {
        active.style.transform = 'translate3d(0, calc(' + disty + 'px + 4rem), 0)';
      }
    } else if (slideout) {
      if (dist > 25) {
        slideoutEl.style.transform = 'translate3d(' + -(dist - 25) * 4 + 'px, 0, 0)';
      }
    } else if (slideback) {
      if (dist < -25) {
        dragEl.classList.remove('slidout');
        dragEl.style.transform = 'translate3d(' + (dist + 25) * 4 + 'px, 8rem, 0)';
        dragEl.style.width = 'min(80%, 300px)';
        dragEl.style.height = 'calc(100vh - 8rem)';
        dragEl.style['z-index'] = dist < -100 ? '2' : '7';
      }
    } else if (navigate) {
      if (Math.abs(dist) > 50) {
        row.style.transform = 'translate3d(' + dist + 'px, 0, 0)';
        row.style.opacity = '0.5';
      }
    }
  }, false);

  dragEl.addEventListener('touchend', function(e) {
    const swiped = armed && axis;
    armed = false;
    if (!swiped) return; // a tap or a scroll: nothing was moved
    const touch = e.changedTouches[0];
    const dx = touch.clientX - startx;
    const dy = touch.clientY - starty;

    if (dragSide === 'right') {
      // open with a swipe left and close with a swipe right, a quarter of the panel's width or more
      const open = dragEl.classList.contains('sidebar-open');
      const far = Math.max(50, dragEl.offsetWidth / 4);
      if ((!open && dx < -far) || (open && dx > far)) {
        dragAction(dragEl);
        if (e.cancelable) e.preventDefault();
      }
      putBack();
    } else if (slideback) {
      if (dx < -100) {
        if (e.cancelable) e.preventDefault();
        dragEl.removeAttribute('style'); // stays slid back
      } else {
        putBack();
      }
    } else if (slideout) {
      if (dx > 100) {
        if (e.cancelable) e.preventDefault();
        slideoutEl.classList.add('slidout');
      }
      slideoutEl.removeAttribute('style');
    } else if (navigate) {
      if (Math.abs(dx) > 100) {
        if (e.cancelable) e.preventDefault();
        // a swipe right goes back (the one before), a swipe left goes on (the one after); past either end, up
        const back = dx > 0;
        const songView = dragEl.id === 'song';
        const neighbor = songView ? neighborRow('#songbook_content ul.list', 'songId', window.song._id, back)
                                  : neighborRow('#songbooks_container ul.list', 'songbookId', window.songbook._id, back);
        if (neighbor) {
          row.style.transform = back ? 'translate3d(-100%, 0, 0)' : 'translate3d(100%, 0, 0)';
          location.hash = songView ? '#' + formatSbID(window.songbook._id) + '&' + neighbor : '#' + neighbor;
        } else {
          location.hash = songView ? '#' + formatSbID(window.songbook._id) : '#songbooks';
        }
      }
      setTimeout(() => row.removeAttribute('style'), 30);
    } else if (dragTop) {
      if (dy > 200) { // pulled down far enough: close this column
        dragAction();
        if (e.cancelable) e.preventDefault();
        // right after the move (and its "are you sure?" when editing): it slides on to the new page, or, when
        // the move was cancelled to keep editing, back to where it was
        setTimeout(putBack, 0);
        return;
      }
      putBack();
    }
  }, false);

  // the browser took the touch over (or a call, an alert): put everything back
  dragEl.addEventListener('touchcancel', function() {
    if (armed && axis) putBack();
    armed = false;
  }, false);
}

window.addEventListener('load', function() {
  // For side panels that toggle open/closed
  makeDraggable(document.getElementById('song-edit'), function(el) {
    el.classList.toggle('sidebar-open');
  });
  makeDraggable(document.getElementById('songListEdit'), function(el) {
    el.classList.toggle('sidebar-open');
  });
  makeDraggable(document.getElementById('exportPreview'), function(el) {
    el.classList.toggle('sidebar-open');
  });

  // For main panels that navigate on drag
  makeDraggable(document.getElementById('songbookList'), function() {
    window.location.hash = '';
  }, 'top');
  makeDraggable(document.getElementById('songList'), function() {
    window.location.hash = '#songbooks';
  }, 'top');
  makeDraggable(document.getElementById('song'), function() {
    window.location.hash = '#' + formatSbID(window.songbook._id);
  }, 'top');
  makeDraggable(document.getElementById('export'), closeExport, 'top');
}, false);

// The export's band (index.html): make the PDF again, or leave the export for the page it was opened from
function generatePdf() {
  pdfFormatter.postMessage([window.exportObject, read_config_form()]);
}
function closeExport() {
  window.location.hash = window.location.hash.replace('?export', '');
}


function bindSearch(element, search_prefix) {
  document.body.addEventListener('click', function(event) {
    // Check if clicked element matches selector and we're not in edit/export modes
    const target = event.target.closest(element); // the click may land on a <mark> inside it
    if (target) {
      if (window.songEditing || window.songbookEditing || document.body.classList.contains('export')) {
        return;
      }
      
      // Get search input and set value
      const searchInput = document.querySelector('#songbook_content .search');
      if (searchInput) {
        searchInput.value = `"${search_prefix + target.textContent}"`;
        
        // Trigger keyup event
        const keyupEvent = new KeyboardEvent('keyup', {
          bubbles: true,
          cancelable: true
        });
        searchInput.dispatchEvent(keyupEvent);
      }
    }
  });
}

function confirmWhenEditing(oldHashList, newHashList) {
  // Early return if not editing
  if (!window.songEditing && !window.songbookEditing) {
    return false;
  }

  const confirmMessages = [];
  const changes = [];

  // Check song editing state
  if (window.songEditing) {
    const songTitle = document.querySelector('#song .song-title a')?.textContent || 'Current Song';
    // No oldHashList means a direct call (e.g. logout), so always ask, if anything changed
    if (!oldHashList || oldHashList[1]?.[1] === 'edit') {
      if (songEditChanged()) {
        confirmMessages.push('songEditing');
        changes.push(`Song: ${songTitle}`);
      } else { // nothing changed: just leave the editor, as a confirmed leave does
        window.songEditing = false;
        window.song._id = '';
      }
    }
  }

  // Check songbook editing state
  if (window.songbookEditing) {
    const songbookTitle = document.getElementById('songbook_title')?.textContent || 'Current Songbook';
    if (!oldHashList || (oldHashList[0]?.[1] === 'edit' &&
        oldHashList[0].join() !== newHashList?.[0]?.join())) {
      confirmMessages.push('songbookEditing');
      changes.push(`Songbook: ${songbookTitle}`);
    }
  }

  // If there are changes to confirm
  if (confirmMessages.length > 0) {
    const message = `If you leave this page, you will lose your changes to:\n- ${changes.join('\n- ')}`;
    
    if (confirm(message)) {
      // User confirmed - reset editing states
      confirmMessages.forEach(state => {
        window[state] = false;
        if (state === 'songEditing') {
          window.song._id = '';
        } else if (state === 'songbookEditing') {
          window.songbook._id = '';
        }
      });
      return false;
    } else {
      // User cancelled - reset column styles and return true to prevent navigation
      document.querySelectorAll('.column').forEach(column => {
        column.removeAttribute('style');
      });
      return true;
    }
  }
  return false;
}

//fun little function for counting syllables.  Need to create breaks in the line instead... if we were to use this for Chord positioning.
function count(word) {
  word = word.toLowerCase(); 
  word = word.replace(/(?:[^laeiouy]|ed|[^laeiouy]e)$/, ''); 
  word = word.replace(/^y/, ''); 
  //return word.match(/[aeiouy]{1,2}/g).length; 
  var syl = word.match(/[aeiouy]{1,2}/g);
  console.log(syl);
  if(syl) {
    //console.log(syl);
    return syl.length;
  }
}

async function songInSongbooks(song_id){
  let result = await db.allDocs({
    include_docs: true,
    startkey: 'sb-',
    endkey: 'sb-\ufff0',
  });
  return result.rows.filter(sb => sb.doc.songrefs.map(ref => ref.id).indexOf(song_id) > -1);  
}

// Define a function to format the date with desired format
function formatDate(date) {
  return new Date(date).toLocaleTimeString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadInfo(song = true) {
  const dialog = document.getElementById('dialog');
  dialog.setAttribute('data-use', 'info');

  // Helper function to create info content
  // Church admins can change who it belongs to (#120); not a deleted song, or All Songs and Favorite Songs
  const doc = song ? window.song : window.songbook;
  const ownerButton = window.church?.admin && doc?._rev && !doc._deleted
    ? ` <button class="btn btn-tiny" onclick="changeOwner(${song})" title="Change who it belongs to">Change</button>` : '';
  const createInfoContent = (title, addedBy, addedDate, editedBy, editedDate, extraContent = '') => {
    return `
      <small>Added by: ${escapeHtml(addedBy || '')}${ownerButton}<br>${formatDate(addedDate)}</small><br>
      <small>Edited by: ${editedBy}<br>${formatDate(editedDate)}</small><br>
      ${extraContent}`;
  };

  // Helper function to show dialog
  const showDialog = (title, content) => {
    dialog.querySelector('h5').textContent = song ? 'Song' : 'Songbook';
    dialog.querySelector('.title').textContent = title;
    dialog.querySelector('.content').innerHTML = content;
    if (dialog.style.display === 'none') {
      slideDown(dialog);
    }
  };

  if (song) {
    // Song info
    const songId = window.song._id;
    // The kept old versions (#138) and older revisions on this device, newest first. The list asks the
    // server, so the window opens first and the arrows fill in when it answers.
    const versionControls = ({ list, complete }) => {
      const revs = list.map(version => version.rev);
      const revNum = Math.max(0, revs.indexOf(window.song_rev));
      return `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button onclick="prevSongRev();" style="width:1.75rem" 
          ${revNum !== revs.length - 1 ? 'class="btn btn-tiny"' : ''}>
          ${revNum !== revs.length - 1 ? '<<' : ''}
        </button>
        <small>Edit ${revs.length - revNum} / ${revs.length}${complete ? '' : '<br>(connect to see all)'}</small>
        <button onclick="nextSongRev();" style="width:1.75rem" 
          ${revNum !== 0 ? 'class="btn btn-tiny"' : 'class="btn-tiny"'}>
          ${revNum !== 0 ? '>>' : ''}
        </button>
      </div>`;
    };
    const versions = window.song._versions;
    const revisionControls = `<div class="song-versions">${versions ? versionControls(versions) : '<small>Looking for old versions…</small>'}</div>
      <button class="btn btn-tiny" onclick="showHistory(window.song._id, window.song.title)">Old versions</button>`;

    // Get songbooks containing this song
    let songbooks = [];
    let songbooksFailed = false;
    try {
      songbooks = await songInSongbooks(songId);
    } catch (err) {
      reportDbError(err, 'check which songbooks use this song');
      songbooksFailed = true;
    }
    let songbookContent = '<div class="left"><br><b>Used in:</b><br>';

    if (songbooksFailed) {
      songbookContent += "Couldn't check";
    } else if (songbooks.length > 0) {
      songbookContent += songbooks.map(sb => 
        `<a href="#${escapeHtml(sb.doc._id)}&${escapeHtml(window.song._id)}">${escapeHtml(sb.doc.title)}</a>`
      ).join('<br>');
    } else {
      songbookContent += 'Not used in any songbook';
    }
    songbookContent += '</div>';

    // Show dialog with song info
    showDialog(
      window.song.title,
      createInfoContent(
        window.song.title,
        window.users[window.song.addedBy] || window.song.addedBy?.replace(/^u-/, ''),
        window.song.added,
        window.users[window.song.editedBy] || window.song.editedBy.slice(2),
        window.song.edited,
        revisionControls + songbookContent
      )
    );
    if (!versions) {
      const song = window.song;
      const found = await songVersions();
      const box = dialog.querySelector('.song-versions');
      if (box && window.song === song) box.innerHTML = versionControls(found); // still this song's info
    }
  } else {
    // Songbook info
    const revisionInfo = window.songbook._rev
      ? `<button class="btn btn-tiny" onclick="showHistory(window.songbook._id, window.songbook.title)">Old versions</button>`
      : ''; // All Songs and Favorite Songs aren't saved, so they have none

    // Show dialog with songbook info
    showDialog(
      window.songbook.title,
      createInfoContent(
        window.songbook.title,
        window.users[window.songbook.addedBy] || window.songbook.addedBy?.replace(/^u-/, ''),
        window.songbook.added,
        window.users[window.songbook.editedBy] || window.songbook.editedBy?.replace(/^u-/, ''),
        window.songbook.edited,
        revisionInfo
      )
    );
  }
}

// Step through window.song._versions (see songVersions in db.js)
function stepSongRev(step) {
  const list = window.song?._versions?.list || [];
  const next = list[list.findIndex(version => version.rev === window.song_rev) + step];
  if (next) loadSong(window.song._id, next.rev).catch(() => {}); // already reported
}
function prevSongRev() { stepSongRev(1); }
function nextSongRev() { stepSongRev(-1); }

// The video player (#140) lives in its own box (#playerDock in index.html), apart from the Info window, so
// both can be open, and it keeps playing while you move between songs. It has three looks: a floating
// window ('dialog'), a pill beside the floating button ('pill'), and a tab tucked on the screen's edge
// ('tab'). Only CSS changes between them: YouTube's iframe is never moved, so it never reloads.
const youtubeIds = links => links.map(link => link.match(/(be\/|v\=)([-\w]+)\S/)[0].replace('be/','').replace('v=',''));

function setPlayerLook(look, side) {
  const dock = document.getElementById('playerDock');
  if (look === 'tab') {
    // the tab sits at the height the window was flung from
    if (dock.dataset.look === 'dialog') {
      const y = new DOMMatrixReadOnly(getComputedStyle(dock).transform).m42;
      dock.style.setProperty('--tab-y', Math.min(Math.max(y, remToPx(.5)), window.innerHeight - remToPx(7.5)) + 'px');
    }
    dock.dataset.side = side || dock.dataset.side || 'right';
  }
  // While the pill rises into place, the video keeps the window's size and is only drawn smaller (a CSS
  // scale). Once it's there (data-landed) it takes the pill's real size: one resize, not one per step,
  // which was slow on a phone, and YouTube shows its small player instead of a shrunken copy of the big one.
  clearTimeout(dock.landTimer);
  delete dock.dataset.landed;
  const frame = dock.querySelector('.player-video iframe');
  if (dock.dataset.look === 'dialog' && look !== 'dialog' && frame) {
    const r = frame.getBoundingClientRect();
    if (r.height) {
      dock.style.setProperty('--video-w', r.width + 'px');
      dock.style.setProperty('--video-h', r.height + 'px');
      dock.style.setProperty('--video-scale', remToPx(3) / r.height); // to the pill's height (3rem)
    }
  }
  // the pill's width is measured first, so it shows up at its width instead of easing to it
  if (look === 'pill') placePill(true);
  dock.dataset.look = look;
  if (look === 'pill') dock.landTimer = setTimeout(() => { dock.dataset.landed = ''; }, 200); // after the .18s rise
  document.body.classList.toggle('player-pill', !dock.hidden && look === 'pill');
  if (look === 'dialog') {
    // back on screen: where it was, pulled in from any edge it was flung past
    const m = new DOMMatrixReadOnly(getComputedStyle(dock).transform);
    const w = dock.offsetWidth, h = dock.offsetHeight;
    const gap = remToPx(.5);
    const x = Math.min(Math.max(m.m41, gap), window.innerWidth - w - gap);
    const y = Math.min(Math.max(m.m42, gap), window.innerHeight - h - gap);
    dock.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }
}

// The pill spans the page and stops short of the floating button showing at the bottom right, if there is
// one. Its width changes from page to page (a round "+", or a labeled button like "Add SB" or "Close"), so
// it's measured each time. ahead: measured just before the player turns into the pill.
function placePill(ahead = false) {
  const dock = document.getElementById('playerDock');
  if (!dock || dock.hidden || (dock.dataset.look !== 'pill' && !ahead)) return;
  let left = window.innerWidth;
  document.querySelectorAll('.float-menu > :last-child').forEach(button => {
    const r = button.getBoundingClientRect();
    if (!r.width || r.left < 0 || r.right > window.innerWidth + 1 || r.bottom < window.innerHeight - 100 || r.top >= window.innerHeight) return;
    // only the one on top: other pages' buttons can sit at the same spot, hidden under this page (the
    // pill itself may be over it, from the page before)
    const onTop = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).find(el => !dock.contains(el));
    if (!button.contains(onTop)) return;
    left = Math.min(left, r.left);
  });
  // With no button it spans the page like the rest of its content (1rem in from each side), clear of a
  // scrollbar if the page shows one (phones don't)
  let scrollbar = 0;
  for (let el = document.elementsFromPoint(window.innerWidth / 2, window.innerHeight / 2).find(e => !dock.contains(e)); el; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) { scrollbar = el.offsetWidth - el.clientWidth; break; }
  }
  const edge = remToPx(1) + scrollbar;
  dock.style.setProperty('--pill-right', (left < window.innerWidth ? Math.max(edge, window.innerWidth - left + remToPx(.5)) : edge) + 'px');
}
window.addEventListener('resize', placePill);
// on a page change, only once the columns have slid into place: measured during the slide, the new page's
// button isn't there yet and the pill would stretch, then shrink back
window.addEventListener('hashchange', () => { setTimeout(placePill, 450); setTimeout(placePill, 900); });

// the floating player came to rest after a drag: flung more than half off a side, it tucks into a tab there
function playerDockSettled(x) {
  const dock = document.getElementById('playerDock');
  if (dock.dataset.look !== 'dialog') return;
  const w = dock.offsetWidth;
  if (x < -w / 2) setPlayerLook('tab', 'left');
  else if (x > window.innerWidth - w / 2) setPlayerLook('tab', 'right');
}
// a fling that would carry it more than half off a side tucks it into the tab right away
function playerDockFlung(x) {
  const dock = document.getElementById('playerDock');
  const w = dock.offsetWidth;
  if (x < -w / 2 || x > window.innerWidth - w / 2) {
    playerDockSettled(x);
    return true;
  }
  return false;
}

function closePlayer() {
  pauseVideo();
  const dock = document.getElementById('playerDock');
  dock.hidden = true;
  document.body.classList.remove('player-pill');
}

// a sideways swipe on the pill tucks it into a tab on that side, low on the screen
(() => {
  const dock = document.getElementById('playerDock');
  if (!dock) return;
  let startX = null, startY = 0;
  dock.addEventListener('touchstart', e => {
    startX = dock.dataset.look === 'pill' ? e.touches[0].clientX : null;
    startY = e.touches[0].clientY;
  }, { passive: true });
  dock.addEventListener('touchend', e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX, dy = e.changedTouches[0].clientY - startY;
    startX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) {
      dock.style.setProperty('--tab-y', (window.innerHeight - remToPx(11)) + 'px');
      setPlayerLook('tab', dx > 0 ? 'right' : 'left');
    }
  });
})();

// The tab drags up and down its side. Pulled out toward the middle (4rem or more), it opens as the window
// where it's let go; pulled less, it slides back to its edge. A tap still presses its buttons.
(() => {
  const dock = document.getElementById('playerDock');
  if (!dock) return;
  let start = null, moved = false;
  const pulled = e => Math.max(0, (e.clientX - start.x) * (dock.dataset.side === 'left' ? 1 : -1)); // toward the middle
  dock.addEventListener('pointerdown', e => {
    if (dock.dataset.look !== 'tab' || !e.isPrimary) return;
    start = { x: e.clientX, y: e.clientY, top: dock.getBoundingClientRect().top, id: e.pointerId };
    moved = false;
  });
  // on the whole window, so a quick mouse that's already off the tab still drags it
  window.addEventListener('pointermove', e => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < remToPx(.5)) return; // a tap that wobbles is still a tap
    moved = true;
    const gap = remToPx(.5);
    dock.style.setProperty('--tab-y', Math.min(Math.max(start.top + dy, gap), window.innerHeight - dock.offsetHeight - gap) + 'px');
    dock.style.translate = (dock.dataset.side === 'left' ? 1 : -1) * pulled(e) + 'px 0';
  });
  const end = e => {
    if (!start || e.pointerId !== start.id) return;
    const out = moved && e.type === 'pointerup' && pulled(e) >= remToPx(4);
    start = null;
    dock.style.translate = '';
    if (moved) setTimeout(() => { moved = false; }, 0); // after the click this drag may make
    if (!out) return;
    // the window opens centered on where the finger let go (setPlayerLook keeps it on the screen)
    setPlayerLook('dialog');
    dock.style.transform = `translate3d(${e.clientX - dock.offsetWidth / 2}px, ${e.clientY - dock.offsetHeight / 3}px, 0)`;
    setPlayerLook('dialog');
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  // a drag that ends over one of its buttons doesn't press it
  dock.addEventListener('click', e => {
    if (!moved) return;
    moved = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
})();

// the title in the player opens the song that's playing
function openPlayingSong() {
  const hash = document.getElementById('playerDock').dataset.songHash;
  if (hash && location.hash !== hash) location.hash = hash;
}

// A song's own YouTube links; or, for a song with none, the top results of a YouTube search for its title
// and authors (#151), done by the analytics Apps Script (analytics-backend/Youtube.gs), which keeps them a
// month. Here they're kept for the visit, so ▶ again doesn't ask again.
const youtubeSearches = {};
async function songVideoIds(song, button) {
  const own = youtubeIds(window.youtube_links || []);
  if (own.length) return { ids: own, found: false };
  if (youtubeSearches[song._id]) return youtubeSearches[song._id];
  if (!navigator.onLine) throw new Error("You're offline, so YouTube can't be searched.");
  const authors = Array.isArray(song.authors) ? song.authors.join(' ') : '';
  button?.classList.add('searching');
  try {
    const response = await fetch(window.analyticsURL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // no CORS preflight, which Apps Script can't answer
      body: JSON.stringify({ action: 'search', query: `${String(song.title || '')} ${authors}`.trim() }),
    });
    const answer = await response.json();
    if (answer.error) throw new Error(answer.error);
    const results = (answer.results || []).filter(result => /^[-\w]{11}$/.test(result.videoId));
    if (!results.length) throw new Error('YouTube found no videos for this song.');
    return youtubeSearches[song._id] = {
      ids: results.map(result => result.videoId),
      titles: Object.fromEntries(results.map(result => [result.videoId, result.title])), // shown before play
      found: true,
    };
  } catch (err) {
    throw err instanceof TypeError || err instanceof SyntaxError ? new Error("Couldn't reach YouTube search. Try again later.") : err;
  } finally {
    button?.classList.remove('searching');
  }
}

// "Keep this video" (the player, on found videos): the song gets the playing video as a comment line, the
// way links are written in songs, so it plays that from now on without a search
async function keepFoundVideo() {
  const dock = document.getElementById('playerDock');
  const videoId = window.player?.getVideoData?.()?.video_id;
  if (!videoId) return;
  try {
    const doc = await db.get(dock.dataset.songId);
    if (!canEdit(doc)) throw new Error("You're not allowed to change this song.");
    if (!Array.isArray(doc.content)) throw new Error("This song can't take a link here. Add it in the editor.");
    doc.content.push([{ type: 'comment' }, ['https://www.youtube.com/watch?v=' + videoId]]);
    await saveWithHistory(savedByMe(doc));
    logData('video-keep', `${doc._id} ${videoId}`);
    delete youtubeSearches[doc._id];
    dock.classList.remove('found');
    notyf.success('Kept: this song now plays that video.');
  } catch (err) {
    notyf.error(err.message || String(err));
  }
}

async function loadSongPlayer(event) {
  const dock = document.getElementById('playerDock');
  const song = window.song, hash = location.hash; // as when ▶ was pressed, even if a search takes a moment
  let videos;
  try {
    videos = await songVideoIds(song, event?.currentTarget);
  } catch (err) {
    logData('video-search', `${song._id}: ${err.message}`); // analytics: searches that found nothing too
    notyf.error(err.message);
    return;
  }
  logData(videos.found ? 'video-search' : 'video-play', song._id); // analytics: which songs people listen to
  const ids = videos.ids;
  const sameSong = dock.dataset.songId === song._id && dock.dataset.ids === ids.join(' ');
  dock.dataset.songId = song._id;
  dock.dataset.ids = ids.join(' ');
  dock.dataset.songHash = hash;
  dock.classList.toggle('found', videos.found); // "Results from YouTube", and Keep for those who can edit
  dock.classList.toggle('can-keep', videos.found && canEdit(song));
  dock.querySelector('.player-title').textContent = song.title;
  const wasHidden = dock.hidden;
  dock.hidden = false;
  if (wasHidden) {
    // a fresh start: the floating window, at the top middle like the Info window
    dock.dataset.look = 'dialog';
    dock.style.transform = `translate3d(calc(50vw - 50%), 4rem, 0)`;
  }
  setPlayerLook('dialog');

  // Already a player: swap this song's videos in. A playing one goes straight on to the new song.
  if (window.player?.cueVideoById) {
    if (!sameSong) setPlayerQueue(ids, videos.titles, window.player.getPlayerState?.() === 1);
    return;
  }
  setPlayerQueue(ids, videos.titles, false, false); // the player starts it when it's ready (onPlayerReady)

  // Helper function to create YouTube player
  const createYouTubePlayer = () => {
    return new YT.Player('player', {
      height: '',
      width: '100%',
      host: 'http://www.youtube-nocookie.com',
      playerVars: { 'autoplay': 0, 'controls': 1 },
      events: {
        'onReady': onPlayerReady,
        'onStateChange': onPlayerStateChange
      }
    });
  };

  // Load YouTube API if not already loaded
  const loadYouTubeAPI = () => {
    return new Promise((resolve) => {
      if (!document.getElementById('yt_script')) {
        const script = document.createElement('script');
        script.id = 'yt_script';
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);

        script.onload = () => {
          // Wait for YT.Player to be available
          const checkYT = () => {
            if (typeof YT !== 'undefined' && YT.Player) {
              resolve();
            } else {
              setTimeout(checkYT, 100);
            }
          };
          checkYT();
        };
      } else {
        resolve();
      }
    });
  };

  // Main function logic
  loadYouTubeAPI().then(() => {
    window.player = createYouTubePlayer();
  }).catch(error => {
    console.error('Error loading YouTube player:', error);
  });
}

function makeUserNameDraggable() {
  const container = document.getElementById('username_d').parentElement;
  const dragItem = container.parentElement;

  let isDragging = false;
  let startY = 0;
  let currentY = 0;
  let yOffset = 0;

  // Event handlers
  const handleDragStart = (e) => {
    yOffset = 0;
    isDragging = false;
    startY = getClientY(e);
    dragItem.style.transition = 'none';
  };

  const handleDragEnd = () => {
    if (Math.abs(yOffset) > 30) {
      window.location.hash = '#';
    }
    dragItem.style.removeProperty('transition');
    dragItem.style.removeProperty('transform');
  };

  const handleDrag = (e) => {
    if (!window.location.hash) return;
    e.preventDefault();

    currentY = getClientY(e) - startY;
    yOffset = currentY;

    if (!isDragging && Math.abs(yOffset) > 10) {
      isDragging = true;
    }

    if (isDragging) {
      setTranslate(currentY, dragItem);
    }
  };

  // Helper functions
  const getClientY = (e) => {
    return e.touches ? e.touches[0].clientY : e.clientY;
  };

  const setTranslate = (yPos, element) => {
    element.style.transform = `translate3d(0px, ${yPos}px, 0)`;
  };

  // Add event listeners
  container.addEventListener('touchstart', handleDragStart, { passive: false });
  container.addEventListener('touchend', handleDragEnd, { passive: false });
  container.addEventListener('touchmove', handleDrag, { passive: false });
}
makeUserNameDraggable();

// The player's list: the song's videos, which one is on, and whether the list repeats. yCanta keeps it and
// loads one video at a time, rather than handing YouTube a playlist: once a video had played, a new
// playlist (loadPlaylist/cuePlaylist) often kept showing the old video, or failed ("invalid parameter").
const playerQueue = { ids: [], titles: {}, index: 0, loop: false };

// a new list: cued at its first video, or playing it (start), and on screen if the player is ready (load)
function setPlayerQueue(ids, titles = {}, start = false, load = true) {
  playerQueue.ids = ids;
  playerQueue.titles = titles || {};
  playerQueue.index = 0;
  if (load) playQueueAt(0, start);
  else showPlayerQueue();
}
function playQueueAt(index, start) {
  const n = playerQueue.ids.length;
  if (!n || !window.player?.cueVideoById) return;
  playerQueue.index = (index + n) % n;
  const id = playerQueue.ids[playerQueue.index];
  if (start) window.player.loadVideoById(id);
  else window.player.cueVideoById(id);
  showPlayerQueue();
}
function playerPrev() { playQueueAt(playerQueue.index - 1, true); }
function playerNext() { playQueueAt(playerQueue.index + 1, true); }

// "2/5", and the video's title: from the search (known before it plays), else from YouTube once it's loaded
function showPlayerQueue() {
  const n = playerQueue.ids.length;
  const count = document.querySelector('#playerDock .player-count');
  if (count) count.textContent = n > 1 ? `${playerQueue.index + 1}/${n}` : '';
  const id = playerQueue.ids[playerQueue.index];
  const fromYouTube = window.player?.getVideoData?.();
  const title = playerQueue.titles[id] || (fromYouTube?.video_id === id ? fromYouTube.title : '') || '';
  // two places: under the video in the window, beside the song's title in the pill
  document.querySelectorAll('#playerDock .player-video-title').forEach(el => { el.textContent = title; });
}

function onPlayerReady(event) {
  // the videos of the song whose ▶ was pressed last (it may have changed while YouTube's code loaded)
  playQueueAt(0, false);
}

function onPlayerStateChange(event){
  const state = window.player.getPlayerState();
  // a video ended: on to the next in the list; after the last, back to the first only when repeating
  if (state === 0) {
    const last = playerQueue.index >= playerQueue.ids.length - 1;
    if (!last || playerQueue.loop) return playQueueAt(playerQueue.index + 1, true);
  }
  showPlayerQueue();
  // every play button of the player (the window's and the tab's) shows play or pause
  const playing = state === 1;
  document.querySelectorAll('#playerDock .player-play').forEach(button => { button.textContent = playing ? '⏸' : '▶'; });
  document.getElementById('playerDock').classList.toggle('playing', playing);
}

// 🔁: the list starts over after its last video (a single video plays again)
function toggleLoop(){
  playerQueue.loop = !playerQueue.loop;
  document.getElementById('loop')?.classList.toggle('looping', playerQueue.loop);
}

function pauseVideo() {
  try {
    window.player.pauseVideo();
  } catch(error) {
    console.log(error);
  }
}

function playVideo() {
  try {
    window.player.playVideo();
  } catch(error) {
    console.log(error);
  }
}

function toggleVideo() {
  switch(window.player.getPlayerState()){
    case 1:  // playing 
      pauseVideo();
      break;
    case -1: // unstarted
    case 0:  // ended
    case 2:  // paused
    case 5:  // queued
      playVideo();
      break;
  }
}

// Keep the video playing even when it goes into the background
let hidden, visibilityChange; 
if (typeof document.hidden !== "undefined") {  
  hidden = "hidden";
  visibilityChange = "visibilitychange";
} else if (typeof document.msHidden !== "undefined") {
  hidden = "msHidden";
  visibilityChange = "msvisibilitychange";
} else if (typeof document.webkitHidden !== "undefined") {
  hidden = "webkitHidden";
  visibilityChange = "webkitvisibilitychange";
}

function handleVisibilityChange() {
  // If the player is closed, do absolutely nothing
  if (document.getElementById('playerDock')?.hidden !== false) {
    return;
  }

  // If the tab becomes hidden while a video is playing, keep it playing (but never start a paused one)
  if (document[hidden]) {
    try {
      if (window.player && typeof window.player.getPlayerState === 'function' && window.player.getPlayerState() === 1) {
        setTimeout(() => window.player.playVideo(), 300);
      }
    } catch (error) {
      console.error('Error maintaining background playback:', error);
    }
  }
}

if (typeof document.addEventListener !== "undefined" && visibilityChange) {
  document.addEventListener(visibilityChange, handleVisibilityChange, false);
} else {
  console.log("Your browser doesn't support playing music in background");
}

// #142: back in the installed app on an Android phone, Chrome sometimes shows old pieces of the other
// pages (and of the player) through the open one, until a scroll redraws them. Coming back, everything
// is marked to be drawn again: hidden and shown again before the screen updates, so nothing blinks, and
// nothing moves or loses its scroll spot.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  document.body.style.visibility = 'hidden';
  getComputedStyle(document.body).visibility; // makes the browser take the change in
  document.body.style.visibility = '';
});

/* crc32.js (C) 2014-present SheetJS -- http://sheetjs.com */
/* vim: set ts=2: */
/*exported CRC32 */
var CRC32;
(function (factory) {
  /*jshint ignore:start */
  /*eslint-disable */
  if(typeof DO_NOT_EXPORT_CRC === 'undefined') {
    if('object' === typeof exports) {
      factory(exports);
    } else if ('function' === typeof define && define.amd) {
      define(function () {
        var module = {};
        factory(module);
        return module;
      });
    } else {
      factory(CRC32 = {});
    }
  } else {
    factory(CRC32 = {});
  }
  /*eslint-enable */
  /*jshint ignore:end */
}(function(CRC32) {
CRC32.version = '1.2.0';
/* see perf/crc32table.js */
/*global Int32Array */
function signed_crc_table() {
  var c = 0, table = new Array(256);

  for(var n =0; n != 256; ++n){
    c = n;
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    c = ((c&1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1));
    table[n] = c;
  }

  return typeof Int32Array !== 'undefined' ? new Int32Array(table) : table;
}

var T = signed_crc_table();

//got rid of functions for buffering and bit strings that used to be here.

function crc32_str(str, seed) {
  var C = seed ^ -1;
  for(var i = 0, L=str.length, c, d; i < L;) {
    c = str.charCodeAt(i++);
    if(c < 0x80) {
      C = (C>>>8) ^ T[(C ^ c)&0xFF];
    } else if(c < 0x800) {
      C = (C>>>8) ^ T[(C ^ (192|((c>>6)&31)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|(c&63)))&0xFF];
    } else if(c >= 0xD800 && c < 0xE000) {
      c = (c&1023)+64; d = str.charCodeAt(i++)&1023;
      C = (C>>>8) ^ T[(C ^ (240|((c>>8)&7)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|((c>>2)&63)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|((d>>6)&15)|((c&3)<<4)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|(d&63)))&0xFF];
    } else {
      C = (C>>>8) ^ T[(C ^ (224|((c>>12)&15)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|((c>>6)&63)))&0xFF];
      C = (C>>>8) ^ T[(C ^ (128|(c&63)))&0xFF];
    }
  }
  return C ^ -1;
}
CRC32.table = T;
// $FlowIgnore
CRC32.str = crc32_str;
}));

//https://stackoverflow.com/questions/13405129/javascript-create-and-save-file
function download(data, filename, type) {
  var file = new Blob([data], {type: type});
  if (window.navigator.msSaveOrOpenBlob) {// IE10+
    window.navigator.msSaveOrOpenBlob(file, filename);
  }
  else { // Others
    var a = document.createElement("a"), 
        url = URL.createObjectURL(file);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function() {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);  
    }, 0); 
  }
}

class Tooltip {
  constructor() {
    this.tooltip = null;
    this.currentTarget = null;
    this.init();
  }

  init() {
    // Add event listeners to all elements with rel="tooltip"
    // A mouse opens the bubble on hover. A phone has no hover, so a tap opens it, and a tap here or anywhere else closes it.
    document.querySelectorAll('[rel="tooltip"]').forEach(el => {
      el.addEventListener('pointerdown', e => { this.lastPointer = e.pointerType; });
      el.addEventListener('pointerenter', e => { if (e.pointerType == 'mouse') this.showTooltip(e); });
      el.addEventListener('pointerleave', e => { if (e.pointerType == 'mouse') this.hideTooltip(); });
      el.addEventListener('click', e => {
        const opened = this.currentTarget == el;
        this.hideTooltip();
        if (this.lastPointer && this.lastPointer != 'mouse' && !opened) this.showTooltip(e);
      });
    });
    document.addEventListener('pointerdown', e => {
      if (this.tooltip && !this.currentTarget?.contains(e.target)) this.hideTooltip();
    }, true);
  }

  showTooltip(e) {
    const target = e.currentTarget;
    const tip = target.getAttribute('title');
    
    if (!tip) return;

    // Remove title to prevent native tooltip
    target.removeAttribute('title');
    
    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tooltip';
    this.tooltip.textContent = tip;
    if (tip.includes('\n')) this.tooltip.classList.add('long'); // a tip in paragraphs (search tips) reads left to right
    document.body.appendChild(this.tooltip);

    // Position tooltip
    this.positionTooltip(target);
    this.currentTarget = target;

    // Add window resize listener
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  positionTooltip(target) {
    const rect = target.getBoundingClientRect();
    let posLeft = rect.left + (target.offsetWidth / 2) - (this.tooltip.offsetWidth / 2);
    let posTop = rect.top - this.tooltip.offsetHeight - 20;

    // Handle left edge
    if (posLeft < 0) {
      posLeft = rect.left + (target.offsetWidth / 2) - 20;
      this.tooltip.classList.add('left');
    } else {
      this.tooltip.classList.remove('left');
    }

    // Handle right edge
    if (posLeft + this.tooltip.offsetWidth > window.innerWidth) {
      posLeft = rect.left - this.tooltip.offsetWidth + (target.offsetWidth / 2) + 20;
      this.tooltip.classList.add('right');
    } else {
      this.tooltip.classList.remove('right');
    }

    // Handle top edge
    if (posTop < 0) {
      posTop = rect.top + target.offsetHeight + 20; // below, leaving room for the arrow
      this.tooltip.classList.add('top');
    } else {
      this.tooltip.classList.remove('top');
    }

    // On a narrow phone, keep the whole bubble on screen, with its arrow still under the icon
    const room = window.innerWidth - this.tooltip.offsetWidth - 8;
    if (posLeft < 8 || posLeft > room) {
      posLeft = Math.max(8, Math.min(posLeft, room));
      this.tooltip.classList.add('clamped');
      this.tooltip.style.setProperty('--arrow-x', `${rect.left + target.offsetWidth / 2 - posLeft - 10}px`);
    }

    // Apply styles
    this.tooltip.style.left = `${posLeft}px`;
    this.tooltip.style.top = `${posTop}px`;
    this.tooltip.style.opacity = '1';
  }

  handleResize() {
    if (this.tooltip && this.currentTarget) {
      this.positionTooltip(this.currentTarget);
    }
  }

  hideTooltip() {
    if (this.tooltip) {
      // Restore title attribute
      if (this.currentTarget) {
        const tip = this.tooltip.textContent;
        this.currentTarget.setAttribute('title', tip);
      }

      // Remove tooltip
      this.tooltip.remove();
      this.tooltip = null;
      this.currentTarget = null;

      // Remove resize listener
      window.removeEventListener('resize', this.handleResize);
    }
  }
}

// Initialize tooltips when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new Tooltip();
});

function scrollIntoViewIfNeed(el, partiallyVisible = true, behavior = "smooth") {
  if (!el) return; // e.g. a deleted song open from All Songs has no list item
  try {
    const rect = el.getBoundingClientRect();
    const isVisible = partiallyVisible
      ? rect.top < window.innerHeight && rect.bottom >= 0 // Partially visible
      : rect.top >= 0 && rect.bottom <= window.innerHeight; // Completely visible

    if (!isVisible) {
      el.scrollIntoView({
        behavior: behavior,
        block: "center",
      });
    }
  } catch (err) {
    console.error('Error scrolling into view if needed:', err);
  }
}

function remToPx(rem) {    
    return rem * parseFloat(getComputedStyle(document.documentElement).fontSize);
}

function checkColor() {
  const corner = document.elementFromPoint(1,1); // null while the page isn't shown: nothing to match
  if (!corner) return;
  let color = window.getComputedStyle(corner).getPropertyValue('--highlight-color');
  document.querySelector("meta[name=theme-color]").setAttribute("content", color);
}

if(window.innerWidth < 640) {
  setInterval(checkColor, 20);
}
else {
  checkColor();
}
function capEachWord(toCapitalize, dividingChar = " ") {
  return toCapitalize.split(dividingChar).map(word => word[0].toUpperCase()+word.substr(1)).join(" ");
}
function getBasicAuthHeader(username, password) {
  const bytes = new TextEncoder().encode(username + ':' + password); // UTF-8, so any character works
  return 'Basic ' + window.btoa(String.fromCharCode(...bytes));
}
function requestAccess() {
  let selectEl = document.getElementById('db_select');
  const picked = selectEl.options[selectEl.selectedIndex] || {};
  // only a church on a server is worth naming (not "New songs on this device", the demo, or a server address)
  let db_name = /\(remote\)$/.test(picked.value || '') ? picked.text : '';
  let emailLink = `mailto:${'info.ycanta'}@${'gmail.com'}?subject=${encodeURIComponent('Requesting yCanta access' + (db_name ? ' to ' + db_name : ''))}&body=${encodeURIComponent("My name is: \n\nMy church is: " + (db_name || '') + '\n')}`;
  window.open(emailLink,'_blank');
}

// Vanilla JS slideToggle helper
function slideToggle(element, duration = 400) {
  if (window.getComputedStyle(element).display === 'none') {
    return slideDown(element, duration);
  } else {
    return slideUp(element, duration);
  }
}

function slideUp(element, duration = 400) {
  element.style.height = element.offsetHeight + 'px';
  element.style.transition = `height ${duration}ms ease-out`;
  element.style.overflow = 'hidden';
  
  setTimeout(() => {
    element.style.height = '0';
  }, 10);
  
  return new Promise(resolve => {
    setTimeout(() => {
      element.style.display = 'none';
      element.style.height = '';
      element.style.transition = '';
      element.style.overflow = ''; // jQuery restored overflow after sliding too
      resolve();
    }, duration);
  });
}

function slideDown(element, duration = 400) {
  element.style.display = 'block';
  element.style.height = ''; // measure the real height, not an inline height: 0
  const height = element.offsetHeight;
  element.style.height = '0';
  element.style.transition = `height ${duration}ms ease-out`;
  element.style.overflow = 'hidden';
  
  setTimeout(() => {
    element.style.height = height + 'px';
  }, 10);
  
  return new Promise(resolve => {
    setTimeout(() => {
      element.style.height = '';
      element.style.transition = '';
      element.style.overflow = ''; // jQuery restored overflow after sliding too
      resolve();
    }, duration);
  });
}
