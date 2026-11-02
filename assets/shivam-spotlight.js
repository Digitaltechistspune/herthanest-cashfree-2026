/* HERTHA NEST — ARTISAN SPOTLIGHT V2
   Lightweight scene-aware carousel. No product API requests or third-party libraries.
   The Shopify Liquid section provides product data and images.
*/
(() => {
  'use strict';

  if (window.ShivamHerthaSpotlight) {
    window.ShivamHerthaSpotlight.boot(document);
    return;
  }

  const qs = (root, selector) => root.querySelector(selector);
  const qsa = (root, selector) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function init(root) {
    if (!root || root.__shsController) return;

    const stage = qs(root, '[data-shs-stage]');
    const track = qs(root, '[data-shs-products]');
    const slides = qsa(root, '[data-shs-slide]');
    if (!stage || !track || !slides.length) return;

    const prev = qs(root, '[data-shs-prev]');
    const next = qs(root, '[data-shs-next]');
    const title = qs(root, '[data-shs-title]');
    const note = qs(root, '[data-shs-note]');
    const price = qs(root, '[data-shs-price]');
    const countLabel = qs(root, '[data-shs-counter]');
    const cta = qs(root, '[data-shs-cta]');
    const miniLabels = qsa(root, '[data-shs-label]');
    const count = slides.length;

    const abort = new AbortController();
    const {signal} = abort;
    let intersectionObserver = null;
    let resizeObserver = null;
    let autoplayTimer = 0;
    let motionTimer = 0;
    let labelTimer = 0;
    let resizeTimer = 0;
    let frame1 = 0;
    let frame2 = 0;
    let renderSerial = 0;
    let previousOffsets = [];
    let drag = null;
    let ignoreClickUntil = 0;
    const ghosts = new Set();

    const duration = clamp(
      parseInt(root.style.getPropertyValue('--shs-duration'), 10) || 750,
      450, 1050
    );

    const state = {
      active: 0,
      busy: false,
      queued: 0,
      hovering: false,
      focused: false,
      visible: !('IntersectionObserver' in window),
      pausedInEditor: root.dataset.editor === 'true',
      autoplay: root.dataset.autoplay === 'true',
      interval: clamp(Number(root.dataset.interval) || 5000, 3000, 9000)
    };

    function offsetOf(index) {
      // Signed position around the ring, relative to the current hero.
      const forward = (index - state.active + count) % count;
      return forward > Math.floor(count / 2) ? forward - count : forward;
    }

    function measurements() {
      const width = stage.clientWidth || 1000;
      const height = stage.clientHeight || 560;
      const mobile = window.matchMedia('(max-width: 749px)').matches;
      const nearOpacity = clamp(
        parseFloat(root.style.getPropertyValue('--shs-near-opacity')) || .9,
        .5, 1
      );
      const farOpacity = clamp(
        parseFloat(root.style.getPropertyValue('--shs-far-opacity')) || .68,
        .3, .9
      );
      return {width, height, mobile, nearOpacity, farOpacity};
    }

    function poseFor(delta, m) {
      const side = Math.sign(delta) || 1;
      const distance = Math.abs(delta);

      if (distance === 0) {
        return {x: 0, y: 0, scale: 1, opacity: 1, brightness: 1, saturation: 1, z: 60, visible: true};
      }

      // Desktop: +/- 21.4% aligns with arches 2 and 4.
      // Mobile: partial neighbouring previews; product stays behind centre podium.
      if (distance === 1) {
        return {
          x: side * m.width * (m.mobile ? .384 : .214),
          y: m.height * (m.mobile ? .015 : -.005),
          scale: m.mobile ? .68 : .70,
          opacity: m.mobile ? Math.min(m.nearOpacity, .63) : m.nearOpacity,
          brightness: m.mobile ? .86 : .91,
          saturation: .91,
          z: 30,
          visible: true
        };
      }

      // Desktop: +/- 37% aligns with arches 1 and 5.
      if (distance === 2 && !m.mobile) {
        return {
          x: side * m.width * .37,
          y: m.height * .010,
          scale: .53,
          opacity: m.farOpacity,
          brightness: .84,
          saturation: .87,
          z: 14,
          visible: true
        };
      }

      return hiddenPose(side, m);
    }

    function hiddenPose(side, m) {
      return {
        x: side * m.width * (m.mobile ? .63 : .52),
        y: m.height * .05,
        scale: .39,
        opacity: 0,
        brightness: .77,
        saturation: .8,
        z: 1,
        visible: false
      };
    }

    function applyPose(slide, pose, isCurrent) {
      slide.style.setProperty('--shs-x', `${pose.x.toFixed(2)}px`);
      slide.style.setProperty('--shs-y', `${pose.y.toFixed(2)}px`);
      slide.style.setProperty('--shs-scale', String(pose.scale));
      slide.style.setProperty('--shs-opacity', String(pose.opacity));
      slide.style.setProperty('--shs-brightness', String(pose.brightness));
      slide.style.setProperty('--shs-saturation', String(pose.saturation));
      slide.style.setProperty('--shs-z', String(pose.z));
      slide.dataset.shsCurrent = String(isCurrent);
      slide.dataset.shsInteractive = String(pose.visible);
      slide.setAttribute('aria-hidden', String(!pose.visible));
      const link = qs(slide, '.shs__product-link');
      if (link) link.tabIndex = pose.visible ? 0 : -1;
    }

    function updateDetails() {
      const slide = slides[state.active];
      if (!slide) return;

      if (title) title.textContent = slide.dataset.title || '';
      if (note) {
        const subtitle = slide.dataset.note || '';
        note.textContent = subtitle;
        note.hidden = !subtitle;
      }
      if (price) price.textContent = slide.dataset.price || '';
      if (cta) cta.href = slide.dataset.url || '#';
      if (countLabel) {
        const current = String(state.active + 1).padStart(2, '0');
        const total = String(count).padStart(2, '0');
        countLabel.textContent = `${current} / ${total}`;
      }
    }

    function updateMiniLabels(animated = false) {
      if (!miniLabels.length) return;
      window.clearTimeout(labelTimer);

      if (animated) {
        miniLabels.forEach(label => label.classList.add('is-updating'));
      }

      const commit = () => {
        const m = measurements();
        miniLabels.forEach(label => {
          const slot = Number(label.dataset.slot);
          const index = (state.active + slot + count * 10) % count;
          const delta = offsetOf(index);
          const duplicate = slot !== delta;
          const allowed = !duplicate && (m.mobile ? slot === 0 : Math.abs(slot) <= 2);
          const slide = slides[index];
          label.hidden = !allowed || !slide;
          if (!allowed || !slide) return;

          const name = qs(label, '[data-shs-mini-title]');
          const miniPrice = qs(label, '[data-shs-mini-price]');
          if (name) name.textContent = slide.dataset.title || '';
          if (miniPrice) miniPrice.textContent = slide.dataset.price || '';
          label.href = slide.dataset.url || '#';
          label.setAttribute('aria-label', `View ${slide.dataset.title || 'product'}`);
          label.classList.remove('is-updating');
        });
      };

      if (animated && !reducedMotion.matches) {
        labelTimer = window.setTimeout(commit, Math.min(340, duration * .44));
      } else {
        commit();
      }
    }

    function cancelFrames() {
      if (frame1) cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
      frame1 = 0;
      frame2 = 0;
    }

    function clearGhosts() {
      ghosts.forEach(ghost => ghost.remove());
      ghosts.clear();
    }

    function addWrapGhost(slide, oldDelta, m) {
      if (!oldDelta || Math.abs(oldDelta) > 2) return;
      const ghost = slide.cloneNode(true);
      ghost.classList.add('shs__ghost');
      ghost.removeAttribute('data-shs-slide');
      ghost.removeAttribute('data-block-id');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.dataset.shsInteractive = 'false';
      const link = qs(ghost, 'a');
      if (link) {
        link.removeAttribute('href');
        link.removeAttribute('aria-label');
        link.tabIndex = -1;
      }
      ghost.style.transition = 'none';
      track.appendChild(ghost);
      ghosts.add(ghost);

      // Move the outgoing image into the stage wings while it fades.
      requestAnimationFrame(() => {
        if (!ghost.isConnected) return;
        void ghost.offsetWidth;
        ghost.style.transition = '';
        ghost.style.setProperty('--shs-x', `${(Math.sign(oldDelta) * m.width * (m.mobile ? .60 : .51)).toFixed(2)}px`);
        ghost.style.setProperty('--shs-y', `${(m.height * .05).toFixed(2)}px`);
        ghost.style.setProperty('--shs-scale', '.39');
        ghost.style.setProperty('--shs-opacity', '0');
      });
      window.setTimeout(() => {
        ghost.remove();
        ghosts.delete(ghost);
      }, duration + 100);
    }

    function render(animate = true) {
      const serial = ++renderSerial;
      cancelFrames();
      const m = measurements();
      const instant = !animate || reducedMotion.matches;
      const teleports = [];
      const currentOffsets = [];

      slides.forEach((slide, index) => {
        const delta = offsetOf(index);
        const pose = poseFor(delta, m);
        const oldDelta = previousOffsets[index];
        currentOffsets[index] = delta;
        const wrap = !instant && oldDelta !== undefined && Math.abs(delta - oldDelta) > 2;

        if (instant || wrap) slide.style.transition = 'none';
        else slide.style.transition = '';

        if (wrap) {
          addWrapGhost(slide, oldDelta, m);
          applyPose(slide, hiddenPose(Math.sign(delta) || 1, m), false);
          teleports.push({slide, pose, current: index === state.active});
        } else {
          applyPose(slide, pose, index === state.active);
        }
      });

      previousOffsets = currentOffsets;
      updateDetails();
      updateMiniLabels(!instant);
      root.classList.add('shs--ready');

      frame1 = requestAnimationFrame(() => {
        if (serial !== renderSerial || !root.isConnected) return;
        if (teleports.length) void stage.offsetWidth;
        frame2 = requestAnimationFrame(() => {
          if (serial !== renderSerial || !root.isConnected) return;
          slides.forEach(slide => { slide.style.transition = ''; });
          teleports.forEach(({slide, pose, current}) => applyPose(slide, pose, current));
        });
      });
    }

    function stopAutoplay() {
      if (autoplayTimer) window.clearInterval(autoplayTimer);
      autoplayTimer = 0;
    }

    function startAutoplay() {
      stopAutoplay();
      if (
        count < 2 || !state.autoplay || state.pausedInEditor || state.hovering ||
        state.focused || !state.visible || document.hidden || reducedMotion.matches
      ) return;
      autoplayTimer = window.setInterval(() => move(1), state.interval);
    }

    function move(direction) {
      if (count < 2) return;
      const step = direction < 0 ? -1 : 1;
      if (state.busy) {
        state.queued = step;
        return;
      }
      state.active = (state.active + step + count) % count;
      if (reducedMotion.matches) {
        render(false);
        return;
      }
      state.busy = true;
      render(true);
      window.clearTimeout(motionTimer);
      motionTimer = window.setTimeout(() => {
        state.busy = false;
        if (state.queued) {
          const queued = state.queued;
          state.queued = 0;
          move(queued);
        }
      }, duration + 40);
    }

    function manualMove(direction) {
      stopAutoplay();
      move(direction);
      startAutoplay();
    }

    function selectIndex(index) {
      if (index < 0 || index >= count) return;
      state.queued = 0;
      state.busy = false;
      window.clearTimeout(motionTimer);
      clearGhosts();
      state.active = index;
      render(false);
      stopAutoplay();
    }

    if (prev) prev.addEventListener('click', () => manualMove(-1), {signal});
    if (next) next.addEventListener('click', () => manualMove(1), {signal});

    stage.addEventListener('keydown', event => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      manualMove(event.key === 'ArrowRight' ? 1 : -1);
    }, {signal});

    // Links should never trigger native browser image dragging.
    stage.addEventListener('dragstart', event => event.preventDefault(), {signal});
    stage.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.shs__arrow')) return;
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    }, {signal, passive: true});

    window.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag = null;
      if (Math.abs(dx) > 43 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        ignoreClickUntil = performance.now() + 600;
        manualMove(dx < 0 ? 1 : -1);
      }
    }, {signal, passive: true});
    window.addEventListener('pointercancel', () => { drag = null; }, {signal});

    root.addEventListener('click', event => {
      if (
        performance.now() < ignoreClickUntil &&
        event.target.closest('.shs__product-link, .shs__mini-label')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, {signal, capture: true});

    root.addEventListener('mouseenter', () => { state.hovering = true; stopAutoplay(); }, {signal});
    root.addEventListener('mouseleave', () => { state.hovering = false; startAutoplay(); }, {signal});
    root.addEventListener('focusin', () => { state.focused = true; stopAutoplay(); }, {signal});
    root.addEventListener('focusout', event => {
      if (!event.relatedTarget || !root.contains(event.relatedTarget)) {
        state.focused = false;
        startAutoplay();
      }
    }, {signal});
    document.addEventListener('visibilitychange', startAutoplay, {signal});

    function onResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        state.queued = 0;
        state.busy = false;
        window.clearTimeout(motionTimer);
        clearGhosts();
        render(false);
      }, 120);
    }
    window.addEventListener('resize', onResize, {signal, passive: true});
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(stage);
    }
    if (typeof reducedMotion.addEventListener === 'function') {
      reducedMotion.addEventListener('change', () => {
        render(false);
        startAutoplay();
      }, {signal});
    }
    if ('IntersectionObserver' in window) {
      intersectionObserver = new IntersectionObserver(entries => {
        state.visible = entries.some(entry => entry.isIntersecting);
        startAutoplay();
      }, {threshold: .10});
      intersectionObserver.observe(root);
    }

    function destroy() {
      stopAutoplay();
      window.clearTimeout(motionTimer);
      window.clearTimeout(labelTimer);
      window.clearTimeout(resizeTimer);
      cancelFrames();
      clearGhosts();
      if (resizeObserver) resizeObserver.disconnect();
      if (intersectionObserver) intersectionObserver.disconnect();
      abort.abort();
      delete root.__shsController;
    }

    root.__shsController = {
      destroy,
      selectBlock(blockId) {
        const index = slides.findIndex(slide => slide.dataset.blockId === blockId);
        if (index >= 0) {
          state.pausedInEditor = true;
          selectIndex(index);
        }
      },
      pause() { state.pausedInEditor = true; stopAutoplay(); },
      resume() { state.pausedInEditor = false; startAutoplay(); }
    };

    render(false);
    startAutoplay();
  }

  function boot(scope) {
    if (!scope) return;
    if (scope.matches && scope.matches('[data-shs-section]')) init(scope);
    qsa(scope, '[data-shs-section]').forEach(init);
  }

  window.ShivamHerthaSpotlight = {boot};
  boot(document);

  document.addEventListener('shopify:section:load', event => boot(event.target));
  document.addEventListener('shopify:section:unload', event => {
    const root = event.target.matches && event.target.matches('[data-shs-section]')
      ? event.target : qs(event.target, '[data-shs-section]');
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
      ? event.target : qs(event.target, '[data-shs-section]');
    if (root && root.__shsController) root.__shsController.pause();
  });
  document.addEventListener('shopify:section:deselect', event => {
    const root = event.target.matches && event.target.matches('[data-shs-section]')
      ? event.target : qs(event.target, '[data-shs-section]');
    if (root && root.__shsController) root.__shsController.resume();
  });
})();
