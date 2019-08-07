var selected

function dragOver( e ) {
    if (e.preventDefault) {
      e.preventDefault(); // Allows us to drop.
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function dragEnd( e ) {
  [].forEach.call(document.querySelectorAll('ul li'), function (song) {
    song.classList.remove('moving');
    song.classList.remove('overt');  
    song.classList.remove('overb');  
  });
  selected = null
}

function dragStart( e ) {
  e.dataTransfer.effectAllowed = "move"
  e.dataTransfer.setData( "text/plain", null )
  selected = $(e.target).closest('li')[0];
  selected.classList.add('moving');

}
function dragEnter( e ) {
  var li = $(e.target).closest('li')[0];
  if(isVerboten(li)){ return }
  [].forEach.call(document.querySelectorAll('ul li'), function (song) {
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
function dragDrop( e ) {
  e.preventDefault();
  var li = $(e.target).closest('li')[0] || e.target;
  if (e.stopPropagation) {
    e.stopPropagation(); // stops the browser from redirecting.
  }
  if(isVerboten(li)){
    if(li.parentNode != selected.parentNode){
      selected.remove();
    }
  }
  else if(li.parentNode != selected.parentNode){
    song = selected.cloneNode(true);
    song.addEventListener('dragstart', dragStart, false);
    song.addEventListener('dragenter', dragEnter, false);
    song.addEventListener('dragover', dragOver, false);
    song.addEventListener('dragleave', dragLeave, false);
    song.addEventListener('drop', dragDrop, false);
    song.addEventListener('dragend', dragEnd, false);
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
  if ($(target).closest('#songListEdit').length == 0) {
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
[].forEach.call(document.querySelectorAll('ul li'), function (song) {
  song.setAttribute('draggable', 'true');  // Enable columns to be draggable.
  song.addEventListener('dragstart', dragStart, false);
  song.addEventListener('dragenter', dragEnter, false);
  song.addEventListener('dragover', dragOver, false);
  song.addEventListener('dragleave', dragLeave, false);
  song.addEventListener('drop', dragDrop, false);
  song.addEventListener('dragend', dragEnd, false);
});