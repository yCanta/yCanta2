// ---- Help (UX audit: the Help page). An overlay over the screen you're on: a card on a computer, a sheet the
// height of the screen on a phone. Esc, the × or the phone's Back closes it. Opened from the home page, the
// song editor's how-to line, a presentation's Help & Settings, or ? anywhere outside a box you type in.
//   openHelp()            the first section
//   openHelp('keys')      a section by its id

const HELP_SECTIONS = [
  { id: 'start', title: 'Getting started', items: [
    ['What yCanta does', `<p>yCanta keeps your church's songs in one place. Find a song by its words, put songbooks together for a
      service, print them as a PDF, and show the words on a screen.</p>`],
    ['The demo or your church', `<p>The demo has sample songs on this device only, so it's safe to try anything. Your church's
      songs come from its server: your church admin adds you and gives you a name and password.</p>`],
    ['Without internet', `<p>Once you've signed in with "Keep me logged in", yCanta works with no internet. Changes you make
      wait on this device and go to the server when you're back online. A yellow strip at the bottom shows when you're offline.</p>`],
    ['Your menu', `<p>Your name at the top right opens a menu: this Help, My Profile, Settings (light or dark mode, text
      size, importing songs), Categories, the Trash, and Logout. Each one opens its card on the home page. Editors also
      see Song tools: Find versions, and Find Spanish songs to tag the songs in Spanish.</p>`],
  ]},
  { id: 'songs', title: 'Songs', items: [
    ['Typing a song', `<p>Open a song and choose Edit (in its menu button). Put chords on their own line, above the words they
      go with, lined up with spaces:</p>
      <pre>   G          C        G
Amazing grace, how sweet the sound</pre>
      <p>Press Enter twice to start a new part. Backspace at the start of a part joins it to the one above. Each part has a
      type (verse, chorus, bridge…) you can change. Drag a part to move it: with a finger, hold it still for a moment first.</p>`],
    ['Finding a song', `<p>Search looks at a whole song: its title, words, author, scripture, category and more. Capital
      letters and accents don't matter.</p>
      <p>No quotes: what you type is found as one phrase, like <b>amazing grace</b>. With quotes, it works like Gmail search:
      every quoted phrase and every other word must match, in any order. <b>"amazing grace" chains</b> finds songs with both.
      There is no OR.</p>
      <p>To look in one place, start with <b>t:</b> title, <b>a:</b> author, <b>s:</b> scripture, <b>k:</b> key,
      <b>c:</b> category, <b>cp:</b> copyright or <b>i:</b> introduction. These match the start, so <b>a:charles</b> finds
      Charles Wesley. <b>a:!a</b>, <b>k:!k</b> and <b>c:!c</b> find songs with no author, key or category.</p>
      <p>Clicking a song's author, key, category or scripture searches for it. For simpler filtering by category, key and
      more, use Filter.</p>`],
    ['Deleting', `<p>Delete moves a song to the Trash, and a note offers Undo for a few seconds. Later, put it back from the
      Trash in Settings.</p>`],
  ]},
  { id: 'books', title: 'Songbooks', items: [
    ['Making a songbook', `<p>On Songbooks, press + Add songbook. Then Edit it (in its menu button) and open "Add songs" to
      pick songs. "New Section" adds a heading, and "New Reading" a Bible passage.</p>`],
    ['Order and removing', `<p>While editing, drag songs to put them in order (with a finger, hold a moment first). Drag a song
      back into "Add songs", or use its ${icon('trash')}, to take it out of the book. Cancel puts everything back as it was.</p>`],
    ['Status', `<p>Turn on "Song Status" while editing to mark each song ${icon('check')} approved, ${icon('tilde')} new or ${icon('close')} rejected: click the round
      button in front of a song's name to change it. Export can print only the ones you pick.</p>`],
  ]},
  { id: 'present', title: 'Presenting', items: [
    ['Starting', `<p>Open a songbook and choose Present (in its menu button). The words fill the screen. Press Space for the
      part people sing next, and h or the Menu button for Help & Settings. Esc twice, or ${icon('close')} Leave, goes back.</p>`],
    ['A second screen', `<p>In Help & Settings, "Open a mirror" opens a second window. Drag it to the projector and press F11
      for full screen. Set its look there, so the room never sees a panel.</p>`],
    ['Phones and tablets', `<p>"Share with other devices" shows a code and a QR code. Phones and tablets that open it follow
      along, and leaders signed in on their own device can be handed the screens.</p>`],
    ['Views', `<p><b>w</b> shows the whole song, <b>g</b> a grid of every song's parts (click a part to show it), and
      <b>t</b> a black background. The thin bar at the bottom is the song, one piece per part; the bright piece is on
      screen.</p>`],
    ['CCLI', `<p>When a presentation ends, a note lists what was on screen long enough to count for your CCLI report. Open it
      to copy the list.</p>`],
  ]},
  { id: 'print', title: 'Printing', items: [
    ['Making a PDF', `<p>Open a songbook or song and choose Export (in its menu button). Pick a Format, change anything you
      like, and press Generate PDF. The Preview shows the pages.</p>`],
    ['Saving a setup', `<p>"+ Save as a new format" keeps these settings under a name, to pick from the Format menu later.
      Copy and Paste share them with someone else.</p>`],
    ['A file for another yCanta', `<p>"JSON file" saves the songs as a file another yCanta can import (Settings, Import).</p>`],
  ]},
  { id: 'keys', title: 'Keys & gestures', items: [
    ['Anywhere', `<p><kbd>?</kbd> opens this Help. <kbd>Esc</kbd> closes it.</p>`],
    ['In a list', `<p><kbd>↓</kbd> from the search box goes to the first result; <kbd>↑</kbd> <kbd>↓</kbd> move;
      <kbd>Home</kbd> <kbd>End</kbd> go to the ends; <kbd>Enter</kbd> opens; <kbd>Esc</kbd> goes back to the search box.</p>`],
    ['Presenting', `<p><kbd>Space</kbd> the part people sing next · <kbd>→</kbd> <kbd>←</kbd> next or back a part ·
      <kbd>PgDn</kbd> <kbd>PgUp</kbd> next or previous song · <kbd>1</kbd>–<kbd>9</kbd> that verse · <kbd>c</kbd> the
      chorus · <kbd>b</kbd> <kbd>e</kbd> the bridge or the ending · <kbd>s</kbd> search (or a Bible verse) ·
      <kbd>w</kbd> whole song · <kbd>g</kbd> grid · <kbd>C</kbd> chords · <kbd>t</kbd> black background ·
      <kbd>f</kbd> white text · <kbd>h</kbd> Help & Settings · <kbd>Esc</kbd> twice to leave. Help & Settings lists them all.</p>`],
    ['On a phone', `<p>Swipe sideways on a song for the next or previous one. Pull a column down to close it. Swipe in from
      the left edge to see the column behind. Swipe a side panel ("Add songs", Categories, Preview) to open or close it, or
      tap its tab. Hold a row or a part still for a moment, then drag it. In a presentation, tap once for the Menu and
      double-tap to search.</p>`],
  ]},
];

function helpOverlay() {
  let dialog = document.getElementById('helpOverlay');
  if (dialog) return dialog;
  const tabs = HELP_SECTIONS.map(s => `<button type="button" class="help-tab" data-section="${s.id}">${escapeHtml(s.title)}</button>`).join('');
  const sections = HELP_SECTIONS.map(s => `<section class="help-section" data-section="${s.id}"><h3>${escapeHtml(s.title)}</h3>`
    + s.items.map(([title, html]) => `<div class="help-item"><h4>${escapeHtml(title)}</h4>${html}</div>`).join('') + '</section>').join('');
  document.body.insertAdjacentHTML('beforeend', `<dialog id="helpOverlay" aria-labelledby="helpOverlayTitle">
      <div class="help-top">
        <h2 id="helpOverlayTitle">Help</h2>
        <input type="search" class="help-find" placeholder="Find in help" aria-label="Find in help">
        <button type="button" class="help-x close-x" aria-label="Close" title="Close (Esc)">${icon('close')}</button>
      </div>
      <nav class="help-tabs" aria-label="Help sections">${tabs}</nav>
      <div class="help-body">${sections}<p class="help-none" hidden>Nothing in Help matches that.</p></div>
    </dialog>`);
  dialog = document.getElementById('helpOverlay');
  dialog.querySelector('.help-x').addEventListener('click', () => closeHelp());
  dialog.addEventListener('click', e => { if (e.target === dialog) closeHelp(); }); // a click outside the card
  dialog.addEventListener('close', () => { if (history.state?.ycHelp) history.back(); }); // Esc closes it too
  dialog.querySelector('.help-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.help-tab');
    if (tab) showHelpSection(tab.dataset.section);
  });
  dialog.querySelector('.help-find').addEventListener('input', e => findInHelp(e.target.value));
  return dialog;
}

// One section at a time; a search shows what matches in every section
function showHelpSection(id) {
  const dialog = helpOverlay();
  const find = dialog.querySelector('.help-find');
  if (find.value) { find.value = ''; findInHelp(''); }
  dialog.querySelectorAll('.help-section').forEach(s => { s.hidden = s.dataset.section !== id; });
  dialog.querySelectorAll('.help-tab').forEach(t => t.setAttribute('aria-current', t.dataset.section === id ? 'true' : 'false'));
  // on a phone the tabs scroll sideways: keep the one picked in view
  requestAnimationFrame(() => dialog.querySelector('.help-tab[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
  dialog.querySelector('.help-body').scrollTop = 0;
}
function findInHelp(text) {
  const dialog = helpOverlay();
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const current = dialog.querySelector('.help-tab[aria-current="true"]')?.dataset.section;
  let any = false;
  dialog.querySelectorAll('.help-section').forEach(section => {
    let shown = 0;
    section.querySelectorAll('.help-item').forEach(item => {
      const match = !words.length || words.every(w => item.textContent.toLowerCase().includes(w));
      item.hidden = !match;
      if (match) shown++;
    });
    section.hidden = words.length ? !shown : section.dataset.section !== current;
    if (shown) any = true;
  });
  dialog.querySelector('.help-none').hidden = !words.length || any;
}

function openHelp(section = 'start') {
  const dialog = helpOverlay();
  showHelpSection(HELP_SECTIONS.some(s => s.id === section) ? section : 'start');
  if (!dialog.open) {
    dialog.showModal();
    history.pushState({ ycHelp: true }, ''); // the phone's Back closes it (popstate below), not the page
  }
  dialog.querySelector('.help-body').focus?.();
}
function closeHelp() {
  const dialog = document.getElementById('helpOverlay');
  if (dialog?.open) dialog.close(); // its close handler steps back past the history entry openHelp added
}
window.addEventListener('popstate', () => {
  const dialog = document.getElementById('helpOverlay');
  if (dialog?.open && !history.state?.ycHelp) dialog.close(); // Back: already off the entry, so close doesn't step back again
});
// ? anywhere outside a box you type in (a presentation has its own h and ? for its panel)
document.addEventListener('keydown', e => {
  if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (document.body.classList.contains('present') || document.querySelector('dialog[open]')) return;
  e.preventDefault();
  openHelp('keys');
});
