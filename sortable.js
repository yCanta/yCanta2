var selected;

function dragOver(e) {
  e.preventDefault();
  if (e.target.contentEditable == 'true') {
    e.dataTransfer.dropEffect = 'none';
  } else {
    e.dataTransfer.dropEffect = 'move';
  }
  return false;
}

function dragEnd(e, selector = 'ul li') {
  document.querySelectorAll(selector).forEach(function(song) {
    song.classList.remove('moving', 'overt', 'overb');
    song.parentNode.classList.remove('sorting');
  });

  if (e.target.closest('song')) {
    e.target.closest('song').querySelectorAll('.wrap .contenteditable-disabled').forEach(function(el) {
      el.classList.remove('contenteditable-disabled');
      el.setAttribute('contentEditable', 'true');
    });
  }
  scrollIntoViewIfNeed(e.target);
  selected = null;
  setTimeout(() => {
    e.target.classList.add('highlightBg');
  }, 200);
  setTimeout(() => {
    e.target.classList.remove('highlightBg');
  }, 3200);
  document.querySelector('.dropHere')?.classList.remove('dropHere');
}

function dragStart(e, selector = 'li') {
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", '');
  selected = e.target.closest(selector);
  selected.classList.add('moving');
  setTimeout(() => {
    selected.parentNode.classList.add('sorting');
  }, 100);

  if (e.target.closest('song')) {
    e.target.closest('song').querySelectorAll('.wrap [contentEditable="true"]').forEach(function(el) {
      el.classList.add('contenteditable-disabled');
      el.removeAttribute('contenteditable');
    });
  } else {
    if (e.target.href.indexOf('s-') < 0) return;
    if (document.body.classList.contains('song')) {
      document.getElementById('song').classList.add('dropHere');
    } else {
      document.getElementById('column-filler').classList.add('dropHere');
    }
  }
}

function dragEnter(e, selector = 'li') {
  e.preventDefault();
  var li = e.target.closest(selector);
  if (isVerboten(li)) return;

  document.querySelectorAll(selector).forEach(function(song) {
    song.classList.remove('overt', 'overb');
  });

  if (li !== selected) {
    if (isBefore(selected, li)) {
      li.classList.add('overt');
    } else {
      li.classList.add('overb');
    }
  }
}

function dragLeave(e) {}

function dragDrop(e, selector = 'li') {
  e.preventDefault();
  var li = e.target.closest(selector) || e.target;
  if (e.stopPropagation) e.stopPropagation();

  // Dropped on the empty part of the row's own list: move it to the end (the add-song list keeps its order)
  if (li.nodeName === 'UL' && li === selected.parentNode) {
    if (!isVerboten(li)) li.append(selected);
    return;
  }

  if (isVerboten(li)) {
    if (li.parentNode != selected.parentNode) {
      dataxInBookUpdate(selected, true);
      selected.remove();
    }
  } else if (li.parentNode != selected.parentNode) {
    dataxInBookUpdate(selected);
    let songEl = selected.cloneNode(true);
    bind_songbook_edit(songEl);

    if (songEl.getAttribute('data-song-id') == "section") {
      add_edit_pencil(songEl);
    }

    const button = document.createElement('button');
    button.innerHTML = '&#128465;';
    songEl.querySelector('a').after(button);
    button.addEventListener('click', function(e) {
      dataxInBookUpdate(songEl, true);
      scaleRemove(songEl);
    });

    songEl.setAttribute('data-song-status', 'n');

    if (li.nodeName === 'UL') {
      li.append(songEl);
    } else if (isBefore(selected, li)) {
      li.parentNode.insertBefore(songEl, li);
    } else {
      li.parentNode.insertBefore(songEl, li.nextSibling);
    }

    if (location.hash.indexOf('s-') > -1) {
      let newHash = selected.querySelector('a').href
        .replace(window.songbook._id, window.songbook._id + '?edit')
        .replace(/^.*#/, '#');
      if (newHash.indexOf('s-') > -1) {
        location.hash = newHash;
      }
    }

    songEl.classList.add('highlightBg');
    setTimeout(() => songEl.classList.remove('highlightBg'), 3000);
  } else {
    if (isBefore(selected, li)) {
      li.parentNode.insertBefore(selected, li);
    } else {
      li.parentNode.insertBefore(selected, li.nextSibling);
    }

    if (location.hash.indexOf('s-') > -1) {
      let newHash = selected.querySelector('a').href
        .replace(window.songbook._id, window.songbook._id + '?edit')
        .replace(/^.*#/, '#');
      if (newHash.indexOf('s-') > -1) {
        location.hash = newHash;
      }
    }
  }
  window.songbook_list.reIndex();
  e.dataTransfer.clearData();
}
function isVerboten(target) {
  return target.closest('#songListEdit') !== null;
}

function isBefore(el1, el2) {
  if (el2.parentNode === el1.parentNode) {
    for (let cur = el1.previousSibling; cur; cur = cur.previousSibling) {
      if (cur === el2) return true;
    }
  }
  return false;
}

const target = document.documentElement;
target.addEventListener("dragover", (e) => {
  if (e.target.classList.contains('dropHere')) {
    e.preventDefault();
  }
});

target.addEventListener("drop", (e) => {
  e.preventDefault();
  if (!selected) return; // a file or text dragged in from outside the app
  location.hash = `${location.hash.replace('#','').split('&')[0]}&${selected.getAttribute('data-song-id')}`;
});

function dragDialog() {
  function AnimationLoop(){
    var animations = [],
        animating = true,
        frame,
        lastFrameTime = 0;
    const frameInterval = 1000/100; // 100fps in ms

    function animate(){
      if ( frame ) { return; }
      if ( animating ) { 
        frame = requestAnimationFrame(function() {
          const now = performance.now();
          if (now - lastFrameTime >= frameInterval) {
            lastFrameTime = now;
            var i = animations.length;
            while ( i-- ) {
              if ( !animations[i] || animations[i]() === false ) { 
                animations.splice(i, 1); 
              }
            }
          }
          frame = null;
          animate();
        });
      }
    };

    function add(){ 
      animations.push.apply(animations,arguments); 
    };

    add.apply(null,arguments);
    //animate();  //I've turned off the always on animation loop

    return {
      animations: animations,
      add: add, 
      stop: function(){ 
        animating = false; 
        animations = []; 
        if (frame) {
          cancelAnimationFrame(frame);
          frame = null;
        }
      },
      start: function(){ 
        animating = true; 
        lastFrameTime = performance.now();
        animate(); 
      }
    };
  }

  var loop = AnimationLoop();

  var drag = {
    
    x: 0,
    y: 0,
    
    decVelX: 0,
    decVelY: 0,
    friction: 0.95,
    
    el: null,
    
    dragging: false,
    
    bounds: {
      x: document.body.clientWidth,
      y: document.body.clientHeight
    },
    
    positions: [],
    getPosition(e){
      e = e || ''
      if ( e && this.positions.length > 1 ){//!(e.target.nodeName == 'A')) { 
        e.preventDefault(); 
      }

      let event, pos;
      try {
        event = ( e ? e.touches ? e.touches[0] : e : {} );
        pos = { x: event.pageX, y: event.pageY, time: Date.now() };
      }
      catch {  //touchend is weird, so we go back to last move event.
        e = this.preEvent;
        event = ( e ? e.touches ? e.touches[0] : e : {} );
        pos = { x: event.pageX, y: event.pageY, time: Date.now() };
      }
        
      this.positions.push(pos);
      
      return pos;
    },
    
    move(e) {
      if ( this.dragging ) { 
        var pos = this.getPosition(e);
        this.x = pos.x - this.offsetX;
        this.y = pos.y - this.offsetY;
        this.preEvent = e;
      }
    },
    
    start(e) {
      //document.documentElement.classList.add('no-overscroll');

      this.positions = [];
      this.preEvent = '';
      this.dragging = true;
      this.decelerating = false;

      this.bounds.x = document.body.clientWidth;
      this.bounds.y = document.body.clientHeight;
      
      var pos = this.getPosition(e);
      this.startX = pos.x;
      this.startY = pos.y;
      
      var rect = this.el.getBoundingClientRect();
      this.offsetX = this.startX - rect.left;
      this.offsetY = this.startY - rect.top;
      
      this.x = pos.x - this.offsetX;
      this.y = pos.y - this.offsetY;
      
      this.moveTime = this.startTime = Date.now();
      
      loop.start();   //start the animation loop only when we need it.
      loop.add(this.update.bind(this));
    },
    
    end(e){
      //document.documentElement.classList.remove('no-overscroll');

      if ( this.dragging ) {
        this.dragging = false;
        var pos = this.getPosition(e);

        var now = Date.now();
        var lastPos = this.positions.pop();
        var i = this.positions.length;

        if(i > 1) {
          while ( i-- ) {
            if ( now - this.positions[i].time > 150 ) { break; }
            lastPos = this.positions[i];
          }
          
          var xOffset = pos.x - lastPos.x;
          var yOffset = pos.y - lastPos.y;
          var timeOffset = ( Date.now() - lastPos.time ) / 12;

          this.decelX = ( xOffset / timeOffset ) || 0;
          this.decelY = ( yOffset / timeOffset ) || 0;
          this.decelerating = true;  
        }
      }
    },
    
    update(){
      if ( this.el ) {
        if ( this.decelerating ) {
          this.decelX *= this.friction;
          this.decelY *= this.friction;
          
          this.x += this.decelX;
          this.y += this.decelY;
          
          if ( Math.abs(this.decelX) < 0.01 ) { this.decelX = 0; }
          if ( Math.abs(this.decelY) < 0.01 ) { this.decelY = 0; }
          if ( this.decelX === 0 && this.decelY === 0 ) { 
            this.decelerating = false; 
            loop.stop();    //We stop the loop when we're finished with any animation - ok if you only have 1 going on at a time.
            return false;
          }
        }
        this.x = Math.max(100 - this.el.offsetWidth, Math.min( this.bounds.x - 90, this.x));
        this.y = Math.max(100 - this.el.offsetHeight, Math.min( this.bounds.y - 100, this.y));
        
        this.onUpdate(this.x, this.y);
      }
    },
    
    onUpdate(x, y){
      this.el.style.transform = 'translate3d(min(' + x + 'px, calc(100vw - 100px)), min(' + y + 'px, calc(100vh - 100px)), 0)';
    },
    
    register(el) {
      this.el = el || this.el;
      
      if ( this.el ) {
        //this.start();           //I don't want this running to start.
        this.el.addEventListener('mousedown',this.start.bind(this));
        this.el.addEventListener('touchstart',this.start.bind(this));
        document.addEventListener('mousemove',this.move.bind(this));
        document.addEventListener('touchmove',this.move.bind(this));
        document.addEventListener('mouseup',this.end.bind(this)); 
        document.addEventListener('touchend',this.end.bind(this)); 
        this.end();
      }
    }
  };
  drag.register(document.getElementById('dialog'));
}
