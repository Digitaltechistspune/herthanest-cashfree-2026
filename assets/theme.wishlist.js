addEventListener('DOMContentLoaded', (event) => {
  $(".wishlist-custom-action").each(function() {
    var attr = $(this).attr("data-handle");
    if (localStorage.getItem('user_wishlist_cnt') !== null) {
      var existing_wishlist = JSON.parse(localStorage.getItem('wishlist'));
      if ($.inArray(attr, existing_wishlist)>=0){
       $(this).addClass('active-wishlist');
       $(this).removeClass('wishlist-custom-action');
      }
      $('.wishlist-counter').text(localStorage.getItem('user_wishlist_cnt'));
    }else{
      $('.wishlist-counter').text('0');
    }
  });
  if (localStorage.getItem("wishlist")) {
    var wishlist_pro = JSON.parse(localStorage.getItem('wishlist'));
  } else {
      var wishlist_pro = [];
  }
  jQuery(document).on('click', '.wishlist-custom-action', function(e) {
    e.preventDefault();
      console.log(wishlist_pro);
      var value = $(this).attr('data-handle');
      if ($.inArray(value, wishlist_pro) === -1) {
        // Value not in the array, so push it
        if (localStorage.getItem("wishlist")) {
          var wishlist_pro = JSON.parse(localStorage.getItem('wishlist'));
        } else {
            var wishlist_pro = [];
        }
        wishlist_pro.push(value); 
      } 
      localStorage.setItem('wishlist', JSON.stringify(wishlist_pro));
      localStorage.setItem('user_wishlist_cnt', wishlist_pro.length);
      $(this).removeClass('wishlist-custom-action');
      $(this).addClass('active-wishlist');
      $(".wishlist[data-handle='"+value+"']").addClass('active-wishlist');
      $(".wishlist[data-handle='"+value+"']").removeClass('wishlist-custom-action');
      if (localStorage.getItem('user_wishlist_cnt') !== null) {
        var existing_wishlist = localStorage.getItem('user_wishlist_cnt');
        $('.wishlist-counter').text(existing_wishlist);
      }else{
        $('.wishlist-counter').text('0');
      }
  });
 jQuery(document).on('click', '.active-wishlist', function(e) {
       e.preventDefault();
        var to_delete = $(this).attr('data-handle');
        var wishlist_pro = JSON.parse(localStorage.getItem('wishlist'));
        var index = wishlist_pro.indexOf(to_delete);
        if (index > -1) {
          wishlist_pro.splice(index, 1);//remove it
          localStorage.setItem('user_wishlist_cnt', wishlist_pro.length);
          $(this).removeClass('active-wishlist');
          $(this).addClass('wishlist-custom-action');
          $(".wishlist[data-handle='"+to_delete+"']").removeClass('active-wishlist');
          $(".wishlist[data-handle='"+to_delete+"']").addClass('wishlist-custom-action');
          if (localStorage.getItem('user_wishlist_cnt') !== null) {
            var existing_cnt = localStorage.getItem('user_wishlist_cnt');
            $('.wishlist-counter').text(existing_cnt);
          }else{
            $('.wishlist-counter').text('0');
          }
          var wishlist_pro = localStorage.setItem('wishlist',JSON.stringify(wishlist_pro));
        }
  });  
});
var attr = $(this).attr("data-handle");
    if (localStorage.getItem('user_wishlist_cnt') !== null) {
      var existing_wishlist = JSON.parse(localStorage.getItem('wishlist'));
      if ($.inArray(attr, existing_wishlist)>=0){
       $(this).addClass('active-wishlist');
       $(this).removeClass('wishlist-custom-action');
      }
      $('.wishlist-counter').text(localStorage.getItem('user_wishlist_cnt'));
    }else{
      $('.wishlist-counter').text('0');
    }