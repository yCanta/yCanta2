$(function () {

  //float menu activation
  $('.float-menu-toggle').siblings().slideToggle('fast');
  $('body').on('click', '.float-menu-toggle', function() {
    $(this).children('.float-menu-icon').toggleClass('icon-rotate');
    $(this).siblings().slideToggle('fast');
  });
  /*$('body').on('click', '.float-menu-item:not(:last-child)', function() {
    $(this).closest('.float-menu').find('.float-menu-toggle').siblings().slideToggle('fast');
  });*/

  //chord toggling
  $('body').on('click', '.toggle-chords', function() {
    $('#song').toggleClass('nochords');
  });
});
