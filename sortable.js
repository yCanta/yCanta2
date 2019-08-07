var selected
var counter = 0;

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
  counter = 0;
}

function dragStart( e ) {
  e.dataTransfer.effectAllowed = "move"
  e.dataTransfer.setData( "text/plain", null )
  selected = $(e.target).closest('li')[0];
  selected.classList.add('moving');

}
function dragEnter( e ) {
  counter++;
  var li = $(e.target).closest('li')[0];
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
  counter--;
  if(counter === 0){
    var li = $(e.target).closest('li')[0];
    li.classList.remove('overt');
    li.classList.remove('overb');
  }
}
function dragDrop( e ) {
  var li = $(e.target).closest('li')[0];
  if (e.stopPropagation) {
    e.stopPropagation(); // stops the browser from redirecting.
  }
  if (isBefore(selected, li)) {
    li.parentNode.insertBefore(selected, li)
  } 
  else {
    li.parentNode.insertBefore(selected, li.nextSibling)
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
