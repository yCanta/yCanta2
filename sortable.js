var selected

function dragOver( e ) {
    if (e.preventDefault) {
      e.preventDefault(); // Allows us to drop.
    }
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
  });
  selected = null
}

function dragStart( e, selector='li' ) {
  e.dataTransfer.effectAllowed = "move"
  e.dataTransfer.setData( "text/plain", '' )
  selected = e.target.closest(selector);
  selected.classList.add('moving');

}
function dragEnter( e, selector='li' ) {
  var li = e.target.closest(selector);
  if(isVerboten(li)){ return }
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
    song = selected.cloneNode(true);
    bind_songbook_edit(song);
    $(song).find('a').after('<button>&#128465;</button>');
    $(song).find('button')[0].addEventListener('click', function( e ) {
      dataxInBookUpdate(song, true);
      scaleRemove(song);
    });
    if(li.nodeName === 'UL'){  //This catches empty lists
      li.append(song);
    }
    else if(isBefore(selected, li)) {
      li.parentNode.insertBefore(song, li);
    } 
    else {
      li.parentNode.insertBefore(song, li.nextSibling);
    }
  }
  else {
    if (isBefore(selected, li)) {
      li.parentNode.insertBefore(selected, li);
    } 
    else {
      li.parentNode.insertBefore(selected, li.nextSibling);
    }
  }
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
