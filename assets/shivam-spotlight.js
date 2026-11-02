/* HERTHA NEST — THE ARTISAN SPOTLIGHT
   Vanilla JS: stage positioning only; Shopify Liquid renders product data.
   No product feeds, libraries, or external requests. */
(() => {
  'use strict';

  if (window.ShivamHerthaSpotlight) {
    window.ShivamHerthaSpotlight.boot(document);
    return;
  }

  const $ = (scope, selector) => scope.querySelector(selector);
  const $$ = (scope, selector) => Array.from(scope.querySelectorAll(selector));
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const mediaReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function init(root) {
    if (!root || root.__shsController) return;

    const stage = $(root, '[data-shs-stage]');
    const slides = $$(root, '[data-shs-slide]');
    if (!stage || !slides.length) return;

    const prev = $(root, '[data-shs-prev]');
    const next = $(root, '[data-shs-next]');
    const title = $(root, '[data-shs-title]');
    const note = $(root, '[data-shs-note]');
    const price = $(root, '[data-shs-price]');
    const counter = $(root, '[data-shs-counter]');
    const cta = $(root, '[data-shs-cta]');
    const count = slides.length;

    const abort = new AbortController();
    const {signal} = abort;
    let observer = null;
    let resizeObserver = null;
    let autoplayTimer = 0;
    let transitionTimer = 0;
    let resizeTimer = 0;
    let frameOne = 0;
    let frameTwo = 0;
    let renderVersion = 0;
    let oldOffsets = [];
    let drag = null;
    let ignoreClickUntil = 0;

    const state = {
      active: 0,
      busy: false,
      pending: 0,
      hovering: false,
      keyboardFocus: false,
      visible: !('IntersectionObserver' in window),
      editorPaused: root.dataset.editor === 'true',
      autoplay: root.dataset.autoplay === 'true',
      interval: clamp(Number(root.dataset.interval) || 5000, 3000, 9000),
      duration: clamp(parseInt(root.style.getPropertyValue('--shs-duration'), 10) || 700, 400, 1200)
    };

    function offsets(index) {
      // Relative position of each product on a circular carousel.
      const forward = (index - state.active + count) % count;
      return forward > Math.floor(count / 2) ? forward - count : forward;
    }

    function getMeasurements() {
      const width = Math.max(300, stage.clientWidth || root.clientWidth || 300);
      const mobile = window.matchMedia('(max-width: 749px)').matches;
      const tablet = !mobile && width < 950;
      const opacityNear = clamp(
        parseFloat(root.style.getPropertyValue('--shs-near-opacity')) || 0.8, 0.4, 0.95
      );
      const opacityFar = clamp(
        parseFloat(root.style.getPropertyValue('--shs-far-opacity')) || 0.45, 0.2, 0.75
      );
      return {width, mobile, tablet, opacityNear, opacityFar, maxVisible: mobile || tablet ? 1 : 2};
    }

    function poseFor(delta, m) {
      const side = Math.sign(delta) || 1;
      const distance = Math.abs(delta);

      if (distance === 0) {
        return {x: 0, y: 0, scale: 1, opacity: 1, brightness: 1, saturation: 1, z: 60, visible: true};
      }
      if (distance === 1) {
        return {
          x: side * m.width * (m.mobile ? 0.38 : m.tablet ? 0.31 : 0.28),
          y: m.mobile ? -24 : -35,
          scale: m.mobile ? 0.75 : m.tablet ? 0.76 : 0.79,
          opacity: m.opacityNear,
          brightness: 0.90,
          saturation: 0.90,
          z: 35,
          visible: true
        };
      }
      if (distance === 2 && m.maxVisible >= 2) {
        return {
          x: side * m.width * 0.48,
          y: -66,
          scale: 0.56,
          opacity: m.opacityFar,
          brightness: 0.83,
          saturation: 0.83,
          z: 15,
          visible: true
        };
      }
      return hiddenPose(side, m);
    }

    function hiddenPose(side, m) {
      return {
        x: side * m.width * (m.mobile ? 0.68 : 0.64),
        y: -84,
        scale: 0.42,
        opacity: 0,
        brightness: 0.79,
        saturation: 0.79,
        z: 1,
        visible: false
      };
    }

    function applyPose(slide, pose, current, interactiveOverride) {
      slide.style.setProperty('--shs-x', `${pose.x.toFixed(1)}px`);
      slide.style.setProperty('--shs-y', `${pose.y.toFixed(1)}px`);
      slide.style.setProperty('--shs-scale', pose.scale);
      slide.style.setProperty('--shs-opacity', pose.opacity);
      slide.style.setProperty('--shs-brightness', pose.brightness);
      slide.style.setProperty('--shs-saturation', pose.saturation);
      slide.style.setProperty('--shs-z', pose.z);
      slide.dataset.shsCurrent = String(current);

      const interactive = interactiveOverride === undefined ? pose.visible : interactiveOverride;
      slide.dataset.shsInteractive = String(interactive);
      slide.setAttribute('aria-hidden', String(!interactive));
      const link = $(slide, 'a.shs__product-link');
      if (link) link.tabIndex = interactive ? 0 : -1;
    }

    function updateDetails() {
      const slide = slides[state.active];
      if (!slide) return;
      if (title) title.textContent = slide.dataset.title || '';
      if (note) {
        const text = slide.dataset.note || '';
        note.textContent = text;
        note.hidden = !text;
      }
      if (price) price.textContent = slide.dataset.price || '';
      if (cta) cta.href = slide.dataset.url || '#';
      if (counter) {
        const number = String(state.active + 1).padStart(2, '0');
        const total = String(count).padStart(2, '0');
        counter.textContent = `${number} / ${total}`;
      }
    }

    function clearFrames() {
      if (frameOne) cancelAnimationFrame(frameOne);
      if (frameTwo) cancelAnimationFrame(frameTwo);
      frameOne = 0;
      frameTwo = 0;
    }

    function render(animate = true) {
      renderVersion += 1;
      const version = renderVersion;
      clearFrames();
      const m = getMeasurements();
      const teleported = [];
      const newOffsets = [];
      const instant = !animate || mediaReducedMotion.matches;

      slides.forEach((slide, index) => {
        const delta = offsets(index);
        const target = poseFor(delta, m);
        const previous = oldOffsets[index];
        newOffsets[index] = delta;

        // A product going from one far edge to the other must enter
        // from outside the stage, not fly across the centre.
        const wraps = !instant && previous !== undefined && Math.abs(delta - previous) > 2;

        if (instant || wraps) slide.style.transition = 'none';
        else slide.style.transition = '';

        if (wraps) {
          applyPose(slide, hiddenPose(Math.sign(delta) || 1, m), false, false);
          teleported.push({slide, target, current: index === state.active});
        } else {
          applyPose(slide, target, index === state.active);
        }
      });

      oldOffsets = newOffsets;
      updateDetails();
      root.classList.add('shs--ready');

      frameOne = requestAnimationFrame(() => {
        if (version !== renderVersion || !root.isConnected) return;
        // Flush the initial positions before transitioning incoming edge items.
        if (teleported.length) void stage.offsetWidth;
        frameTwo = requestAnimationFrame(() => {
          if (version !== renderVersion || !root.isConnected) return;
          slides.forEach(slide => { slide.style.transition = ''; });
          teleported.forEach(({slide, target, current}) => applyPose(slide, target, current));
        });
      });
    }

    function stopAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer);
      autoplayTimer = 0;
    }

    function startAutoplay() {
      stopAutoplay();
      if (
        count < 2 || !state.autoplay || state.editorPaused ||
        state.hovering || state.keyboardFocus || !state.visible ||
        document.hidden || mediaReducedMotion.matches
      ) return;
      autoplayTimer = window.setInterval(() => move(1), state.interval);
    }

    function move(direction) {
      if (count < 2) return;
      const step = direction < 0 ? -1 : 1;
      if (state.busy) {
        state.pending = step;
        return;
      }

      state.active = (state.active + step + count) % count;
      if (mediaReducedMotion.matches) {
        render(false);
        return;
      }
      state.busy = true;
      render(true);

      clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        state.busy = false;
        if (state.pending) {
          const queued = state.pending;
          state.pending = 0;
          move(queued);
        }
      }, state.duration + 45);
    }

    function manualMove(direction) {
      stopAutoplay();
      move(direction);
      startAutoplay();
    }

    function selectIndex(index) {
      if (index < 0 || index >= count) return;
      state.pending = 0;
      state.busy = false;
      clearTimeout(transitionTimer);
      state.active = index;
      render(false);
      stopAutoplay();
    }

    if (prev) prev.addEventListener('click', () => manualMove(-1), {signal});
    if (next) next.addEventListener('click', () => manualMove(1), {signal});

    stage.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      if (event.target !== stage && event.target.closest('.shs__product-link')) {
        stage.focus({preventScroll: true});
      }
      manualMove(event.key === 'ArrowRight' ? 1 : -1);
    }, {signal});

    // Prevent native image/link dragging from swallowing the pointerup event.
    stage.addEventListener('dragstart', event => event.preventDefault(), {signal});

    // Touch and mouse dragging do not navigate to a product accidentally.
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('.shs__arrow')) return;
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    }, {signal, passive: true});

    window.addEventListener('pointerup', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag = null;
      if (Math.abs(dx) > 42 && Math.abs(dx) > Math.abs(dy) * 1.25) {
        ignoreClickUntil = performance.now() + 550;
        manualMove(dx < 0 ? 1 : -1);
      }
    }, {signal, passive: true});

    window.addEventListener('pointercancel', () => { drag = null; }, {signal});

    root.addEventListener('click', (event) => {
      if (
        performance.now() < ignoreClickUntil &&
        event.target.closest('.shs__product-link')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, {capture: true, signal});

    root.addEventListener('mouseenter', () => {
      state.hovering = true;
      stopAutoplay();
    }, {signal});
    root.addEventListener('mouseleave', () => {
      state.hovering = false;
      startAutoplay();
    }, {signal});
    root.addEventListener('focusin', () => {
      state.keyboardFocus = true;
      stopAutoplay();
    }, {signal});
    root.addEventListener('focusout', (event) => {
      if (!event.relatedTarget || !root.contains(event.relatedTarget)) {
        state.keyboardFocus = false;
        startAutoplay();
      }
    }, {signal});

    document.addEventListener('visibilitychange', startAutoplay, {signal});

    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        state.pending = 0;
        state.busy = false;
        clearTimeout(transitionTimer);
        render(false);
      }, 110);
    }
    window.addEventListener('resize', onResize, {signal, passive: true});
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(stage);
    }
    if (typeof mediaReducedMotion.addEventListener === 'function') {
      mediaReducedMotion.addEventListener('change', () => {
        render(false);
        startAutoplay();
      }, {signal});
    }

    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        state.visible = entries.some(entry => entry.isIntersecting);
        startAutoplay();
      }, {threshold: 0.1});
      observer.observe(root);
    }

    function destroy() {
      stopAutoplay();
      clearTimeout(transitionTimer);
      clearTimeout(resizeTimer);
      clearFrames();
      if (observer) observer.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      abort.abort();
      delete root.__shsController;
    }

    const api = {
      destroy,
      selectBlock(blockId) {
        const index = slides.findIndex(slide => slide.dataset.blockId === blockId);
        if (index >= 0) {
          state.editorPaused = true;
          selectIndex(index);
        }
      },
      pause() { state.editorPaused = true; stopAutoplay(); },
      resume() { state.editorPaused = false; startAutoplay(); }
    };
    root.__shsController = api;

    render(false);
    startAutoplay();
  }

  function boot(scope) {
    if (!scope) return;
    if (scope.matches && scope.matches('[data-shs-section]')) init(scope);
    $$(scope, '[data-shs-section]').forEach(init);
  }

  const api = {boot};
  window.ShivamHerthaSpotlight = api;
  boot(document);

  // Shopify editor replaces section markup dynamically without reloading the page.
  document.addEventListener('shopify:section:load', event => boot(event.target));
  document.addEventListener('shopify:section:unload', event => {
    const root = (event.target.matches && event.target.matches('[data-shs-section]'))
      ? event.target : $(event.target, '[data-shs-section]');
    if (root && root.__shsController) root.__shsController.destroy();
  });
  document.addEventListener('shopify:block:select', event => {
    const root = event.target.closest('[data-shs-section]');
    if (root && root.__shsController && event.detail) {
      root.__shsController.selectBlock(event.detail.blockId);
    }
  });
  document.addEventListener('shopify:section:select', event => {
    const root = event.target.matches && event.target.matches('[data-shs-section]')
      ? event.target : $(event.target, '[data-shs-section]');
    if (root && root.__shsController) root.__shsController.pause();
  });
  document.addEventListener('shopify:section:deselect', event => {
    const root = event.target.matches && event.target.matches('[data-shs-section]')
      ? event.target : $(event.target, '[data-shs-section]');
    if (root && root.__shsController) root.__shsController.resume();
  });
})();
