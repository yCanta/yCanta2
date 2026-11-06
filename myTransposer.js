/*!
 * Vanilla JavaScript Chord Transposer v2.0
 * Based on original jQuery plugin by Jesse Gavin
 * Converted to vanilla JS
 *
 * Copyright 2010, Jesse Gavin
 * Dual licensed under the MIT or GPL Version 2 licenses.
 * http://codegavin.com/license
 */

// Wrap everything in an IIFE to avoid polluting global namespace
(function() {
  // Make Transposer available globally
  window.Transposer = function(element, options) {
  const opts = Object.assign({}, Transposer.defaults, options);
  let currentKey = null;
  const keys = [
    { name: 'Ab', value: 0, type: 'F' },
    { name: 'A', value: 1, type: 'N' },
    { name: 'A#', value: 2, type: 'S' },
    { name: 'Bb', value: 2, type: 'F' },
    { name: 'B', value: 3, type: 'N' },
    { name: 'C', value: 4, type: 'N' },
    { name: 'C#', value: 5, type: 'S' },
    { name: 'Db', value: 5, type: 'F' },
    { name: 'D', value: 6, type: 'N' },
    { name: 'D#', value: 7, type: 'S' },
    { name: 'Eb', value: 7, type: 'F' },
    { name: 'E', value: 8, type: 'N' },
    { name: 'F', value: 9, type: 'N' },
    { name: 'F#', value: 10, type: 'S' },
    { name: 'Gb', value: 10, type: 'F' },
    { name: 'G', value: 11, type: 'N' },
    { name: 'G#', value: 0, type: 'S' }
  ];

  function getKeyByName(name) {
    if (name.endsWith('m')) {
      name = name.slice(0, -1);
    }
    return keys.find(key => key.name === name);
  }

  function getChordRoot(input) {
    if (input.length > 1 && (input[1] === 'b' || input[1] === '#')) {
      return input.slice(0, 2);
    }
    return input[0];
  }

  function getNewKey(oldKey, delta, targetKey) {
    const oldKeyObj = getKeyByName(oldKey);
    if (!oldKeyObj) return null;

    let keyValue = oldKeyObj.value + delta;
    keyValue = (keyValue + 12) % 12; // Handle wrap-around

    const preferredType = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F#', 'G', 'G#']
      .includes(targetKey.name) ? 'S' : 'F';

    return keys.find(key => 
      key.value === keyValue && 
      (key.type === 'N' || key.type === preferredType)
    ) || keys.find(key => key.value === keyValue);
  }

  function getDelta(oldIndex, newIndex) {
    return newIndex - oldIndex;
  }

  function transposeSong(target, key) {
    const newKey = getKeyByName(key);
    if (!newKey) return;

    const currentKey = getKeyByName(document.querySelector('key')?.textContent) || newKey;
    if (currentKey.name === newKey.name) {
      document.querySelector('#song').classList.toggle('nochords');
      return;
    }

    const delta = getDelta(currentKey.value, newKey.value);
    document.querySelectorAll('#song chunk').forEach(chunk => {
      if (chunk.children.length === 0) {
        const output = [];
        const lines = chunk.textContent.split('\n');
        lines.forEach(line => {
          output.push(isChordLine(line) ? transposeLine(line, delta, newKey) : line);
        });
        chunk.textContent = output.join('\n');
      } else {
        chunk.querySelectorAll('c').forEach(c => {
          transposeChord(c, delta, newKey);
        });
        document.querySelector('#song').classList.remove('nochords');
      }
    });
  }

  function transposeLine(line, delta, targetKey) {
    const newline = [];
    let diff = 0;
    const tokens = line.split(' ');

    tokens.forEach(token => {
      if (token) {
        const oldChordRoot = getChordRoot(token);
        const newChordRoot = getNewKey(oldChordRoot, delta, targetKey);
        if (newChordRoot) {
          const newChord = newChordRoot.name + token.slice(oldChordRoot.length);
          newline.push(newChord);
          diff = token.length - newChord.length;
        } else {
          newline.push(token);
        }
      } else {
        // A longer new chord eats one of the spaces after it, so the chords below stay lined up
        if (diff < 0) {
          diff += 1;
        } else {
          newline.push(token);
        }
      }

      while (diff > 0) {
        newline.push('');
        diff--;
      }
    });

    return newline.join(' ');
  }

  function transposeChord(element, delta, targetKey) {
    const oldChord = element.textContent.match(opts.chordReplaceRegex)?.[0];
    if (!oldChord) return;

    const oldChordRoot = getChordRoot(oldChord);
    const newChordRoot = getNewKey(oldChordRoot, delta, targetKey);
    if (newChordRoot) {
      const newChord = newChordRoot.name + oldChord.slice(oldChordRoot.length);
      element.textContent = element.textContent.replace(
        opts.chordReplaceRegex,
        newChord
      );
    }
  }

  function isChordLine(input) {
    const tokens = input.replace(/\s+/, ' ').split(' ');
    return tokens.every(token => 
      !token.trim() || token.match(opts.chordRegex)
    );
  }

  // Initialize
  const startKey = document.querySelector('key')?.textContent || '';
  currentKey = getKeyByName(startKey) || null; // no key: nothing starts selected

  // Build transpose links
  const keyLinks = keys.map(key => {
    const selected = currentKey?.name === key.name ? 'selected default' : '';
    return `<a tabindex='0' id='${key.name.replace('#','_')}' class='${selected}'>${key.name}</a>`;
  });

  const keysHtml = document.createElement('div');
  keysHtml.className = 'transpose-keys';
  keysHtml.innerHTML = keyLinks.join('');
  
  keysHtml.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      transposeSong(element, e.target.textContent);
      keysHtml.querySelectorAll('a').forEach(a => a.classList.remove('selected'));
      e.target.classList.add('selected');
      document.querySelector('key').textContent = e.target.textContent;
    });
  });

  element.parentNode.after(keysHtml); // same spot as the old $(this).parent().after(keysHtml)
  };

  // Add defaults to the Transposer function
  Transposer.defaults = {
  chordRegex: /^[A-G][b#]?(2|5|6|7|9|11|13|6\/9|7-5|7-9|7#5|7#9|7\+5|7\+9|7b5|7b9|7sus2|7sus4|add2|add4|add9|aug|dim|dim7|m\/maj7|m6|m7|m7b5|m9|m11|m13|maj7|maj9|maj11|maj13|mb5|m|sus|sus2|sus4)*(\/[A-G][b#]*)*$/,
  chordReplaceRegex: /([A-G][b#]?(2|5|6|7|9|11|13|6\/9|7-5|7-9|7#5|7#9|7\+5|7\+9|7b5|7b9|7sus2|7sus4|add2|add4|add9|aug|dim|dim7|m\/maj7|m6|m7|m7b5|m9|m11|m13|maj7|maj9|maj11|maj13|mb5|m|sus|sus2|sus4)*)/g
  };
})();
