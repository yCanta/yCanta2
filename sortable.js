var selected;

function dragOver( e ) {
  e.preventDefault(); // Allows us to drop.
  if (e.target.contentEditable=='true') {
    e.dataTransfer.dropEffect = 'none';
  }
  else {
    e.dataTransfer.dropEffect = 'move';
  }
  return false;
}

function dragEnd( e, selector='ul li' ) {
  [].forEach.call(document.querySelectorAll(selector), function (song) {
    song.classList.remove('moving');
    song.classList.remove('overt');  
    song.classList.remove('overb');
    song.parentNode.classList.remove('sorting');
  });
  if(e.target.closest('song')) {
    e.target.closest('song').querySelectorAll('.wrap .contenteditable-disabled').forEach(function(el) {el.classList.remove('contenteditable-disabled'); el.setAttribute('contentEditable','true')});
  }
  scrollIntoViewIfNeed(e.target);
  selected = null;
  setTimeout(() => {
    e.target.classList.add('highlightBg');
  },200);
  setTimeout(() => {
    e.target.classList.remove('highlightBg');
  },3200);
  document.getElementsByClassName('dropHere')[0].classList.remove('dropHere');
}

function dragStart( e, selector='li' ) {
  e.dataTransfer.effectAllowed = "move"
  e.dataTransfer.setData( "text/plain", '' )
  selected = e.target.closest(selector);
  selected.classList.add('moving');
  setTimeout(() => { //helps avoid premature dragEnd trigger;
    selected.parentNode.classList.add('sorting');
  }, 100);
  if(e.target.closest('song')) {
    e.target.closest('song').querySelectorAll('.wrap [contentEditable="true"]').forEach(function(el) {el.classList.add('contenteditable-disabled'); el.removeAttribute('contenteditable')});
  }
  else {
    if(document.body.classList.contains('song')){
      document.getElementById('song').classList.add('dropHere');
    } else {
      document.getElementById('column-filler').classList.add('dropHere');
    }
  }
}
function dragEnter( e, selector='li' ) {
  e.preventDefault(); // Allows us to drop.
  var li = e.target.closest(selector);
  if(isVerboten(li)){return}
  [].forEach.call(document.querySelectorAll(selector), function (song) {
    song.classList.remove('overt');  
    song.classList.remove('overb');  
  });
  if(li !== selected) {
    if(isBefore(selected, li)) {
      li.classList.add('overt');
    } 
    else {
      li.classList.add('overb');
    }
  }
}
function dragLeave( e ) {
}
function dragDrop( e, selector='li' ) {
  e.preventDefault();
  var li = e.target.closest(selector) || e.target;
  if (e.stopPropagation) {
    e.stopPropagation(); // stops the browser from redirecting.
  }
  if(isVerboten(li)){
    if(li.parentNode != selected.parentNode){
      dataxInBookUpdate(selected, true);
      selected.remove();
    }
  }
  else if(li.parentNode != selected.parentNode){
    dataxInBookUpdate(selected);
    let songEl = selected.cloneNode(true);
    bind_songbook_edit(songEl);
    if($(songEl).attr('data-song-id')=="section"){
      add_edit_pencil(songEl);
    }

    $(songEl).find('a').after('<button>&#128465;</button>');
    $(songEl).find('button')[0].addEventListener('click', function( e ) {
      dataxInBookUpdate(songEl, true);
      scaleRemove(songEl);
    });
    $(songEl).attr('data-song-status','n')[0].addEventListener('click', function(e) {
      if(window.songbookEditing && window.songbook.showStatus && e.offsetX < 20){
        e.preventDefault();
        cycleStatus(this);
      }
    });
    if(li.nodeName === 'UL'){  //This catches empty lists
      li.append(songEl);
    }
    else if(isBefore(selected, li)) {
      li.parentNode.insertBefore(songEl, li);
    } 
    else {
      li.parentNode.insertBefore(songEl, li.nextSibling);
    }
    if(window.innerWidth > 1150 || location.hash.indexOf('s-') > -1) {
      location.hash = $(songEl).find('a')[0].href.replace(/^.*#/,'#');
    }
    songEl.classList.add('highlightBg');
    setTimeout(function(){songEl.classList.remove('highlightBg')},3000);
  }
  else {
    if (isBefore(selected, li)) {
      li.parentNode.insertBefore(selected, li);
    } 
    else {
      li.parentNode.insertBefore(selected, li.nextSibling);
    }
    if(window.innerWidth > 1150 || location.hash.indexOf('s-') > -1) {
      location.hash = $(selected).find('a')[0].href.replace(/^.*#/,'#');
    }
  }
  window.songbook_list.reIndex();
  e.dataTransfer.clearData();
}
function isVerboten(target) {
  if (target.closest('#songListEdit') == null) {
    return false
  }
  else {
    return true
  }
}

function isBefore( el1, el2 ) {
  var cur
  if ( el2.parentNode === el1.parentNode ) {
    for ( cur = el1.previousSibling; cur; cur = cur.previousSibling ) {
      if (cur === el2) return true
    }
  } else return false;
}

const target = document.documentElement;
target.addEventListener("dragover", (e) => {
  if(e.target.classList.contains('dropHere')){
    e.preventDefault(); // prevent default to allow drop
  }
});

target.addEventListener("drop", (e) => {
  e.preventDefault();
  // navigate to that song.
  location.hash = `${location.hash.replace('#','').split('&')[0]}&${selected.getAttribute('data-song-id')}`;
});

function dragDialog() {
  function AnimationLoop(){
    var animations = [],
        animating = true,
        frame;

    function animate(){
      if ( frame ) { return; }
      if ( animating ) { frame = requestAnimationFrame(animate); }
      var i = animations.length;
      while ( i-- ) {
        if ( !animations[i] || animations[i]() === false ) { animations.splice(i, 1); }
      }
      frame = null;
    };

    function add(){ 
      animations.push.apply(animations,arguments); 
    };

    add.apply(null,arguments);
    //animate();  //I've turned off the always on animation loop

    return {
      animations: animations,
      add: add, 
      stop: function(){ animating = false; animations = []; },  //RESETING animations like here is a bad idea if you have more than one going.
      start: function(){ animating = true; animate(); }
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
