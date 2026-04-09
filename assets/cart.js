class DelproBtn extends HTMLElement {
  constructor() {
    super();
    this.addEventListener('click', (event) => {
      event.preventDefault();
      const cartProduct = this.closest('ajax-items') || this.closest('cart-pro');
      cartProduct.refreshQty(this.dataset.index, 0);
    });
  }
}
customElements.define('delpro-btn', DelproBtn);
class CartProduct extends HTMLElement {
  constructor() {
    super();
    this.lineItemStatusElement = document.getElementById('ajaxcart-lineitemstatus') || document.getElementById('ajaxcart-LineItemStatus');
    const sendOnBounce = stdebounce((event) => {
      this.triggerChange(event);
    }, RELOAD_TIMER);
    this.addEventListener('change', sendOnBounce.bind(this));
    Array.from(document.querySelectorAll('.checkout-btn .read-agree')).forEach(e => e.addEventListener('click',  function () {
      if($('.cust-checkbox').is(':checked')) {
        $('.checkout-btn button.check-btn').removeAttr('disabled');
      }
      else {
        $('.checkout-btn button.check-btn').attr('disabled', 'disabled');
      }
    }))
  }
  ajxcartRefreshUnusers = undefined;
  connectedCallback() {
    this.ajxcartRefreshUnusers = user(SP_OBJECT.ajxcartRefresh, (event) => {
      if (event.source === 'ajax-items') {
        return;
      }
      this.onCartUpdate();
    });
  }
  disconnectedCallback() {
    if (this.ajxcartRefreshUnusers) {
      this.ajxcartRefreshUnusers();
    }
  }
  triggerChange(event) {
    this.refreshQty(event.target.dataset.index, event.target.value, document.activeElement.getAttribute('name'));
  }
  onCartUpdate() {
    fetch(`${routes.cart_url}?section_id=cart-section`)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const sourceQty = html.querySelector('ajax-items');
        this.innerHTML = sourceQty.innerHTML;
        
      })
      .catch(e => {
        console.error(e);
      });
  }
  fetchSecToInclude() {
    return [
      {
        id: 'cart-section',
        section: document.getElementById('cart-section').dataset.id,
        selector: '.js-contents'
      },
      {
        id: 'ajax-cart-icon',
        section: 'ajax-cart-icon',
        selector: '.shopify-section'
      },
      {
        id: 'stcart-region-text',
        section: 'stcart-region-text',
        selector: '.shopify-section'
      },
      {
        id: 'cart-section-total',
        section: document.getElementById('cart-section-total').dataset.id,
        selector: '.js-contents-subtotal'
      }
    ];
  }
  refreshQty(line, quantity, name) {
    this.loadingShow(line);
    const body = JSON.stringify({
      line,
      quantity,
      sections: this.fetchSecToInclude().map((section) => section.section),
      sections_url: window.location.pathname
    });
    fetch(`${routes.edite_cart_url}`, { ...stFetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        const quantityElement = document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
        const items = document.querySelectorAll('.cart-item');

        if (parsedState.errors) {
          quantityElement.value = quantityElement.getAttribute('value');
          this.reLiveRegions(line, parsedState.errors);
          return;
        }
        this.classList.toggle('is-empty', parsedState.item_count === 0);
        const cartDrawerWrapper = document.querySelector('ajax-cart');
        const cartFooter = document.getElementById('cart-section-total');
        if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
        if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);
        this.fetchSecToInclude().forEach((section => {
          const elementToReplace =
            document.getElementById(section.id).querySelector(section.selector) || document.getElementById(section.id);
          elementToReplace.innerHTML =
            this.callSectionInnerHTML(parsedState.sections[section.section], section.selector);
        }));
        const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
        let message = '';
        if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
          if (typeof updatedValue === 'undefined') {
            message = window.stCartString.error;
          } else {
            message = window.stCartString.qtyError.replace('[quantity]', updatedValue);
          }
        }
        this.reLiveRegions(line, message);
        const lineItem = document.getElementById(`cartpro-${line}`) || document.getElementById(`ajaxcart-item-${line}`);
        if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
          cartDrawerWrapper ? triggerClick(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`)) : lineItem.querySelector(`[name="${name}"]`).focus();
        } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
          triggerClick(cartDrawerWrapper.querySelector('.cart-body-empty'), cartDrawerWrapper.querySelector('a'))
        } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
          triggerClick(cartDrawerWrapper, document.querySelector('.cart-item__name'))
        }
        live(SP_OBJECT.ajxcartRefresh, {source: 'ajax-items'});
      }).catch(() => {
        this.querySelectorAll('.loading-overlay').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('ajaxcart-carterrors');
        errors.textContent = window.stCartString.error;
      })
      .finally(() => {
        this.loadingOff(line);
      });
  }
  reLiveRegions(line, message) {
    const lineItemError = document.getElementById(`cart-pro-err-${line}`) || document.getElementById(`ajaxcart-lineitemerror-${line}`);
    if (lineItemError) lineItemError.querySelector('.cart-pro-err-text').innerHTML = message;
    this.lineItemStatusElement.setAttribute('aria-hidden', true);
    const cartStatus = document.getElementById('stcart-region-text') || document.getElementById('ajaxcart-liveregiontext');
    cartStatus.setAttribute('aria-hidden', false);
    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }
  callSectionInnerHTML(html, selector) {
    return new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector(selector).innerHTML;
  }
  loadingShow(line) {
    const stCartPros = document.getElementById('cart-section') || document.getElementById('ajaxcart-cartitems');
    stCartPros.classList.add('disabled');
    const cartItemElements = this.querySelectorAll(`#cartpro-${line} .loading-overlay`);
    const ajaxCartProTag = this.querySelectorAll(`#ajaxcart-item-${line} .loading-overlay`);
    [...cartItemElements, ...ajaxCartProTag].forEach((overlay) => overlay.classList.remove('hidden'));
    document.activeElement.blur();
    this.lineItemStatusElement.setAttribute('aria-hidden', false);
  }
  loadingOff(line) {
    const stCartPros = document.getElementById('cart-section') || document.getElementById('ajaxcart-cartitems');
    stCartPros.classList.remove('disabled');
    const cartItemElements = this.querySelectorAll(`#cartpro-${line} .loading-overlay`);
    const ajaxCartProTag = this.querySelectorAll(`#ajaxcart-item-${line} .loading-overlay`);
    cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
    ajaxCartProTag.forEach((overlay) => overlay.classList.add('hidden'));
  }
}
customElements.define('ajax-items', CartProduct);
if (!customElements.get('st-note')) {
  customElements.define('st-note', class CartNote extends HTMLElement {
      constructor() {
        super();
      this.addEventListener('change', stdebounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.change_cart_url}`, { ...stFetchConfig(), ...{ body } });
      }, RELOAD_TIMER))
      }
  });
};