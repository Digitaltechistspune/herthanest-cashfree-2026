class AjaxSearch extends ajaxSearchForm {
  constructor() {
    super();
    this.cachedResults = {};
    this.ajaxSearchResults = this.querySelector('[data-search-ajax]');
    this.allajaxSearchInstances = document.querySelectorAll('search-ajax');
    this.isOpen = false;
    this.abortController = new AbortController();
    this.searchCond = '';
    this.ajaxEventListeners();
  }
  ajaxEventListeners() {
    this.input.form.addEventListener('submit', this.ajaxFormSubmit.bind(this));
    this.input.addEventListener('focus', this.inputFocus.bind(this));
    this.addEventListener('focusout', this.inputFocusOut.bind(this));
    this.addEventListener('keyup', this.inputKeyup.bind(this));
    this.addEventListener('keydown', this.inputKeydown.bind(this));
  }
  ajaxgetInquiry () {
    return this.input.value.trim();
  }
  triggerChange() {
    super.triggerChange();
    const searchCondNew = this.ajaxgetInquiry ();
    if (!this.searchCond || !searchCondNew.startsWith(this.searchCond)) {
      // Remove the results when they are no longer relevant for the new search term
      // so they don't show up when the dropdown opens again
      this.querySelector('#search-ajax-block')?.remove();
    }
    // Update the term asap, don't wait for the predictive search query to finish loading
    this.updateForCond(this.searchCond, searchCondNew);
    this.searchCond = searchCondNew;
    if (!this.searchCond.length) {
      this.close(true);
      return;
    }
    this.getAjaxResults(this.searchCond);
  }
  ajaxFormSubmit(event) {
    if (!this.ajaxgetInquiry ().length || this.querySelector('[aria-selected="true"] a')) event.preventDefault();
  }
  ajaxFormReset(event) {
    super.ajaxFormReset(event);
    if (super.shouldResetForm()) {
      this.searchCond = '';
      this.abortController.abort();
      this.abortController = new AbortController();
      this.clearInput(true);
    }
  }
  inputFocus() {
    const currentSearchTerm = this.ajaxgetInquiry ();
    if (!currentSearchTerm.length) return;
    if (this.searchCond !== currentSearchTerm) {
      // Search term was changed from other search input, treat it as a user change
      this.triggerChange();
    } else if (this.getAttribute('results') === 'true') {
      this.ajaxOpen();
    } else {
      this.getAjaxResults(this.searchCond);
    }
  }
  inputFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }
  inputKeyup(event) {
    if (!this.ajaxgetInquiry ().length) this.close(true);
    event.preventDefault();

    switch (event.code) {
      case 'ArrowUp':
        this.checkOption('up');
        break;
      case 'ArrowDown':
        this.checkOption('down');
        break;
      case 'Enter':
        this.menuOption();
        break;
    }
  }
  inputKeydown(event) {
    // Prevent the cursor from moving in the input when using the up and down arrow keys
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault();
    }
  }
  updateForCond(previousTerm, newTerm) {
    const searchForTextElement = this.querySelector('[data-search-ajax-search-for-text]');
    const currentButtonText = searchForTextElement?.innerText;
    if (currentButtonText) {
      if (currentButtonText.match(new RegExp(previousTerm, 'g')).length > 1) {
        // The new term matches part of the button text and not just the search term, do not replace to avoid mistakes
        return;
      }
      const newButtonText = currentButtonText.replace(previousTerm, newTerm);
      searchForTextElement.innerText = newButtonText;
    }
  }
  checkOption(direction) {
    if (!this.getAttribute('open')) return;
    const moveUp = direction === 'up';
    const selectedElement = this.querySelector('[aria-selected="true"]');
    // Filter out hidden elements (duplicated page and article resources) thanks
    // to this https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/offsetParent
    const allVisibleElements = Array.from(this.querySelectorAll('li, button.search-ajax__item')).filter(
      (element) => element.offsetParent !== null
    );
    let activeElementIndex = 0;
    if (moveUp && !selectedElement) return;
    let selectedElementIndex = -1;
    let i = 0;
    while (selectedElementIndex === -1 && i <= allVisibleElements.length) {
      if (allVisibleElements[i] === selectedElement) {
        selectedElementIndex = i;
      }
      i++;
    }
    this.statusElement.textContent = '';
    if (!moveUp && selectedElement) {
      activeElementIndex = selectedElementIndex === allVisibleElements.length - 1 ? 0 : selectedElementIndex + 1;
    } else if (moveUp) {
      activeElementIndex = selectedElementIndex === 0 ? allVisibleElements.length - 1 : selectedElementIndex - 1;
    }
    if (activeElementIndex === selectedElementIndex) return;
    const activeElement = allVisibleElements[activeElementIndex];
    activeElement.setAttribute('aria-selected', true);
    if (selectedElement) selectedElement.setAttribute('aria-selected', false);
    this.input.setAttribute('aria-activedescendant', activeElement.id);
  }
  menuOption() {
    const selectedOption = this.querySelector('[aria-selected="true"] a, button[aria-selected="true"]');
    if (selectedOption) selectedOption.click();
  }
  getAjaxResults(searchCond) {
    const queryKey = searchCond.replace(' ', '-').toLowerCase();
    this.ajaxLoader();
    if (this.cachedResults[queryKey]) {
      this.ajaxSendresult(this.cachedResults[queryKey]);
      return;
    }
    fetch(`${routes.ajax_search_url}?q=${encodeURIComponent(searchCond)}&section_id=search-ajax`, {
      signal: this.abortController.signal,
    })
    .then((response) => {
      if (!response.ok) {
        var error = new Error(response.status);
        this.close();
        throw error;
      }
      return response.text();
    })
    .then((text) => {
      const resultsMarkup = new DOMParser()
        .parseFromString(text, 'text/html')
        .querySelector('#shopify-section-search-ajax').innerHTML;
      // Save bandwidth keeping the cache in all instances synced
      this.allajaxSearchInstances.forEach((predictiveSearchInstance) => {
        predictiveSearchInstance.cachedResults[queryKey] = resultsMarkup;
      });
      this.ajaxSendresult(resultsMarkup);
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
    })
    .catch((error) => {
      if (error?.code === 20) {
        // Code 20 means the call was aborted
        return;
      }
      this.close();
      throw error;
    });
  }
  ajaxLoader() {
    this.statusElement = this.statusElement || this.querySelector('.search-ajax-status');
    this.setAttribute('loading', true);
  }
  ajaxInputText(statusText) {
    this.statusElement.setAttribute('aria-hidden', 'false');
    this.statusElement.textContent = statusText;

    setTimeout(() => {
      this.statusElement.setAttribute('aria-hidden', 'true');
    }, 1000);
  }
  ajaxSendresult(resultsMarkup) {
    this.ajaxSearchResults.innerHTML = resultsMarkup;
    this.setAttribute('results', true);

    this.sendInputresult();
    this.ajaxOpen();
  }
  sendInputresult() {
    this.removeAttribute('loading');
    this.ajaxInputText(this.querySelector('[data-search-ajax-live-region-count-value]').textContent);
  }
  ajaxOpen() {
    this.setAttribute('open', true);
    this.input.setAttribute('aria-expanded', true);
    this.isOpen = true;
  }
  close(ajaxCondRemove = false) {
    this.clearInput(ajaxCondRemove);
    this.isOpen = false;
  }
  clearInput(ajaxCondRemove = false) {
    if (ajaxCondRemove) {
      this.input.value = '';
      this.removeAttribute('results');
    }
    const selected = this.querySelector('[aria-selected="true"]');
    if (selected) selected.setAttribute('aria-selected', false);
    this.input.setAttribute('aria-activedescendant', '');
    this.removeAttribute('loading');
    this.removeAttribute('open');
    this.input.setAttribute('aria-expanded', false);
  }
}
customElements.define('search-ajax', AjaxSearch);