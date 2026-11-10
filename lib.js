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
// Tells the user a database call failed (#1), with the details in the console.
// whatFailed finishes "Couldn't ...", for example 'save the song'.
function reportDbError(err, whatFailed) {
  console.error(`Couldn't ${whatFailed}:`, err);
  let why;
  if (err?.status === 409 || err?.name === 'conflict') why = 'someone else changed it at the same time. Reload and try again.';
  else if (err?.status === 401 || err?.name === 'unauthorized') why = 'please log in again.';
  else if (err?.status === 403 || err?.name === 'forbidden') why = "you don't have permission.";
  else if (err?.status === 404 || err?.name === 'not_found') why = "it wasn't found.";
  else if (!navigator.onLine || err?.status === 0 || err?.name === 'unknown_error') why = "the server can't be reached.";
  else why = (err?.message || String(err)) + '.';
  notyf.error(`Couldn't ${escapeHtml(whatFailed)}: ${escapeHtml(why)}`);
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
    this.errorLine.hidden = true;
    this.statusLine.textContent = '';
    const paragraphs = text ? text.split('\n\n').map(p => `<p>${escapeHtml(p)}</p>`).join('') : '';
    this.body.innerHTML = paragraphs + html + fields.map(field => {
      const attrs = [
        `name="${escapeHtml(field.name)}"`,
        `type="${escapeHtml(field.type || 'text')}"`,
        field.value ? `value="${escapeHtml(field.value)}"` : '',
        field.required === false ? '' : 'required',
        field.minlength ? `minlength="${field.minlength}"` : '',
        field.maxlength ? `maxlength="${field.maxlength}"` : '',
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
          if (field.type !== 'password') values[field.name] = (values[field.name] || '').trim();
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
  notyf.info('Config copied to your clipboard', 'var(--export-color)');
  blueHighlight(document.getElementById('export_copy'));
};
function pasteFromClipboard() {
  navigator.clipboard.readText().then(text => {
    set_value_by_id(JSON.parse(text));
     document.getElementById('paper_margin_top').dispatchEvent(new Event('change', { bubbles: true }));
  }).catch(err => {
    console.error('Failed to read clipboard contents: ', err);
  }); 
  blueHighlight(document.getElementById('export_paste'));
  notyf.info('Config pasted from your clipboard', 'var(--export-color)');
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
  {name: 'start_song_on_new_page', value: false},
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
  {name: 'start_song_on_new_page', value: false},
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
  {name: 'start_song_on_new_page', value: false},
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

export_form.margins = margins;
export_form.text = text;
export_form.def_configs = def_configs;
export_form.index = index;
window.export = export_form;

function set_value_by_id(list) {
  for(item of list) {
    let element = document.getElementById(item.name);
    if(element.type == 'checkbox'){
      element.checked = item.value;
    }
    else{
      element.value = item.value;
    }
    if(['margin','text','index'].includes(item.name)){
      document.getElementById(item.name).dispatchEvent(new Event('change', { bubbles: true })); //trigger specifics
    }
  }
}
if ('serviceWorker' in navigator) {
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

function isChord(line) {
  var fraction = 0.45;
  var count = line.count(' ');

  if((line.length == 0) || !(line.match(/[a-z]/i))) {
    return false;
  }
  else if (line.length <= 4) {  //short chord lines
    return true;
  }
  else if (count/line.length > fraction) { //determines if it's a chord
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

  // Helper function to toggle highlighting
  function toggleHighlight(selector, className, condition) {
    document.querySelectorAll(selector).forEach(el => 
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
  toggleHighlight(`[data-song-id='${song_id}']`, 'song-highlight', () => true);
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
      document.getElementById('song').classList.toggle('nochords');
    }
  });

  // present button handling: delegated, because #present is re-created each time a songbook renders
  document.getElementById('songList').addEventListener('mousedown', function(e) {
    if (e.target.closest('#present')) {
      switch (e.which) {
        case 1: // left click
          window.location = '#' + window.songbook._id + '?present';
          break;
        case 2: // middle click
        case 3: // right click  
          window.location = '#' + window.songbook._id + '?present+new';
          break;
        default:
          window.location = '#' + window.songbook._id + '?present';
      }
    }
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
  }
}
function bindSearchToList(list, id) {
  const updateCountDisplay = (list, targetId) => {
    const countElement = document.querySelector(`${targetId} .search + span`);
    if (!countElement) return;

    if (list === window.songbook_list) {
      const songPlacement = list.visibleItems.findIndex(
        el => el._values['song-id'] === window.song._id
      ) + 1;
      const visibleCount = list.visibleItems.length;
      countElement.dataset.numberVisible = `${songPlacement ? `${songPlacement}/` : ''}${visibleCount}`;
    } else {
      countElement.dataset.numberVisible = list.visibleItems.length;
    }
  };

  const handleSearchComplete = () => {
    updateCountDisplay(list, id);
    highlightText();
  };

  // Initial count setup
  if (list === window.songbook_list) {
    const initialPlacement = list.visibleItems.findIndex(
      el => el._values['song-id'] === window.song._id
    ) + 1;
    const totalCount = document.querySelectorAll(`${id} .list li`).length;
    const countElement = document.querySelector(`${id} .search + span`);
    if (countElement) {
      countElement.dataset.numberVisible = `${initialPlacement ? `${initialPlacement}/` : ''}${totalCount}`;
    }
  } else {
    const countElement = document.querySelector(`${id} .search + span`);
    if (countElement) {
      countElement.dataset.numberVisible = document.querySelectorAll(`${id} .list li`).length;
    }
  }

  // Bind search complete event
  list.on('searchComplete', handleSearchComplete);
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

  // Handle select changes
  song.addEventListener('change', e => {
    if (e.target.tagName === 'SELECT') {
      const type = e.target.options[e.target.selectedIndex]?.text;
      if (type) e.target.nextElementSibling?.setAttribute('type', type);
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
    alert('Username or pin not entered');
  } else if (dbName.endsWith('(remote)') && (pwd === '' || username === '')) {
    isValid = false;
    alert('Username or pwd not entered');
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
  if (dbName.includes('(local)')) {
    alert('DB name cannot have "(local)" in the name');
    return false;
  }

  // Validate required fields
  if (!username || !pin) {
    alert('Username and pin are required');
    return false;
  }

  // Check pin confirmation
  if (pin !== pin2) {
    alert('Pin and confirmation pin do not match');
    return false;
  }

  // Check if database already exists
  const databases = JSON.parse(localStorage.getItem('databases') || '{}');
  const fullDbName = `${dbName}(local)`;
  
  if (databases[fullDbName]) {
    alert('Database name already exists - please choose another name');
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
  const name = window.user.name.trim();
  const usernameContainer = document.getElementById('username_d');
  const userContent = document.getElementById('user_content');

  // Update username display
  let html = '';
  for (const word of name.split(/\W+/).filter(Boolean)) {
    html += `${word[0]}<span class="closing">${word.substring(1)} </span>`;
  }
  usernameContainer.innerHTML = html;

  // Build user profile content
  let profileHtml = `<h3>${name}</h3>`;

  // Favorite Songbooks
  const favSongbooks = window.user.fav_sbs.filter(sb => sb.length !== 0);
  profileHtml += '<h4>Favorite Songbooks</h4><ul>';
  
  if (favSongbooks.length) {
    try {
      const result = await db.allDocs({
        include_docs: true,
        keys: favSongbooks
      });
      
      profileHtml += result.rows
        .sort((a, b) => (a.doc?.title || '').localeCompare(b.doc?.title || ''))
        .filter(sb => sb.doc)
        .map(sb => `<li><a class="link" href="#${sb.doc._id}">${sb.doc.title}</a></li>`)
        .join('');
    } catch (err) {
      console.error('Error loading favorite songbooks:', err);
    }
  } else {
    profileHtml += '<li>None yet!</li>';
  }
  profileHtml += '</ul>';

  // Favorite Songs
  const favSongs = window.user.fav_songs.filter(song => song.length !== 0);
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
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
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
    <button onclick="loadRawDbObject(window.user._id, document.getElementById('user_content'), 'updateUser();')" class="btn">
      <span class="mirror">&#9998;</span> Edit
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
    let html = `<h3>Ordered List <a href="#" onclick="loadRawDbObject('categories', document.getElementById('category_content'), 'loadCategories();')" class="mirror editor-only">&#9998;</a>
      </h3><ul>`;
    
    // Add each category as a list item
    result.categories.forEach(cat => {
      html += `
        <li><a href="#sb-allSongs" onclick="searchSBfor(this.textContent)">${cat}</a></li>`;
    });
    
    html += '</ul>';
    
    // Update DOM
    categoryContent.innerHTML = html;
    
  } catch (err) {
    console.error('Error loading categories:', err);
    categoryContent.innerHTML = '<p>Error loading categories</p>';
  }
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
function setLoginState() {
  window.loggedin = true;
  
  // Update user interface
  updateUser();
  
  // Add logged-in class to HTML element
  document.documentElement.classList.add('loggedin');
  
  // Update title display
  const titleLink = document.getElementById('title').querySelector('a');
  if (titleLink) {
    const dbNameParts = window.db.name.split('(');
    const dbName = capEachWord(dbNameParts[0], "_");
    const dbType = dbNameParts[1] ? dbNameParts[1].replace(')', '').toUpperCase() : '';
    
    titleLink.innerHTML = `${dbName}<sup style="font-size: .8rem; font-weight: normal; color: var(--songList-color);"> ${dbType}</sup>`;
  }
  
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

function mapSongbookRowToValue(row) {
  return { 'songbook-id':           row.doc._id,
    'songbook-rev':                 row.doc._rev,
    'songbook-title':        't:' + stripAccents(row.doc.title) + '\0'
  + 'addedBy:' + stripAccents(row.doc.addedBy.slice(2)) + '\0'
  + 'editedBy:' + stripAccents(row.doc.editedBy.slice(2)) + '\0',
    'link': '#'+row.doc._id,
    'name': row.doc.title
  };
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
    search = row.doc.search;
    status = status;
    title = row.doc.title;
  }
  return { 'song-id':           id,
    'song-rev':                 rev,
    'song-search':              stripAccents(search),
    'song-status':              status,
    'song-deleted':             deleted,
    'link': '#'+window.songbook._id+'&'+id,
    'name': title
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
  contentEl.classList.remove('showStatus', 'showComments');
  
  // Set status/comment visibility
  if (songbook.showStatus) contentEl.classList.add('showStatus');
  if (songbook.showComments) contentEl.classList.add('showComments');

  //remove disabled-hidden
  document.querySelectorAll('.disabled-hidden').forEach(el => el.classList.remove('disabled-hidden'));
  
  // Update title
  const isSpecial = ['sb-allSongs', 'sb-favoriteSongs'].includes(songbook._id);
  titleEl.innerHTML = isSpecial ? `<i>${songbook.title}</i>` : songbook.title;
  titleEl.dataset.rev = songbook._rev;
  titleEl.dataset.songbookId = songbook._id;
  
  // Add buttons if not special songbook
  if (!isSpecial) {
    titleEl.closest('.title').insertAdjacentHTML('beforeend', 
      `<span class="buttonsRight" id="sb_buttonsRight">
        <span class="star" onclick="event.stopPropagation(); toggleFavorite('${songbook._id}','fav_sbs')"></span>
        <info onclick="event.stopPropagation(); loadInfo(false);"></info>
      </span>`);
  }

  // Update float menu
  const editable = canEdit(songbook);
  document.querySelector('#songList .float-menu').innerHTML = `
    ${songbook._id === 'sb-allSongs' ? '<a data-song-edit="new" class="float-menu-item"><span class="float-menu-icon">+</span>Add Song</a>' : ''}
    ${editable ? `<button data-home onclick="deleteSongbook('${songbook._id}')" class="float-menu-item delete"><span class="float-menu-icon">&#128465;</span>Delete</button>` : ''}
    <button data-songbook-present class="float-menu-item" id="present"><span class="float-menu-icon">&#128253;</span>Present</button>
    <a data-songbook-export class="float-menu-item"><span class="float-menu-icon">&#128424;</span>Export</a>
    ${editable ? '<a data-songbook-edit class="float-menu-item"><span class="float-menu-icon">&#9998;</span>Edit</a>' : ''}
    <span class="float-menu-item float-menu-toggle"><button class="float-menu-icon">+</button></span>`;

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

  const values = songs.map(song => mapSongRowToValue(song));

  // Load categories
  db.get('categories').then(categories => {
    const categoryFilter = document.getElementById('category_filter').querySelector('select');
    categoryFilter.innerHTML = `
      <option value=""></option>
      <option value="c:!c">No Category</option>
      ${categories.categories.map(cat => `<option value="c:${cat}">${cat}</option>`).join('')}`;
  }).catch(err => reportDbError(err, 'load the category filter'));

  // Create list
  if (!edit) {
    window.songbook_list = new List(target_class, options, values);
    bindSearchToList(window.songbook_list, '#songbook_content');
    const searchInput = document.querySelector('#songbook_content .search');
    searchInput.dispatchEvent(new KeyboardEvent('keyup'));
  } else {
    if(window.songbook_edit_togglesongs_list) window.songbook_edit_togglesongs_list.clear(); //I don't know why I needed to add this to keep the list from duplicating on additional navigations
    window.songbook_edit_togglesongs_list = new List(target_class, options, values);
    // Keep "New Section" in the add-song list during a search (issue #82). List.js runs handlers last-added
    // first, so adding this before bindSearchToList leaves the section out of the count.
    window.songbook_edit_togglesongs_list.on('searchComplete', list => {
      const section = list.get('song-id', 'section')[0];
      if (section && !section.found) {
        section.found = true;
        list.update();
      }
    });
    bindSearchToList(window.songbook_edit_togglesongs_list, '#songListEdit');
  }
  // A list rebuilt by a sync change has no hrefs or current-song highlight yet
  if (window.songbook && window.song) updateAllLinks();
}
function dataxInBookUpdate(song, remove = false) {
   const songId = song.getAttribute('data-song-id');

   // Skip section headers
   if (songId === 'section') {
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
   } else {
     songElement.setAttribute('data-xInBook', newCount);
   }
 }

function editHash(e) {
  if (window.songbookEditing && window.songbook.showStatus && e.offsetX < 20) {
    e.preventDefault();
    cycleStatus(this);
  }
  e.preventDefault();
  if(window.innerWidth <= 1150 && !document.body.classList.contains('song') && e.target.closest('#songbook_edit_togglesongs')) {
    return;  //we're not popping open edit song from the add song window.
  }
  location.hash = e.target.href.replace(/^.*#/,'').replace(window.songbook._id, window.songbook._id+'?edit');
}
function bind_songbook_edit(song){
  song.addEventListener('click', editHash, false);

  song.setAttribute('draggable', 'true');  // Enable columns to be draggable.
  song.addEventListener('dragstart', dragStart, false);
  song.addEventListener('dragenter', dragEnter, false);
  song.addEventListener('dragover', dragOver, false);
  song.addEventListener('dragleave', dragLeave, false);
  song.addEventListener('drop', dragDrop, false);
  song.addEventListener('dragend', dragEnd, false);
}
function bind_chunk_edit(chunk){
  chunk.setAttribute('draggable', 'true');  // Enable columns to be draggable.
  chunk.addEventListener('dragstart', function(event){dragStart(event,'.wrap');}, false);
  chunk.addEventListener('dragenter', function(event){dragEnter(event,'.wrap');}, false);
  chunk.addEventListener('dragover', dragOver, false);
  chunk.addEventListener('dragleave', function(event){dragLeave(event,'.wrap');}, false);
  chunk.addEventListener('drop', function(event){dragDrop(event,'.wrap');}, false);
  chunk.addEventListener('dragend', function(event){dragEnd(event,'.wrap');}, false);
}
function add_edit_pencil(song) {
  // Create edit pencil button
  const editBtn = document.createElement('button');
  editBtn.className = 'edit_pencil';
  editBtn.textContent = '✏️';

  // Add click handler for editing section name
  editBtn.addEventListener('click', (e) => {
    const sectionLink = song.querySelector('a');
    const currentName = sectionLink.textContent;

    const newName = prompt('New Name for Section:', currentName);
    if (newName && newName.trim() !== '') {
     sectionLink.textContent = newName.trim();
    }
  });

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
}
function cancelSongbook(el) {
  if (window.songbookEditing) {
    window.songbookEditing = false; // Reset editing state first
    const confirmed = confirmWhenEditing(); // Then check for confirmation
    if (!confirmed) {
      window.songbook._id = '';
      window.location.hash = el.getAttribute('href'); // a button has no .href property
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
      <button data-songbook class="btn" style="background-color: var(--edit-color);" onclick="saveSongbookFromEditor();">Save</button>
      <button data-songbook class="btn" style="background-color: var(--edit-color);" onclick="cancelSongbook(this);">Cancel</button>
      <button data-songbook class="btn" style="background-color: var(--edit-color);" onclick="resetSongbook();">Reset</button>`;
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
    document.querySelector('#songbook_content nav').classList.add('disabled-hidden');
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

    const songs = result.rows.sort((a, b) => (a.doc?.title || '').localeCompare(b.doc?.title || ''));
    songs.unshift({ id: 'section', title: 'New Section', search: 'new section' });

    buildSongbookList(songs, 'songbook_edit_togglesongs', 'song-item-template-edit', true);
  }

  // Bind events to the songbook list
  const bindSongbookListEvents = () => {
    const songList = document.querySelectorAll('#songList #songbook_content ul li');
    songList.forEach((song) => {
      bind_songbook_edit(song);
      dataxInBookUpdate(song);
      if (song.getAttribute('data-song-id') === 'section') {
        add_edit_pencil(song);
      }
      const deleteButton = document.createElement('button');
      deleteButton.innerHTML = '&#128465;';
      deleteButton.addEventListener('click', () => {
        dataxInBookUpdate(song, true);
        scaleRemove(song);
      });
      song.appendChild(deleteButton);
    });

    const toggleSongList = document.querySelectorAll('#songList #songbook_edit_togglesongs ul li');
    toggleSongList.forEach((song) => {
      bind_songbook_edit(song);
      song.addEventListener('click', () => {
        const copySong = song.cloneNode(true);
        bind_songbook_edit(copySong);
        dataxInBookUpdate(copySong);
        if (copySong.getAttribute('data-song-id') === 'section') {
          add_edit_pencil(copySong);
        }
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = '&#128465;';
        deleteButton.addEventListener('click', () => {
          dataxInBookUpdate(copySong, true);
          scaleRemove(copySong);
        });
        copySong.appendChild(deleteButton);
        copySong.setAttribute('data-song-status', 'n');
        document.querySelector('#songbook_content .list').appendChild(copySong);
        scrollIntoViewIfNeed(copySong);
        copySong.classList.add('highlightBg');
        setTimeout(() => copySong.classList.remove('highlightBg'), 3000);
      });
    });
  };

  // Main logic
  createEditButtons();
  enableTitleEditing();
  disableSearchAndNav();
  addStatusAndCommentsToggle();
  await loadSongsIntoAdder();
  bindSongbookListEvents();
  // Let songs be dropped onto the list itself (empty songbook, or below the last song)
  document.querySelectorAll('#songList ul.list').forEach(ul => {
    ul.addEventListener('drop', dragDrop, false);
    ul.addEventListener('dragover', dragOver, false);
  });
}

async function editSong() { 
  await loadSong(window.song._id);

  // Create and add edit buttons
  const buttonsHTML = `
    <div class="edit_buttons">
      <button data-song class="btn" style="background-color: var(--edit-color);" onclick="prepSaveSong(this)">Save</button>
      <a ${window.song._id === 's-new-song' ? 'data-songbook' : 'data-song'} 
              class="btn" style="background-color: var(--edit-color);" 
              onclick="window.songEditing=false; delete window.song; window.location.hash=this.getAttribute('href');">
        Cancel
      </a>
      <button data-song class="btn" style="background-color: var(--edit-color);" 
              onclick="window.songEditing=false; location.reload()">
        Reset
      </button>
    </div>`;
  
  const songElement = document.getElementsByTagName('song')[0]

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
    chunk.parentNode.insertBefore(wrapper, chunk);
    wrapper.appendChild(chunk);
    
    bind_chunk_edit(wrapper);
  });

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
    const values = categories.categories
      .filter(cat => !window.categories_list?.get('name', cat).length)
      .map(cat => ({ name: cat, search: stripAccents(cat) }));
    
    window.categories_list = new List('categories', options, values);
    bindSearchToList(window.categories_list, '#categories');

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

  const elements = songElement.querySelectorAll('stitle .title_link, authors, scripture_ref, introduction, key, chunk, copyright, cclis');
  convertChunksToEditable(elements);
}
// The songbook editor's Save button. A failed save keeps the editor open and says why (#1).
async function saveSongbookFromEditor() {
  try {
    await saveSongbook(parseHash('sb-'));
  } catch (err) {
    window.songbookEditing = true;
    reportDbError(err, 'save the songbook');
  }
}

async function prepSaveSong() {
  if(document.getElementsByTagName('stitle')[0].textContent.trim() === ''){
    alert('Please add a title before you save');
    return;
  }
  else{
    window.songEditing=false;
  }
  // Save from a copy of the editor, so a failed save leaves the editor and its edits in place (#1)
  const editor = document.querySelector('#song song');
  const songElement = editor.cloneNode(true);
  const ccliCheckbox = document.getElementById('ccli-checkbox');
  const ccliElement = songElement.querySelector('cclis');

  // Hide the editor while saving; a successful save loads the saved song in its place
  editor.style.display = 'none';

  // Process chunks
  const chunks = songElement.querySelectorAll('chunk');
  chunks.forEach(chunk => {
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

    chunk.innerHTML = content;
  });

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
  } catch (error) {
    // Back to the editor, edits intact
    window.song = openSong;
    window.songEditing = true;
    editor.style.display = '';
    reportDbError(error, 'save the song');
  }
}
async function prepExport() { 
  // Reset progress bar
  const progressBar = document.getElementById('pdf_progress');
  const progressText = document.getElementById('pdf_progress_text');
  progressBar.style.width = '0%';
  progressText.textContent = '0%';

  // Trigger chords display change
  const chordsDisplay = document.getElementById('display_chords');
  chordsDisplay.dispatchEvent(new Event('change', { bubbles: true }));

  // Reset PDF viewer
  const pdfViewer = document.getElementById('pdf');
  pdfViewer.src = "pdfjs-2.8.335-dist/web/viewer.html?file=";

  // Initialize web worker if not already created
  if (typeof window.pdfFormatter === 'undefined') {
    window.pdfFormatter = await new Worker('pdfformatter.js');
    
    pdfFormatter.onmessage = function(e) {
      if (e.data[0] === 'pdf') {
        const downloadLink = document.getElementById('downloadPDF');
        downloadLink.innerHTML = `
          <a class="btn" href="${e.data[1]}" style="margin-top:0;" target="_blank" download="${window.exportObject.title}.pdf">
            Download ⭳
          </a>`;
        
        pdfViewer.contentWindow.yourMethod(e.data[1]);
        console.log('Message received from worker');
        logData('exported', `${window.exportObject._id}: ${JSON.stringify(read_config_form())}`);
      } else if (e.data[0] === 'progress') {
        progressBar.style.width = e.data[1];
        progressText.textContent = e.data[1];
      }
    };
  }

  // Load export configurations
  try {
    const result = await db.allDocs({
      include_docs: true,
      startkey: `cfg-${window.exportObject._id}`,
      endkey: `cfg-${window.exportObject._id}\ufff0`,
    });

    let innerHTML = '';
    const userIdCfg = `cfg-${window.exportObject._id}${window.user._id}`;
    const cfgButtons = document.getElementById('cfg_buttons');
    cfgButtons.innerHTML = '';

    result.rows.forEach(row => {
      if (row.doc._id.match(userIdCfg)) {
        if (row.doc._id !== userIdCfg) {
          cfgButtons.insertAdjacentHTML('beforeend', `
            <button class="btn" onclick="blueHighlight(this);">
              <span data-name="${escapeHtml(row.doc.name || 'Default')}" onclick="saveExport(this.dataset.name);">
                Save as ${escapeHtml(row.doc.name || 'Default')}
              </span>
              <span class="export_close" onclick="event.preventDefault(); deleteExportCfg('${row.doc._id}');">×</span>
            </button>`);
        }
        innerHTML = `<option value="${escapeHtml(JSON.stringify(row.doc.cfg))}">Your ${escapeHtml(row.doc.name || 'Default')}</option>${innerHTML}`;
      } else {
        const userId = row.doc._id.match(/u\-.*/)[0];
        innerHTML += `<option value="${escapeHtml(JSON.stringify(row.doc.cfg))}">${escapeHtml(window.users[userId])}'s ${escapeHtml(row.doc.name || 'Default')}</option>`;
      }
    });

    // Add default button
    cfgButtons.insertAdjacentHTML('afterbegin', `
      <button class="btn" onclick="blueHighlight(this);">
        <span onclick="saveExport('');">Save as Default</span>
      </button>`);

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
      // Check if the name and value strings are strictly equal
      return objA.name === objB.name && objA.value === objB.value;
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

  // Update page icon
  const columns = document.getElementById('columns').value;
  const pageIcon = document.getElementById('page_icon');
  pageIcon.innerHTML = '<span class="col"></span>'.repeat(columns);
  pageIcon.className = `${document.getElementById('page_layout').value.replace('-', '_')} ${document.getElementById('paper_orientation').value}`;

  // Update margin summary
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
  const marginIcon = document.getElementById('margin_icon');
  marginIcon.className = `${marginName} ${document.getElementById('paper_orientation').value}`;
  document.getElementById('margin_summary').textContent = marginName;
  document.getElementById('margin_summary_nums').textContent = `${margins[3]}"`;
  document.getElementById('margin_gutter').textContent = `Gutter: ${margins[5]}"`;

  // Update page size summary
  document.getElementById('page_size_summary').textContent = document.getElementById('paper_size').value;

  // Update font summary
  document.getElementById('font_summary').textContent = document.getElementById('font_face').value;

  // Update text summary
  const textValues = window.export.text.default.map(item => ({
    name: item.name,
    value: getValue(item.name)
  }));

  const textName = Object.entries(window.export.text).find(([name, values]) => 
    arraysOfObjectsEqual(values, textValues)
  )?.[0] || 'custom';


  document.getElementById('text').value = textName;
  document.getElementById('text_summary').textContent = textName;

  // Update song title summary
  var songTitleFormat = document.getElementById('songtitle_format').value
    .replace('${num}', '1') + 'Arise';
  
  if (document.getElementById('scripture_location').value === 'in-title') {
    songTitleFormat += ' (Jude 1)';
  }
  document.getElementById('song_title_summary').textContent = songTitleFormat;

  // Update CCLI summary
  document.getElementById('ccli_summary').textContent = `CCLI: ${document.getElementById('ccli').value || 'none'}`;

  // Update print summary
  const printSummary = [
    document.getElementById('print_a').checked ? '✓' : '',
    document.getElementById('print_n').checked ? '~' : '',
    document.getElementById('print_r').checked ? '✗' : ''
  ].join('') || 'all';

  document.getElementById('print_summary').textContent = `Print: ${printSummary}`;

  // Update chords summary
  document.getElementById('chords_summary').textContent = `Chords: ${document.getElementById('display_chords').value}`;

  // Update index summaries
  const updateIndexSummary = (id, selectId, label) => {
    const select = document.getElementById(selectId);
    document.getElementById(id).textContent = label + select.options[select.selectedIndex].text;
  };

  updateIndexSummary('alphabetical_summary', 'display_index', 'Index: ');
  updateIndexSummary('category_summary', 'display_cat_index', 'Category: ');
  updateIndexSummary('scripture_summary', 'display_scrip_index', 'Scripture: ');

  // Update index settings
  const indexValues = window.export.index.default.map(item => ({
    name: item.name,
    value: getValue(item.name)
  }));

  const indexName = Object.entries(window.export.index).find(([name, values]) => 
    arraysOfObjectsEqual(values, indexValues)
  )?.[0] || 'custom';

  document.getElementById('index').value = indexName;
  document.getElementById('index_summary').textContent = indexName;

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
function getTranslate3d (el) {
  var values = window.getComputedStyle(el).transform.split(/\w+\(|\);?/);
  if (!values[1] || !values[1].length) {
      return [];
  }
  return values[1].split(/,\s?/g);
}

//Making things work with touch coolness
function makeDraggable(dragEl, dragAction, dragSide='right') {
  let startx = 0;
  let starty = 0;
  let dist = 0;
  let disty = 0;
  let width = 0;
  let height = 0;
  let active;
  let dragTop = false;
  let slideout = false;
  let slideoutEl;
  let slideback = false;
  let navigate = false;

  dragEl.addEventListener('touchstart', function(e) {
    var touchobj = e.changedTouches[0];
    startx = parseInt(touchobj.clientX);
    starty = parseInt(touchobj.clientY);
    width = getTranslate3d(dragEl)[4];
    height = getTranslate3d(dragEl)[5];
    active = document.getElementsByClassName('active')[0];
    dragTop = false;
    slideout = false;
    slideoutEl = (!document.body.classList.contains('song') && 
                 document.body.classList.contains('export') ? 
                 dragEl.previousElementSibling.previousElementSibling : 
                 dragEl.previousElementSibling);
    slideback = false;
    navigate = false;

    if (dragSide === 'right' && screen.width < 640) {
      if ((window.songEditing && e.target.closest('#song')) || 
          (window.songbookEditing && e.target.closest('#songList')) || 
          e.target.closest('#export')) {
        dragEl.style.transition = 'all 0s';
      } else {
        startx = false;
      }
    } else if (dragSide === 'top' && screen.width < 640) {
      if (starty < remToPx(7.5)) {
        if (active === dragEl) {
          active = 0;
        } else {
          active.style.transition = 'all 0s';
        }
        dragEl.style.transition = 'all 0s';
        dragTop = true;
      } else if (!window.songEditing && !window.songbookEditing) {
        if (dragEl.classList.contains('slidout')) {
          slideback = true;
          dragEl.style.transition = 'all 0s';
        } else if (startx < screen.width/5) {
          slideout = true;
          slideoutEl.style.transition = 'all 0s';
        } else if (screen.width * .25 < startx && startx < screen.width *.75 && 
                   document.body.classList.contains('song') && 
                   e.target.closest('.sidebar-open') === null) {
          navigate = true;
          dragEl.getElementsByClassName('row')[0].style.transition = 'transform 0s';
        } else {
          startx = false;
        }
      } else {
        startx = false;
      }
    } else {
      startx = false;
    }
  }, {passive: true});

  dragEl.addEventListener('touchmove', function(e) {
    if (startx) {
      var touchobj = e.changedTouches[0];
      var dist = parseInt(width) + parseInt((touchobj.clientX) - startx);
      var disty = Math.max(parseInt(height) + parseInt((touchobj.clientY) - starty), 0);

      if (dragSide === 'right') {
        dragEl.style.transform = 'translate3d(' + Math.max(parseInt(dist),0) + 'px, 0, 0)';
      } else if (dragSide === 'top') {
        if (slideout) {
          if (dist > 25) {
            slideoutEl.style.transform = 'translate3d(' + -(parseInt(dist)-25)*4 + 'px, 0, 0)';
          }
        } else if (slideback) {
          if (dist < -25) {
            dragEl.classList.remove('slidout');
            dragEl.style.transform = 'translate3d(' + (parseInt(dist)+25)*4 + 'px, 8rem, 0)';
            dragEl.style.width = 'min(80%, 300px)';
            dragEl.style.height = 'calc(100vh - 8rem)';
            if (dist < -100) {
              dragEl.style['z-index'] = '2';
            } else {
              dragEl.style['z-index'] = '7';
            }
          }
        } else if (navigate) {
          if (Math.abs(dist) > 50) {
            dragEl.getElementsByClassName('row')[0].style.transform = 'translate3d(' + (dist) + 'px, 0, 0)';
            dragEl.getElementsByClassName('row')[0].style.opacity = '0.5';
          }
        } else {
          dragEl.style.transform = 'translate3d(0,' + parseInt(disty) + 'px, 0)';
          if (active) {
            active.style.transform = 'translate3d(0, calc(' + parseInt(disty) + 'px + 4rem), 0)';
          }
          e.preventDefault();
        }
      }
    }
  }, false);

  dragEl.addEventListener('touchend', function(e) {
    if (startx) {
      var touchobj = e.changedTouches[0];
      var dist = parseInt(touchobj.clientX) - startx;
      var disty = Math.abs(parseInt(touchobj.clientY) - starty);
      
      if (startx && dragSide === 'right' && Math.abs(dist) > 50) {
        dragAction(dragEl); // Call the provided callback
        e.preventDefault();
      } else if (slideback) {
        if (dist < -100) {
          e.preventDefault();
        } else {
          dragEl.classList.add('slidout');
        }
        dragEl.removeAttribute('style');
      } else if (slideout) {
        if (dist > 100) {
          e.preventDefault();
          slideoutEl.classList.add('slidout');
        }
        slideoutEl.removeAttribute('style');
      } else if (navigate) {
        if (Math.abs(dist) > 100) {
          e.preventDefault();
          let currentSong = document.querySelector("#songbook_content [data-song-id='"+window.song._id+"']");
          if (currentSong && dist > 0 && currentSong.previousElementSibling) {
            dragEl.getElementsByClassName('row')[0].style.transform = 'translate3d(-100%, 0, 0)';
            location.hash = '#' + formatSbID(window.songbook._id) + '&' +
                            currentSong.previousElementSibling.getAttribute('data-song-id');
          } else if (currentSong && dist < 0 && currentSong.nextElementSibling) {
            dragEl.getElementsByClassName('row')[0].style.transform = 'translate3d(100%, 0, 0)';
            location.hash = '#' + formatSbID(window.songbook._id) + '&' +
                            currentSong.nextElementSibling.getAttribute('data-song-id');
          } else {
            location.hash = '#' + formatSbID(window.songbook._id);
          }
        }
        setTimeout(function() {
          dragEl.getElementsByClassName('row')[0].removeAttribute('style');
        }, 30);
      } else if (dragTop && disty > 200) {
        dragAction();
        e.preventDefault();
        return;
      }
    }
    
    if (active) {
      active.style.removeProperty('transform');
      active.style.removeProperty('transition');
    }
    dragEl.style.removeProperty('transform');
    dragEl.style.removeProperty('transition');
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
  makeDraggable(document.getElementById('export'), function() {
    window.location.hash = window.location.hash.replace('?export','');
  }, 'top');
}, false);


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
    const songTitle = document.querySelector('stitle a')?.textContent || 'Current Song';
    // No oldHashList means a direct call (e.g. logout), so always ask
    if (!oldHashList || oldHashList[1]?.[1] === 'edit') {
      confirmMessages.push('songEditing');
      changes.push(`Song: ${songTitle}`);
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
    const message = `If you leave this page you may lose changes to:\n- ${changes.join('\n- ')}`;
    
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
  const createInfoContent = (title, addedBy, addedDate, editedBy, editedDate, extraContent = '') => {
    return `
      <small>Added by: ${addedBy}<br>${formatDate(addedDate)}</small><br>
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
    const revs = window.song._revs_info.map(rev => rev.rev);
    const revNum = revs.indexOf(window.song_rev);

    // Create revision controls
    const revisionControls = `
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <button onclick="prevSongRev();" style="width:1.75rem" 
          ${revNum !== revs.length - 1 ? 'class="btn btn-tiny"' : ''}>
          ${revNum !== revs.length - 1 ? '<<' : ''}
        </button>
        <small>Edit ${window.song._revs_info.length - revNum} / ${window.song._revs_info.length}</small>
        <button onclick="nextSongRev();" style="width:1.75rem" 
          ${revNum !== 0 ? 'class="btn btn-tiny"' : 'class="btn-tiny"'}>
          ${revNum !== 0 ? '>>' : ''}
        </button>
      </div>`;

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
        `<a href="#${sb.doc._id}&${window.song._id}">${sb.doc.title}</a>`
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
        window.users[window.song.addedBy] || window.song.addedBy,
        window.song.added,
        window.users[window.song.editedBy] || window.song.editedBy.slice(2),
        window.song.edited,
        revisionControls + songbookContent
      )
    );
  } else {
    // Songbook info
    const revisionInfo = `<small>${(window.songbook._rev.split('-')[0] - 1)} previous edits</small>`;

    // Show dialog with songbook info
    showDialog(
      window.songbook.title,
      createInfoContent(
        window.songbook.title,
        window.users[window.songbook.addedBy] || window.songbook.addedBy,
        window.songbook.added,
        window.users[window.songbook.editedBy] || window.songbook.editedBy,
        window.songbook.edited,
        revisionInfo
      )
    );
  }
}

function prevSongRev() {
  let prevRev = window.song._revs_info.map(rev => rev.rev).indexOf(window.song_rev) + 1;
  loadSong(window.song._id, window.song._revs_info[prevRev].rev).catch(() => {}); // already reported
}
function nextSongRev() {
  let nextRev = window.song._revs_info.map(rev => rev.rev).indexOf(window.song_rev) - 1;
  loadSong(window.song._id, window.song._revs_info[nextRev].rev).catch(() => {}); // already reported
}

function loadSongPlayer() {
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

  // Helper function to setup player UI
  const setupPlayerUI = () => {
    const dialog = document.getElementById('dialog');
    dialog.querySelector('h5').textContent = 'Playing';
    dialog.setAttribute('data-use', 'player');
    dialog.querySelector('.title').textContent = window.song.title;

    const content = `
      <br><br>
      <div id="player"></div>
      <span id="playlistnumber" style="margin: 1rem .5rem 1rem .5rem;"></span>
      <button class="btn emoji" onclick="window.player.previousVideo()">⏮</button>
      <button id="play" class="btn emoji" onclick="toggleVideo();">▶</button>
      <button class="btn emoji" onclick="window.player.nextVideo()">⏭</button>
      <button id="loop" class="btn emoji" onclick="toggleLoop();">🔁</button>
    `;

    dialog.querySelector('.content').innerHTML = content;
    if (dialog.style.display === 'none') {
      slideDown(dialog);
    }
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
    setupPlayerUI();
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

function onPlayerReady(event) {
  let ids = window.youtube_links.map(link => link.match(/(be\/|v\=)([-\w]+)\S/)[0].replace('be/','').replace('v=',''));
  window.player.cuePlaylist(ids);
  window.player.loop = false;
}

function onPlayerStateChange(event){
  const playlistnum = document.getElementById('playlistnumber');
  if (playlistnum && window.player && window.player.getPlaylist) {
    playlistnum.textContent = (window.player.getPlaylistIndex() + 1) + '/' + window.player.getPlaylist().length;
  }

  // Find the play button scoped inside the dialog to match your old jQuery logic
  const playButton = document.querySelector('#dialog #play') || document.getElementById('play');
  if (!playButton) return;

  switch(window.player.getPlayerState()){
    case 1:  // playing 
      playButton.textContent = '⏸';
      break;
    case -1: // unstarted
    case 0:  // ended
    case 2:  // paused
    case 5:  // queued
      playButton.textContent = '▶';
      break;
  }
}

function toggleLoop(){
  const loopEl = document.getElementById('loop');
  switch(window.player.loop) {
    case true: 
      window.player.loop = false;
      if (loopEl) loopEl.classList.remove('looping');
      break;
    case false: 
      window.player.loop = true;
      if (loopEl) loopEl.classList.add('looping');
      break;
  }
  window.player.setLoop(window.player.loop);
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
  const dialog = document.getElementById('dialog');
  
  // If the dialog element is missing or hidden, do absolutely nothing
  if (!dialog || dialog.style.display === 'none') {
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
    document.querySelectorAll('[rel="tooltip"]').forEach(el => {
      el.addEventListener('mouseenter', this.showTooltip.bind(this));
      el.addEventListener('mouseleave', this.hideTooltip.bind(this));
      el.addEventListener('click', this.hideTooltip.bind(this));
    });
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
      posTop = rect.top + target.offsetHeight;
      this.tooltip.classList.add('top');
    } else {
      this.tooltip.classList.remove('top');
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
  let color = window.getComputedStyle(document.elementFromPoint(1,1)).getPropertyValue('--highlight-color');
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
  let db_name = selectEl.options[ selectEl.selectedIndex ].text;
  let emailLink = `mailto:${'info.ycanta'}@${'gmail.com'}?subject=Requesting yCanta access${(db_name ? ' to '+ db_name : '')}&body=My name is: %0D%0A%0D%0AI'd like access to: ${db_name}`;
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
