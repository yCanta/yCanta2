// Dragging in yCanta. Reordering songs in a songbook, adding them from "Add a song?" and reordering a
// song's chunks is done by SortableJS (Sortable.min.js), set up in lib.js (makeSongbookSortable,
// makeChunksSortable). It replaced the hand-made HTML5 drag-and-drop that was here, which phones and
// Firefox on Android couldn't use. This file keeps the floating dialog's drag (dragDialog) and the drop
// that opens a song.

// Dropping a song from a list onto the song column (marked .dropHere while a song is held) opens it.
// With a mouse this is the browser's own drop; with a finger SortableJS has no drop event, so lib.js
// checks where the finger let go instead (see dragViewEnd).
const target = document.documentElement;
target.addEventListener("dragover", (e) => {
  if (e.target.closest?.('.dropHere')) {
    e.preventDefault();
  }
});

target.addEventListener("drop", (e) => {
  if (!window.draggedSongId || !e.target.closest?.('.dropHere')) return; // a file or text dragged in from outside, or not a song
  e.preventDefault();
  window.songDropOpened = true; // SortableJS hears of the drop after this: lib.js undoes any move on the way
  openDroppedSong(window.draggedSongId);
});

// Drags a floating window (the Info window, or the video player). onSettle(x, y), if given, is called
// when it comes to rest after a drag or a fling (the player tucks into a tab when flung off the side).
// onFling(x, y), if given, is called as a fling starts with where it would come to rest; if it returns
// true, it has handled the fling (the player tucks right away instead of coasting to the edge first).
function dragDialog(dialogEl = document.getElementById('dialog'), onSettle = null, onFling = null) {
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
        // A finger dragging the dialog moves only the dialog, not the page under it (Safari moved the whole
        // window, #6) and doesn't start the browser's pull-to-refresh. A touch that began in the dialog's
        // scrolling text still scrolls that text.
        if (e.type === 'touchmove' && e.cancelable && !this.fromScroller) e.preventDefault();
        var pos = this.getPosition(e);
        this.x = pos.x - this.offsetX;
        this.y = pos.y - this.offsetY;
        this.preEvent = e;
      }
    },
    
    start(e) {
      //document.documentElement.classList.add('no-overscroll');
      // the player drags only as a floating window, not as the docked pill or the tucked tab
      if (this.el.dataset.look && this.el.dataset.look !== 'dialog') return;
      // its buttons are buttons, not handles (a tap that wobbles shouldn't fling it away)
      if (this.el.id === 'playerDock' && e.target.closest('button')) return;

      this.positions = [];
      this.preEvent = '';
      this.dragging = true;
      // did it start in a part of the dialog that scrolls (its text)? that part keeps scrolling by touch
      this.fromScroller = false;
      for (let node = e.target; node && node !== this.el; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) { this.fromScroller = true; break; }
      }
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
          // each frame the speed drops by friction, so it travels speed * f / (1 - f) more in all
          const coast = this.friction / (1 - this.friction);
          if (onFling && onFling(this.x + this.decelX * coast, this.y + this.decelY * coast)) {
            this.decelerating = false;
            loop.stop();
          }
        } else {
          this.settled();
        }
      }
    },

    settled() {
      if (onSettle) setTimeout(() => onSettle(this.x, this.y), 0);
    },
    
    update(){
      if ( this.el ) {
        if ( this.decelerating ) {
          this.decelX *= this.friction;
          this.decelY *= this.friction;
          
          this.x += this.decelX;
          this.y += this.decelY;
          
          // stopped by an edge, or too slow to see (under a tenth of a pixel a frame): done on that axis,
          // instead of coasting on for a second or two with nothing moving before it settles
          const maxX = this.bounds.x - 90, minX = 100 - this.el.offsetWidth;
          const maxY = this.bounds.y - 100, minY = 100 - this.el.offsetHeight;
          if ( Math.abs(this.decelX) < 0.1 || this.x >= maxX || this.x <= minX ) { this.decelX = 0; }
          if ( Math.abs(this.decelY) < 0.1 || this.y >= maxY || this.y <= minY ) { this.decelY = 0; }
          if ( this.decelX === 0 && this.decelY === 0 ) {
            this.decelerating = false;
            loop.stop();    //We stop the loop when we're finished with any animation - ok if you only have 1 going on at a time.
            this.settled();
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
        document.addEventListener('touchmove',this.move.bind(this), { passive: false }); // so move() can stop the page scrolling
        document.addEventListener('mouseup',this.end.bind(this)); 
        document.addEventListener('touchend',this.end.bind(this)); 
        this.end();
      }
    }
  };
  drag.register(dialogEl);
}
