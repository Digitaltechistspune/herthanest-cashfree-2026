(function ($) {
  "use strict";
  jQuery(document).ready(function() {
    // menu toggler js
    $("button.navbar-toggle").on('click', function() {
      $(".main-menu-area").addClass("active");
      $(".mm-fullscreen-bg").addClass("active");
      $("body").addClass("ov-hidden");
    });
    $(".close-box").on('click', function() {
      $(".main-menu-area").removeClass("active");
      $(".mm-fullscreen-bg").removeClass("active");
      $("body").removeClass("ov-hidden");
    });

    // filter button js
    $("button.filter-button").on('click', function() {
      $(".filter-sidebar").addClass("active");
      $(".mm-fullscreen-bg").addClass("active");
    });
    $("button.close-filter-sidebar").on('click', function() {
      $(".filter-sidebar").removeClass("active");
      $(".mm-fullscreen-bg").removeClass("active");
    });

    // body background color js
    $(".mm-fullscreen-bg").on('click',function() {
      $(".main-menu-area").removeClass("active");
      $(".filter-sidebar").removeClass("active");
      $(".mm-fullscreen-bg").removeClass("active");
      $("body").removeClass("hidden");
    });
    $('.checkout-btn .read-agree').on('click', function () {
      if($('.cust-checkbox').is(':checked')) {
        $('.checkout-btn button.check-btn').removeAttr('disabled');
      }
      else {
        $('.checkout-btn button.check-btn').attr('disabled', 'disabled');
      }
    });
    $('.read-agree').on('click', function () {
      if($('.create-checkbox').is(':checked')) {
        $('.create').removeAttr('disabled');
      }
      else {
        $('.create').attr('disabled', 'disabled');
      }
    });
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
      return new bootstrap.Tooltip(tooltipTriggerEl)
    });
    
    // product-img full-view & magnific popup
    $('.full-view, .zoom').on('click', function() {
      $('.product_img_top').magnificPopup({
        delegate: 'a',
        type:'image',
        showCloseBtn: true,
        closeBtnInside: false,
        midClick: true,
        tLoading: 'Loading image #%curr%...',
        mainClass: 'mfp-img-mobile',
        gallery: {
          enabled: true,
          navigateByImgClick: true,
          preload: [0,1]
        }
      }).magnificPopup('open');
    });
    $('.play-button, .popup-vimeo, .popup-gmaps').magnificPopup({
      tClose: 'Close (Esc)',
      type: 'iframe',
      mainClass: 'mfp-fade',
      removalDelay: 160,
      preloader: false,
      fixedContentPos: false
    });
    $('.item-data').on("click", function() {
      $(this).parents('.option-block').find(".variant-option").removeClass('active-variant');
      $(this).closest('form-wrap').addClass('active-variant');
      var it_img = $(this).attr('dataimg');
      $(this).parents('.single-product-wrap').find('.product-image .img1 img').attr('src',it_img);
      $(this).parents('.single-product-wrap').find('.product-image .img1 img').attr('srcset',it_img);
      var price = $(this).attr('dataprice');
      var compareprice = $(this).attr('datacompare');
      var stocks = $(this).attr('dataavailable');
      $(this).parents('.single-product-wrap').find('.price-box .new-price').text(Shopify.formatMoney(price, window.money_format));
      if (compareprice > price) {
        $(this).parents('.single-product-wrap').find('.price-box .old-price').show();
        $(this).parents('.single-product-wrap').find('.price-box .old-price').html(Shopify.formatMoney(compareprice, window.money_format));
      }else{
        $(this).parents('.single-product-wrap').find('.price-box .old-price').hide();
      }
    });
  });
})(jQuery);
