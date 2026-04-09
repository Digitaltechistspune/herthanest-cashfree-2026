const RELOAD_TIMER = 300;
const SP_OBJECT = {
  ajxcartRefresh: 'cart-update',
  qtyRefresh: 'quantity-update',
  swatchUpdate: 'variant-change'
};
let users = {}
function user(eventName, callback) {
  if (users[eventName] === undefined) {
    users[eventName] = []
  }
  users[eventName] = [...users[eventName], callback];
  return function unuser() {
    users[eventName] = users[eventName].filter((cb) => {
      return cb !== callback
    });
  }
};
function live(eventName, data) {
  if (users[eventName]) {
    users[eventName].forEach((callback) => {
      callback(data)
    })
  }
}
function animate() {
  document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`);
}
['load', 'scroll', 'resize'].forEach(eventName => window.addEventListener(eventName, animate));
function getClickable(container) {
  return Array.from(
    container.querySelectorAll(
      "summary, a[href], button:enabled, [tabindex]:not([tabindex^='-']), [draggable], area, input:not([type=hidden]):enabled, select:enabled, textarea:enabled, object, iframe"
    )
  );
}
const getScrollTop = (element) => {
  let offsetTop = 0
  do {
    if (!isNaN(element.offsetTop)) {
      offsetTop += element.offsetTop
    }
  } while ((element = element.offsetParent))
  return offsetTop
}
const portView = (element) => {
  const windowBottom = window.pageYOffset + window.innerHeight;
  return windowBottom >= getScrollTop(element);
}
if (!window.Shopify.designMode) {
  document.querySelectorAll('[data-fade-in]').forEach((element) => {
    ['load', 'scroll', 'shopify:section:load'].forEach((eventName) => {
      window.addEventListener(eventName, () => {
        if (!portView(element)) {
          return;
        }
        element.classList.add('fade-in');
      })
    })
  })
}
const triggerClickFocus = {};
function triggerClick(container, tagClicked = container) {
  var elements = getClickable(container);
  var first = elements[0];
  var last = elements[elements.length - 1];
  triggerClickClose();
  triggerClickFocus.focusin = (event) => {
    if (
      event.target !== container &&
      event.target !== last &&
      event.target !== first
    )
      return;
    document.addEventListener('keydown', triggerClickFocus.keydown);
  };
  triggerClickFocus.focusout = function() {
    document.removeEventListener('keydown', triggerClickFocus.keydown);
  };
  triggerClickFocus.keydown = function(event) {
    if (event.code.toUpperCase() !== 'TAB') return; // If not TAB key
    // On the last focusable element and tab forward, focus the first element.
    if (event.target === last && !event.shiftKey) {
      event.preventDefault();
      first.focus();
    }
    //  On the first focusable element and tab backward, focus the last element.
    if (
      (event.target === container || event.target === first) &&
      event.shiftKey
    ) {
      event.preventDefault();
      last.focus();
    }
  };
  document.addEventListener('focusout', triggerClickFocus.focusout);
  document.addEventListener('focusin', triggerClickFocus.focusin);
  tagClicked.focus();
  if (tagClicked.tagName === 'INPUT' &&
    ['search', 'text', 'email', 'url'].includes(tagClicked.type) &&
    tagClicked.value) {
    tagClicked.setSelectionRange(0, tagClicked.value.length);
  }
}
// Here run the querySelector to figure out if the browser supports :focus-visible or not and run code based on it.
try {
  document.querySelector(":focus-visible");
} catch(e) {
  triggerShow();
}
function triggerShow() {
  const keyCont = ['ARROWUP', 'ARROWDOWN', 'ARROWLEFT', 'ARROWRIGHT', 'TAB', 'ENTER', 'SPACE', 'ESCAPE', 'HOME', 'END', 'PAGEUP', 'PAGEDOWN']
  let nowClickedTag = null;
  let clickCont = null;
  window.addEventListener('keydown', (event) => {
    if(keyCont.includes(event.code.toUpperCase())) {
      clickCont = false;
    }
  });
  window.addEventListener('mousedown', (event) => {
    clickCont = true;
  });
  window.addEventListener('focus', () => {
    if (nowClickedTag) nowClickedTag.classList.remove('focused');
    if (clickCont) return;
    nowClickedTag = document.activeElement;
    nowClickedTag.classList.add('focused');
  }, true);
}
function triggerClickClose(tagClicked = null) {
  document.removeEventListener('focusin', triggerClickFocus.focusin);
  document.removeEventListener('focusout', triggerClickFocus.focusout);
  document.removeEventListener('keydown', triggerClickFocus.keydown);
  if (tagClicked) tagClicked.focus();
}
function escClick(event) {
  if (event.code.toUpperCase() !== 'ESCAPE') return;
  const openDetailsElement = event.target.closest('details[open]');
  if (!openDetailsElement) return;
  const summaryElement = openDetailsElement.querySelector('summary');
  openDetailsElement.removeAttribute('open');
  summaryElement.setAttribute('aria-expanded', false);
  summaryElement.focus();
}
class qtyBox extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('input');
    this.changeEvent = new Event('change', { bubbles: true });
    this.input.addEventListener('change', this.qtyInputupdate.bind(this));
    this.querySelectorAll('button').forEach(
      (button) => button.addEventListener('click', this.BtTrigger.bind(this))
    );
  }
  qtyInputupdateBlank = undefined;
  connectedCallback() {
    this.requreQtyterm();
    this.qtyInputupdateBlank = user(SP_OBJECT.qtyRefresh, this.requreQtyterm.bind(this));
  }
  disconnectedCallback() {
    if (this.qtyInputupdateBlank) {
      this.qtyInputupdateBlank();
    }
  }
  qtyInputupdate(event) {
    this.requreQtyterm();
  }
  BtTrigger(event) {
    event.preventDefault();
    const pastValue = this.input.value;
    event.target.name === 'plus' ? this.input.stepUp() : this.input.stepDown();
    if (pastValue !== this.input.value) this.input.dispatchEvent(this.changeEvent);
  }
  requreQtyterm() {
    const value = parseInt(this.input.value);
    if (this.input.min) {
      const min = parseInt(this.input.min);
      const qtyDecrease = this.querySelector(".qty-bt[name='minus']");
      qtyDecrease.classList.toggle('disabled', value <= min);
    }
    if (this.input.max) {
      const max = parseInt(this.input.max);
      const qtyIncrease = this.querySelector(".qty-bt[name='plus']");
      qtyIncrease.classList.toggle('disabled', value >= max);
    } 
  }
}
customElements.define('qty-box', qtyBox);
function stdebounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}
function stFetchConfig(type = 'json') {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': `application/${type}` }
  };
}
if ((typeof window.Shopify) == 'undefined') {
  window.Shopify = {};
}
Shopify.bind = function(fn, scope) {
  return function() {
    return fn.apply(scope, arguments);
  }
};
Shopify.setSelectorByValue = function(selector, value) {
  for (var i = 0, count = selector.options.length; i < count; i++) {
    var option = selector.options[i];
    if (value == option.value || value == option.innerHTML) {
      selector.selectedIndex = i;
      return i;
    }
  }
};
Shopify.addListener = function(target, eventName, callback) {
  target.addEventListener ? target.addEventListener(eventName, callback, false) : target.attachEvent('on'+eventName, callback);
};
Shopify.postLink = function(path, options) {
  options = options || {};
  var method = options['method'] || 'post';
  var params = options['parameters'] || {};
  var form = document.createElement("form");
  form.setAttribute("method", method);
  form.setAttribute("action", path);
  for(var key in params) {
    var hiddenField = document.createElement("input");
    hiddenField.setAttribute("type", "hidden");
    hiddenField.setAttribute("name", key);
    hiddenField.setAttribute("value", params[key]);
    form.appendChild(hiddenField);
  }
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};
Shopify.CountryProvinceSelector = function(country_domid, province_domid, options) {
  this.countryEl         = document.getElementById(country_domid);
  this.provinceEl        = document.getElementById(province_domid);
  this.provinceContainer = document.getElementById(options['hideElement'] || province_domid);
  Shopify.addListener(this.countryEl, 'change', Shopify.bind(this.countryHandler,this));
  this.initCountry();
  this.initProvince();
};
Shopify.CountryProvinceSelector.prototype = {
  initCountry: function() {
    var value = this.countryEl.getAttribute('data-default');
    Shopify.setSelectorByValue(this.countryEl, value);
    this.countryHandler();
  },
  initProvince: function() {
    var value = this.provinceEl.getAttribute('data-default');
    if (value && this.provinceEl.options.length > 0) {
      Shopify.setSelectorByValue(this.provinceEl, value);
    }
  },
  countryHandler: function(e) {
    var opt       = this.countryEl.options[this.countryEl.selectedIndex];
    var raw       = opt.getAttribute('data-provinces');
    var provinces = JSON.parse(raw);
    this.clearOptions(this.provinceEl);
    if (provinces && provinces.length == 0) {
      this.provinceContainer.style.display = 'none';
    } else {
      for (var i = 0; i < provinces.length; i++) {
        var opt = document.createElement('option');
        opt.value = provinces[i][0];
        opt.innerHTML = provinces[i][1];
        this.provinceEl.appendChild(opt);
      }
      this.provinceContainer.style.display = "";
    }
  },
  clearOptions: function(selector) {
    while (selector.firstChild) {
      selector.removeChild(selector.firstChild);
    }
  },
  setOptions: function(selector, values) {
    for (var i = 0, count = values.length; i < values.length; i++) {
      var opt = document.createElement('option');
      opt.value = values[i];
      opt.innerHTML = values[i];
      selector.appendChild(opt);
    }
  }
};
class stModalcontent extends HTMLElement {
  constructor() {
    super();
    this.querySelector('[id^="stclose-"]').addEventListener(
      'click',
      this.hide.bind(this, false)
    );
    this.addEventListener('keyup', (event) => {
      if (event.code.toUpperCase() === 'ESCAPE') this.hide();
    });
    if (this.classList.contains('media-modal')) {
      this.addEventListener('pointerup', (event) => {
        if (event.pointerType === 'mouse' && !event.target.closest('deferred-media, product-model')) this.hide();
      });
    } else {
      this.addEventListener('click', (event) => {
        if (event.target === this) this.hide();
      });
    }
  }
  connectedCallback() {
    if (this.moved) return;
    this.moved = true;
    document.body.appendChild(this);
  }
  show(opener) {
    this.openedBy = opener;
    const popup = this.querySelector('.template-popup');
    
    this.setAttribute('open', '');
    if (popup) popup.loadContent();
    triggerClick(this, this.querySelector('[role="dialog"]'));
  }

  hide() {
    
    document.body.dispatchEvent(new CustomEvent('modalClosed'));
    this.removeAttribute('open');
    triggerClickClose(this.openedBy);
  }
}
customElements.define('modal-dialog', stModalcontent);
class stModalshower extends HTMLElement {
  constructor() {
    super();
    const button = this.querySelector('a');
    if (!button) return;
    button.addEventListener('click', () => {
      const modal = document.querySelector(this.getAttribute('data-modal'));
      if (modal) modal.show(button);
    });
  }
}
customElements.define('qv-modal', stModalshower);
class Swatchoption extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('change', this.swatchUpdate);
  }
  swatchUpdate() {
    this.itemsUpdate();
    this.stupdateMasterId();
    this.btAddButton(true, '', false);
    this.stErrortxtRemove();
    this.updateSwatchStatuses();
    if (!this.swatch) {
      this.btAddButton(true, '', true);
      this.stInaccessible();
    } else {
      this.stupdateURL();
      this.changeSwatchInput();
      this.includeProInf();
      this.updateDiscount();
      this.updateImage();
    }
  }
  updateImage() {
    var product_id = this.swatch.featured_image.product_id;
    if (this.swatch && this.swatch.featured_image) {
      if(jQuery('.pro_details_pos .swiper-slide').length >= 1){
        var layout = jQuery('#slider-small-'+product_id+' .swiper-slide[data-image-id="' + this.swatch.featured_media.id + '"]').attr('data-layout');
        if(layout == "full-slider"){
          var swiper = new Swiper(".slider-small-"+product_id, {
            spaceBetween: 15,
            slidesPerView: 3,
            navigation: {
              nextEl: ".button-next",
              prevEl: ".button-prev"
            },
            breakpoints: {
              0: {
                slidesPerView: 1,
              },
              320: {
                slidesPerView: 1,
              },
              480: {
                slidesPerView: 3,
              },
            }
          });
          const unGroupMedia = document.querySelector(`#slider-small-`+product_id+` .swiper-slide[data-image-id="`+this.swatch.featured_media.id+`"]`);
          // console.log(unGroupMedia.realIndex);
          const mediaIndex = unGroupMedia.getAttribute('data-index');
          console.log(unGroupMedia);
          console.log(mediaIndex);
          if(mediaIndex == 1){
           swiper.destroy();
            var swiper = new Swiper(".slider-small-"+product_id, {
              spaceBetween: 15,
              slidesPerView: 3,
              navigation: {
                nextEl: ".button-next",
                prevEl: ".button-prev"
              },
              breakpoints: {
                0: {
                  slidesPerView: 1,
                },
                320: {
                  slidesPerView: 1,
                },
                480: {
                  slidesPerView: 3,
                },
              }
            });
          }else{
            var new_index = parseInt(mediaIndex) - 1;
            swiper.slideTo(new_index,500, true); 
          }
          }else{
            var slider_pos = jQuery('#slider-small-'+product_id+' .swiper-slide[data-image-id="' + this.swatch.featured_media.id + '"]').attr('data-slide');
            if(slider_pos == 'vertical'){
              var dr = 'vertical';
              var sv = 'auto';
            }else{
              var dr =  'horizontal';
              var sv =  5;
            }
             var swiper = new Swiper(".slider-small-"+product_id, {
              spaceBetween: 15,
              slidesPerView: sv,
              direction: dr,
              mousewheel: true,
              slideToClickedSlide: true,
               breakpoints: {
                0: {
                  slidesPerView: 3,
                  direction: 'horizontal'
                },
                320: {
                  slidesPerView: 3,
                  direction: 'horizontal'
                },
                480: {
                  slidesPerView: sv,
                  direction: dr,
                },
              }
            });
             var swiper2 = new Swiper(".slider-big-"+product_id, {
                spaceBetween: 0,
                slidesPerView: 1,
                autoHeight: true,
                slideToClickedSlide: true,
                navigation: {
                  nextEl: ".button-next",
                  prevEl: ".button-prev"
                },
                thumbs: {
                  swiper: swiper,
                },
              });
            const unGroupMedia = document.querySelector(`#slider-small-`+product_id+` .swiper-slide[data-image-id="`+this.swatch.featured_media.id+`"]`);
            // console.log(unGroupMedia.realIndex);
            const mediaIndex = unGroupMedia.getAttribute('data-index');
            if(mediaIndex == 1){
             swiper2.destroy();
              var swiper2 = new Swiper(".slider-big-"+product_id, {
                spaceBetween: 0,
                slidesPerView: 1,
                autoHeight: true,
                slideToClickedSlide: true,
                loop: true,
                loopedSlides: 50,
                navigation: {
                  nextEl: ".button-next",
                  prevEl: ".button-prev"
                },
                thumbs: {
                  swiper: swiper,
                },
              });
           }else{
              var new_index = parseInt(mediaIndex) - 1;
              swiper2.slideTo(new_index,500, true);
          }
        }
      }
    }
  }
  updateDiscount() {
    var $ProductDiscount = $('#ProductDiscount'),
    $productPrice = $('#ProductPrice'),
    $comparePrice = $('#ComparePrice');
    if(this.swatch.price < this.swatch.compare_at_price) {
      $ProductDiscount.html(((this.swatch.compare_at_price - this.swatch.price)*100.0/(this.swatch.compare_at_price)).toFixed());
      $ProductDiscount.show();
    }else{
      $ProductDiscount.hide();
    }
  }
  itemsUpdate() {
    this.options = Array.from(this.querySelectorAll('select'), (select) => select.value);
  }
  stupdateMasterId() {
    this.swatch = this.stSwatchDate().find((variant) => {
      return !variant.options.map((option, index) => {
        return this.options[index] === option;
      }).includes(false);
    });
  }
  stupdateURL() {
    if (!this.swatch || this.dataset.updateUrl === 'false') return;
    window.history.replaceState({ }, '', `${this.dataset.url}?variant=${this.swatch.id}`);
  }
  changeSwatchInput() {
    const stproductForms = document.querySelectorAll(`#product-form-${this.dataset.section}, #product-form-installment-${this.dataset.section}`);
    stproductForms.forEach((stproductForm) => {
      const input = stproductForm.querySelector('input[name="id"]');
      input.value = this.swatch.id;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  updateSwatchStatuses() {
    const activatedSwatch = this.variantData.filter(variant => this.querySelector(':checked').value === variant.option1);
    const stinputWrappers = [...this.querySelectorAll('.op-field')];
    stinputWrappers.forEach((option, index) => {
      if (index === 0) return;
      const stoptionInputs = [...option.querySelectorAll('input[type="radio"], option')]
      const pastOptionSelected = stinputWrappers[index - 1].querySelector(':checked').value;
      const avOptionInVal = activatedSwatch.filter(variant => variant.available && variant[`option${ index }`] === pastOptionSelected).map(variantOption => variantOption[`option${ index + 1 }`]);
      this.stInAva(stoptionInputs, avOptionInVal)
    });
  }
  stInAva(stlistOfOptions, stlistOfAvOptions) {
    stlistOfOptions.forEach(input => {
      if (stlistOfAvOptions.includes(input.getAttribute('value'))) {
        input.innerText = input.getAttribute('value');
      } else {
        input.innerText = window.stThemeString.StrunavailableOp.replace('[value]', input.getAttribute('value'));
      }
    });
  }
  stErrortxtRemove() {
    const section = this.closest('section');
    if (!section) return;
    const stproductForm = section.querySelector('cart-action');
    if (stproductForm) stproductForm.stHandErrorTxt();
  }
  includeProInf() {
    const reqSwatchId = this.swatch.id;
    const stScId = this.dataset.originalSection ? this.dataset.originalSection : this.dataset.section;
    fetch(`${this.dataset.url}?variant=${reqSwatchId}&section_id=${this.dataset.originalSection ? this.dataset.originalSection : this.dataset.section}`)
    .then((response) => response.text())
    .then((responseText) => {
      // prevent unnecessary ui changes from abandoned selections
      if (this.swatch.id !== reqSwatchId) return;
      const html = new DOMParser().parseFromString(responseText, 'text/html')
      const goal = document.getElementById(`price-${this.dataset.section}`);
      const source = html.getElementById(`price-${this.dataset.originalSection ? this.dataset.originalSection : this.dataset.section}`);
      const skuSource = html.getElementById(`Sku-${this.dataset.originalSection ? this.dataset.originalSection : this.dataset.section}`);
      const skuGoal = document.getElementById(`Sku-${this.dataset.section}`);
      const inventorySource = html.getElementById(`Inventory-${this.dataset.originalSection ? this.dataset.originalSection : this.dataset.section}`);
      const invGoal = document.getElementById(`Inventory-${this.dataset.section}`);
      if (source && goal) goal.innerHTML = source.innerHTML;
      if (inventorySource && invGoal) invGoal.innerHTML = inventorySource.innerHTML;
      if (skuSource && skuGoal) {
        skuGoal.innerHTML = skuSource.innerHTML;
        skuGoal.classList.toggle('visibility-hidden', skuSource.classList.contains('visibility-hidden'));
      }
      const price = document.getElementById(`price-${this.dataset.section}`);
      if (price) price.classList.remove('visibility-hidden');
      if (invGoal) invGoal.classList.toggle('visibility-hidden', inventorySource.innerText === '');
      const cartBtUpdated = html.getElementById(`ProductSubmitButton-${stScId}`);
      this.btAddButton(cartBtUpdated ? cartBtUpdated.hasAttribute('disabled') : true, window.stThemeString.Strsoldout);
      live(SP_OBJECT.swatchUpdate, {data: {
        stScId,
        html,
        variant: this.swatch
      }});
    });
  }
  btAddButton(disable = true, text, modifyClass = true) {
    const stproductForm = document.getElementById(`product-form-${this.dataset.section}`);
    if (!stproductForm) return;
    const cartBt = stproductForm.querySelector('[name="add"]');
    const cartBtText = stproductForm.querySelector('[name="add"] > span');
    // alert('asd');
    if (!cartBt) return;
    if (disable) {
      cartBt.setAttribute('disabled', 'disabled');
      if (text) cartBtText.textContent = text;
    } else {
      cartBt.removeAttribute('disabled');
      cartBtText.textContent = window.stThemeString.Straddcart;
    }
    if (!modifyClass) return;
  }
  stInaccessible() {
    const button = document.getElementById(`product-form-${this.dataset.section}`);
    const cartBt = button.querySelector('[name="add"]');
    const cartBtText = button.querySelector('[name="add"] > span');
    const price = document.getElementById(`price-${this.dataset.section}`);
    const inventory = document.getElementById(`Inventory-${this.dataset.section}`);
    const sku = document.getElementById(`Sku-${this.dataset.section}`);
    if (!cartBt) return;
    cartBtText.textContent = window.stThemeString.Strunavailable;
    if (price) price.classList.add('visibility-hidden');
    if (inventory) inventory.classList.add('visibility-hidden');
    if (sku) sku.classList.add('visibility-hidden');
  }
  stSwatchDate() {
    this.variantData = this.variantData || JSON.parse(this.querySelector('[type="application/json"]').textContent);
    return this.variantData;
  }
}

customElements.define('selects-box', Swatchoption);

class SwatchCheck extends Swatchoption {
  constructor() {
    super();
  }
  stInAva(stlistOfOptions, stlistOfAvOptions) {
    stlistOfOptions.forEach(input => {
      if (stlistOfAvOptions.includes(input.getAttribute('value'))) {
        input.classList.remove('disabled');
      } else {
        input.classList.add('disabled');
      }
    });
  }
  itemsUpdate() {
    const varitems = Array.from(this.querySelectorAll('varitem'));
    this.options = varitems.map((varitem) => {
      return Array.from(varitem.querySelectorAll('input')).find((radio) => radio.checked).value;
    });
  }
}
customElements.define('pr-option', SwatchCheck);
class StRecomPro extends HTMLElement {
  constructor() {
    super();
  }
  connectedCallback() {
    const sthandleIntersection = (entries, observer) => {
      if (!entries[0].isIntersecting) return;
      observer.unobserve(this);
      fetch(this.dataset.url)
        .then((response) => response.text())
        .then((text) => {
          const html = document.createElement('div');
          html.innerHTML = text;
          const recommrela = html.querySelector('relative-pro');
          if (recommrela && recommrela.innerHTML.trim().length) {
            this.innerHTML = recommrela.innerHTML;
            if ($('.item-data').length >= 1) {
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
            }
            var slide_view = jQuery('#related-slider').attr('slide-view');
            var slide_view_lg = jQuery('#related-slider').attr('slide-view-lg');
            var slide_view_sm = jQuery('#related-slider').attr('slide-view-sm');
            var swiper = new Swiper('#related-slider', {
              slidesPerView: slide_view,
              grid: {
                rows: 1,
                fill: 'row' | 'column',
              },
              spaceBetween: 30,
              observer: true,
              observeParents: true,
              watchSlidesProgress: true,
              navigation: {
                nextEl: '.swiper-next',
                prevEl: '.swiper-prev',
              },
              pagination: {
                el: ".swiper-pagination",
                clickable: true
              },
              breakpoints: {
                0: {
                  slidesPerView: 1,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 12
                },
                320: {
                  slidesPerView: 1,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 12
                },
                360: {
                  slidesPerView: slide_view_sm,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 12
                },
                540: {
                  slidesPerView: slide_view_sm,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 12
                },
                640: {
                  slidesPerView: slide_view_lg,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 12
                },
                768: {
                  slidesPerView: slide_view_lg,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 30
                },
                1024: {
                  slidesPerView: slide_view_lg,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 30
                },
                1199: {
                  slidesPerView: slide_view,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 30
                },
                1499: {
                  slidesPerView: slide_view,
                  grid: {
                    rows: 1,
                    fill: 'row' | 'column',
                  },
                  spaceBetween: 30
                }
              }
            });
          }
          setTimeout(function () {
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
          });
          if (!this.querySelector('slideshow-component') && this.classList.contains('complementary-products')) {
            this.remove();
          }
        })
        .catch((e) => {
          console.error(e);
        });
    };
    new IntersectionObserver(sthandleIntersection.bind(this), { rootMargin: '0px 0px 400px 0px' }).observe(this);
  }
}
customElements.define('relative-pro', StRecomPro);
class ajaxSearchForm extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('input[type="search"]');
    this.resetButton = this.querySelector('button[type="reset"]');
    if (this.input) {
      this.input.form.addEventListener('reset', this.onFormReset.bind(this));
      this.input.addEventListener(
        'input',
        stdebounce((event) => {
          this.triggerChange(event);
        }, 300).bind(this)
      );
    }
  }
  ajaxResetBtn() {
    const resetIsHidden = this.resetButton.classList.contains('hidden');
    if (this.input.value.length > 0 && resetIsHidden) {
      this.resetButton.classList.remove('hidden');
    } else if (this.input.value.length === 0 && !resetIsHidden) {
      this.resetButton.classList.add('hidden');
    }
  }
  triggerChange() {
    this.ajaxResetBtn();
  }
  shouldResetForm() {
    return !document.querySelector('[aria-selected="true"] a');
  }
  onFormReset(event) {
    // Prevent default so the form reset doesn't set the value gotten from the url on page load
    event.preventDefault();
    // Don't reset if the user has selected an element on the ajax search dropdown
    if (this.shouldResetForm()) {
      this.input.value = '';
      this.input.focus();
      this.ajaxResetBtn();
    }
  }
}
customElements.define('search-form', ajaxSearchForm);

if (!customElements.get('popup-view')) {
  customElements.define('popup-view', class QuickAddModal extends stModalcontent {
    constructor() {
      super();
      this.modalContent = this.querySelector('[id^="QuickAddInfo-"]');
    }
    hide(preventFocus = false) {
      const cartNotification = document.querySelector('cart-notification') || document.querySelector('ajax-cart');
      if (cartNotification) cartNotification.setActiveElement(this.openedBy);
      this.modalContent.innerHTML = '';
      if (preventFocus) this.openedBy = null;
      super.hide();
    }
    show(opener) {
      opener.setAttribute('aria-disabled', true);
      opener.classList.add('loading');
      opener.querySelector('.ajax-loader').classList.remove('hidden');
      fetch(opener.getAttribute('data-product-url'))
        .then((response) => response.text())
        .then((responseText) => {
          const responseHTML = new DOMParser().parseFromString(responseText, 'text/html');
          this.productElement = responseHTML.querySelector('section[id^="MainProduct-"]');
          this.preventDuplicatedIDs();
          this.removeDOMElements();
          this.setInnerHTML(this.modalContent, this.productElement.innerHTML);
          if (window.Shopify && Shopify.PaymentButton) {
            Shopify.PaymentButton.init();
          }
          if (window.ProductModel) window.ProductModel.loadShopifyXR();
          this.preSwatchURLswapping();
          super.show(opener);
        })
        .finally(() => {
          opener.removeAttribute('aria-disabled');
          opener.classList.remove('loading');
          opener.querySelector('.ajax-loader').classList.add('hidden');
        });
    }
    setInnerHTML(element, html) {
      element.innerHTML = html;
      // Reinjects the script tags to allow execution. By default, scripts are disabled when using element.innerHTML.
      element.querySelectorAll('script').forEach(oldScriptTag => {
        const newScriptTag = document.createElement('script');
        Array.from(oldScriptTag.attributes).forEach(attribute => {
          newScriptTag.setAttribute(attribute.name, attribute.value)
        });
        newScriptTag.appendChild(document.createTextNode(oldScriptTag.innerHTML));
        oldScriptTag.parentNode.replaceChild(newScriptTag, oldScriptTag);
      });
    }
    preSwatchURLswapping() {
      const variantPicker = this.modalContent.querySelector('pr-option,selects-box');
      if (!variantPicker) return;
      variantPicker.setAttribute('data-update-url', 'false');
    }
    removeDOMElements() {
      const productModal = this.productElement.querySelector('product-modal');
      if (productModal) productModal.remove();
      const modalDialog = this.productElement.querySelectorAll('modal-dialog');
      if (modalDialog) modalDialog.forEach(modal => modal.remove());
    }
    preventDuplicatedIDs() {
      const stScId = this.productElement.dataset.section;
      this.productElement.innerHTML = this.productElement.innerHTML.replaceAll(stScId, `quickadd-${ stScId }`);
      this.productElement.querySelectorAll('selects-box, pr-option, product-info').forEach((element) => {
        element.dataset.originalSection = stScId;
      });
    }
  });
}
if (!customElements.get('cart-action')) {
  customElements.define('cart-action', class stProductForm extends HTMLElement {
    constructor() {
      super();
      this.form = this.querySelector('form');
      this.form.querySelector('[name=id]').disabled = false;
      this.form.addEventListener('submit', this.triggerSendHand.bind(this));
      this.cart = document.querySelector('cart-notification') || document.querySelector('ajax-cart');
      this.submitButton = this.querySelector('[type="submit"]');
      if (document.querySelector('ajax-cart')) this.submitButton.setAttribute('aria-haspopup', 'dialog');
    }
    triggerSendHand(evt) {
      evt.preventDefault();
      if (this.submitButton.getAttribute('aria-disabled') === 'true') return;
      this.stHandErrorTxt();
      this.submitButton.setAttribute('aria-disabled', true);
      this.submitButton.classList.add('loading');
      this.querySelector('.ajax-loader').classList.remove('hidden');
      const config = stFetchConfig('javascript');
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
      delete config.headers['Content-Type'];
      const formData = new FormData(this.form);
      if (this.cart) {
        formData.append('sections', this.cart.fetchSecToInclude().map((section) => section.id));
        formData.append('sections_url', window.location.pathname);
        this.cart.setActiveElement(document.activeElement);
      }
      config.body = formData;
      fetch(`${routes.increase_cart_url}`, config)
        .then((response) => response.json())
        .then((response) => {
          if (response.status) {
            this.stHandErrorTxt(response.description);
            const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
            if (!soldOutMessage) return;
            this.submitButton.setAttribute('aria-disabled', true);
            this.submitButton.querySelector('span').classList.add('hidden');
            soldOutMessage.classList.remove('hidden');
            this.error = true;
            return;
          } else if (!this.cart) {
            window.location = window.routes.cart_url;
            return;
          }
          if (!this.error) live(SP_OBJECT.ajxcartRefresh, {source: 'cart-action'});
          this.error = false;
          const quickAddModal = this.closest('popup-view');
          if (quickAddModal) {
            document.body.addEventListener('modalClosed', () => {
              setTimeout(() => { this.cart.renderContents(response) });
            }, { once: true });
            quickAddModal.hide(true);
          } else {
            this.cart.renderContents(response);
          }
        })
        .catch((e) => {
          console.error(e);
        })
        .finally(() => {
          this.submitButton.classList.remove('loading');
          if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
          if (!this.error) this.submitButton.removeAttribute('aria-disabled');
          this.querySelector('.ajax-loader').classList.add('hidden');
        });
    }
    stHandErrorTxt(errorMessage = false) {
      this.errorMessageWrapper = this.errorMessageWrapper || this.querySelector('.pr-form-error');
      if (!this.errorMessageWrapper) return;
      this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.pr-form-error-text');
      this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);
      if (errorMessage) {
        this.errorMessage.textContent = errorMessage;
      }
    }
  });
}