/*
 * Vanilla replacement for jquery.toTextarea.js v0.4.0 (Tony Brix, MIT), with the
 * doubleEnter option added by Carl Hempel 6/19/2019.
 * Makes elements editable as plain text. Inside a song chunk, pressing Enter twice
 * splits the chunk in two and Backspace at the start merges it into the one above.
 */
const editableElements = new WeakSet(); // elements already set up, so we never bind twice
let lastEnterTarget = null; // the element where Enter was pressed last, for double-Enter

function convertChunksToEditable(chunks) {
  chunks.forEach(chunk => {
    if (editableElements.has(chunk)) return;
    editableElements.add(chunk);

    chunk.contentEditable = true;
    chunk.classList.add('toTextarea');

    chunk.addEventListener('keydown', handleKeydown);
    chunk.addEventListener('paste', handlePaste);
  });

  function handleKeydown(e) {
    // Enter that commits an IME composition (CJK input) is not a newline. Safari reports it as keyCode 229
    // with isComposing false; Android keyboards send 229 for ordinary typing, so don't skip on 229 there.
    if (e.isComposing || (e.keyCode === 229 && !/Android/i.test(navigator.userAgent))) return;
    const el = e.currentTarget;

    // Keep it plain text: no bold, italic or underline
    if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }

    // Only song chunks (inside a .wrap) can be split or merged
    const wrap = el.tagName === 'CHUNK' ? el.closest('.wrap') : null;

    if (e.key === 'Enter') {
      e.preventDefault(); // stop the browser from inserting <div> or <br>
      if (wrap && lastEnterTarget === el) {
        lastEnterTarget = null;
        splitChunk(el, wrap);
        return;
      }
      insertTextAtCursor(el, '\n');
      lastEnterTarget = el;
      return;
    }
    lastEnterTarget = null;

    if (e.key === 'Backspace' && wrap) {
      const prevWrap = wrap.previousElementSibling;
      const prevChunk = prevWrap?.classList.contains('wrap') ? prevWrap.querySelector('chunk') : null;
      if (prevChunk && window.getSelection().isCollapsed && caretOffset(el) === 0) {
        e.preventDefault();
        mergeChunks(prevChunk, el, wrap);
      }
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    // Paste as plain text. A text node can't inject HTML, so no escaping is needed here.
    const text = (e.clipboardData || window.clipboardData)
      .getData('text/plain')
      .replace(/\r\n?/g, '\n');
    insertTextAtCursor(e.currentTarget, text);
  }

  function splitChunk(chunk, wrap) {
    const offset = caretOffset(chunk);
    const text = chunk.textContent;

    // Clone the wrap so the new chunk keeps its type attribute, classes and select
    const newWrap = wrap.cloneNode(true);
    newWrap.querySelector('select').value = wrap.querySelector('select').value; // cloneNode doesn't copy the current choice
    const newChunk = newWrap.querySelector('chunk');

    chunk.textContent = text.slice(0, offset).replace(/\n$/, ''); // drop the newline from the first Enter
    newChunk.textContent = text.slice(offset).replace(/^\n/, '');
    wrap.after(newWrap);

    bind_chunk_edit(newWrap); // drag and drop handlers
    convertChunksToEditable([newChunk]);
    scrollIntoViewIfNeed(newChunk);

    newChunk.focus();
    setCaret(newChunk, 0);
  }

  function mergeChunks(prevChunk, chunk, wrap) {
    const prevText = prevChunk.textContent.replace(/^\s+|\s+$/g, '');
    prevChunk.textContent = prevText + '\n' + chunk.textContent;
    wrap.remove();

    prevChunk.focus();
    setCaret(prevChunk, prevText.length + 1); // start of the text that moved up
  }

  // modified from http://stackoverflow.com/a/20398132/806777 (same as the old plugin)
  function insertTextAtCursor(el, text) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    // A newline at the very end won't show unless there is a second one after it
    const atEnd = caretOffset(el) === el.textContent.length;
    const needsExtra = text.endsWith('\n') && atEnd && !el.textContent.endsWith('\n');

    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    if (needsExtra) {
      textNode.after(document.createTextNode('\n'));
    }

    // Put the cursor after the inserted text, then merge the text nodes
    const after = document.createRange();
    after.setStartAfter(textNode);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    const offset = caretOffset(el);
    el.normalize();
    setCaret(el, offset);
  }

  // Cursor position counted in characters from the start of el, across all its text nodes
  function caretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length;
  }

  function setCaret(el, offset) {
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    let placed = false;
    while ((node = walker.nextNode())) {
      if (offset <= node.length) {
        range.setStart(node, offset);
        placed = true;
        break;
      }
      offset -= node.length;
    }
    if (!placed) {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      range.collapse(true);
    }
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}
