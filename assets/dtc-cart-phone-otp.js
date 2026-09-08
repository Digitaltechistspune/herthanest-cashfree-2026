(() => {
  'use strict';

  /* =========================================================
     CONFIG
  ========================================================= */

  const CONFIG = window.DTC_CART_OTP_CONFIG || {};

  if (!CONFIG.widgetId || !CONFIG.tokenAuth) {
    console.warn(
      '[DTC Cart OTP] MSG91 Widget ID or Widget Token is missing.'
    );
  }

  const STORAGE_KEY = 'dtc_cart_phone_verified_v1';
  const SKIP_KEY = 'dtc_cart_phone_skipped_v1';
  const CART_SYNC_KEY = 'dtc_cart_phone_synced_v1';

  const FORM_SELECTOR =
    'form[action*="/cart/add"]';

  /*
    Additional Add to Cart selectors.
    Includes common Shopify + Shella-style selectors.
  */
  const BUTTON_SELECTOR = [
    'button[name="add"]',
    '[data-add-to-cart]',
    '[data-js-product-button-add-to-cart]',
    '.js-product-button-add-to-cart',
    '.product-form__submit',
    '.btn--add-to-cart'
  ].join(',');


  /* =========================================================
     DOM
  ========================================================= */

  const modal = document.getElementById('dtc-cart-otp');

  if (!modal) {
    return;
  }

  const phoneStep =
    modal.querySelector('[data-dtc-step="phone"]');

  const verifyStep =
    modal.querySelector('[data-dtc-step="verify"]');

  const successStep =
    modal.querySelector('[data-dtc-step="success"]');

  const phoneInput =
    document.getElementById('dtc-otp-phone');

  const consentInput =
    document.getElementById('dtc-otp-consent');

  const otpInput =
    document.getElementById('dtc-otp-code');

  const sendOtpButton =
    document.getElementById('dtc-send-otp');

  const verifyOtpButton =
    document.getElementById('dtc-verify-otp');

  const resendButton =
    document.getElementById('dtc-resend-otp');

  const changePhoneButton =
    document.getElementById('dtc-change-phone');

  const skipButton =
    document.getElementById('dtc-skip-otp');

  const phonePreview =
    document.getElementById('dtc-otp-phone-preview');

  const phoneError =
    document.getElementById('dtc-phone-error');

  const verifyError =
    document.getElementById('dtc-verify-error');

  const closeButtons =
    modal.querySelectorAll('[data-dtc-close]');


  /* =========================================================
     STATE
  ========================================================= */

  const state = {
    pendingAction: null,

    bypassForm: null,

    bypassButton: null,

    currentIdentifier: null,

    sdkPromise: null,

    resendTimer: null
  };


  /* =========================================================
     HELPERS
  ========================================================= */

  function rootUrl() {
    if (
      window.Shopify &&
      window.Shopify.routes &&
      window.Shopify.routes.root
    ) {
      return window.Shopify.routes.root;
    }

    return '/';
  }


  function digitsOnly(value) {
    return String(value || '').replace(/\D/g, '');
  }


  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;

    if (loading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
      }

      button.disabled = true;
      button.textContent = loadingText || 'Please wait...';

    } else {

      button.disabled = false;

      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
    }
  }


  function setStep(stepName) {
    phoneStep.hidden = stepName !== 'phone';
    verifyStep.hidden = stepName !== 'verify';
    successStep.hidden = stepName !== 'success';
  }


  function clearErrors() {
    phoneError.textContent = '';
    verifyError.textContent = '';
  }


  /* =========================================================
     VERIFIED PHONE STORAGE
  ========================================================= */

  function getVerifiedPhoneRecord() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) return null;

      const record = JSON.parse(raw);

      if (
        !record ||
        !record.phone ||
        !record.expiresAt ||
        Date.now() > Number(record.expiresAt)
      ) {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(CART_SYNC_KEY);

        return null;
      }

      return record;

    } catch (error) {

      console.warn(
        '[DTC Cart OTP] Unable to read verification storage.',
        error
      );

      return null;
    }
  }


  function saveVerifiedPhone(phone) {
    const days =
      Number(CONFIG.verifiedDays) > 0
        ? Number(CONFIG.verifiedDays)
        : 30;

    const record = {
      phone: phone,

      consent: true,

      verifiedAt: Date.now(),

      expiresAt:
        Date.now() + (days * 24 * 60 * 60 * 1000)
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(record)
    );

    sessionStorage.removeItem(SKIP_KEY);

    return record;
  }


  /* =========================================================
     SHOPIFY CART IDENTITY
  ========================================================= */

  async function syncPhoneToShopifyCart(record) {

    if (!record || !record.phone) {
      return;
    }

    const attributes = {
      '__dtc_verified_phone':
        record.phone,

      '__dtc_whatsapp_consent':
        record.consent ? 'yes' : 'no',

      '__dtc_phone_verified_at':
        new Date(record.verifiedAt).toISOString(),

      '__dtc_phone_source':
        'add_to_cart_msg91_otp'
    };

    const response = await fetch(
      `${rootUrl()}cart/update.js`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },

        body: JSON.stringify({
          attributes: attributes
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Shopify cart update failed: ${response.status}`
      );
    }

    sessionStorage.setItem(
      CART_SYNC_KEY,
      '1'
    );
  }


  /* =========================================================
     MSG91 SDK
     Lazy-loaded only when customer actually needs OTP.
  ========================================================= */

  function ensureMsg91Ready() {

    if (
      typeof window.sendOtp === 'function' &&
      typeof window.verifyOtp === 'function'
    ) {
      return Promise.resolve();
    }

    if (state.sdkPromise) {
      return state.sdkPromise;
    }

    state.sdkPromise = new Promise(
      (resolve, reject) => {

        const existing =
          document.querySelector(
            'script[data-dtc-msg91-sdk]'
          );

        if (existing) {
          waitForMsg91(resolve, reject);
          return;
        }

        const script =
          document.createElement('script');

        script.src =
          'https://verify.msg91.com/otp-provider.js';

        script.async = true;

        script.dataset.dtcMsg91Sdk = 'true';

        script.onload = () => {

          try {

            if (
              typeof window.initSendOTP !== 'function'
            ) {
              throw new Error(
                'MSG91 initSendOTP was not found.'
              );
            }

            const configuration = {
              widgetId:
                CONFIG.widgetId,

              tokenAuth:
                CONFIG.tokenAuth,

              exposeMethods:
                true,

              captchaRenderId:
                'dtc-otp-captcha',

              success: function () {
                /*
                  We use verifyOtp callback directly.
                */
              },

              failure: function (error) {
                console.warn(
                  '[DTC Cart OTP] MSG91 widget error:',
                  error
                );
              }
            };

            window.initSendOTP(configuration);

            waitForMsg91(resolve, reject);

          } catch (error) {

            reject(error);
          }
        };

        script.onerror = () => {
          reject(
            new Error(
              'Unable to load MSG91 OTP service.'
            )
          );
        };

        document.head.appendChild(script);
      }
    );

    return state.sdkPromise;
  }


  function waitForMsg91(resolve, reject) {

    const startedAt = Date.now();

    const timer = window.setInterval(
      () => {

        if (
          typeof window.sendOtp === 'function' &&
          typeof window.verifyOtp === 'function'
        ) {
          clearInterval(timer);

          resolve();

          return;
        }

        if (
          Date.now() - startedAt > 8000
        ) {
          clearInterval(timer);

          reject(
            new Error(
              'MSG91 OTP service timed out.'
            )
          );
        }

      },
      100
    );
  }


  /* =========================================================
     MODAL
  ========================================================= */

  function openModal() {

    clearErrors();

    otpInput.value = '';

    setStep('phone');

    modal.classList.add('is-open');

    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'dtc-otp-open'
    );

    /*
      Load OTP library in background.
    */
    ensureMsg91Ready().catch(
      (error) => {
        console.warn(
          '[DTC Cart OTP]',
          error
        );
      }
    );

    setTimeout(
      () => {
        phoneInput.focus();
      },
      150
    );
  }


  function closeModal({
    clearPending = true
  } = {}) {

    modal.classList.remove('is-open');

    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'dtc-otp-open'
    );

    clearErrors();

    if (clearPending) {
      state.pendingAction = null;
    }
  }


  /* =========================================================
     RESUME ORIGINAL ADD TO CART
  ========================================================= */

  function resumePendingAction() {

    const pending =
      state.pendingAction;

    state.pendingAction = null;

    if (!pending) {
      return;
    }


    /*
      Standard Shopify cart form
    */
    if (pending.form) {

      state.bypassForm =
        pending.form;

      try {

        if (
          typeof pending.form.requestSubmit ===
          'function'
        ) {

          if (
            pending.submitter &&
            pending.form.contains(
              pending.submitter
            )
          ) {
            pending.form.requestSubmit(
              pending.submitter
            );

          } else {

            pending.form.requestSubmit();
          }

        } else {

          pending.form.submit();
        }

      } catch (error) {

        console.warn(
          '[DTC Cart OTP] Could not replay form normally.',
          error
        );

        if (
          typeof pending.form.requestSubmit ===
          'function'
        ) {
          pending.form.requestSubmit();
        }
      }

      return;
    }


    /*
      Theme-specific AJAX Add to Cart button
    */
    if (pending.button) {

      state.bypassButton =
        pending.button;

      pending.button.click();

      setTimeout(
        () => {
          state.bypassButton = null;
        },
        100
      );
    }
  }


  /* =========================================================
     OTP SEND
  ========================================================= */

  async function handleSendOtp() {

    clearErrors();

    const phone =
      digitsOnly(phoneInput.value);

    if (!/^[6-9]\d{9}$/.test(phone)) {

      phoneError.textContent =
        'Please enter a valid 10-digit Indian mobile number.';

      phoneInput.focus();

      return;
    }

    if (!consentInput.checked) {

      phoneError.textContent =
        'Please agree to receive cart reminders and updates on WhatsApp.';

      consentInput.focus();

      return;
    }

    setButtonLoading(
      sendOtpButton,
      true,
      'Sending OTP...'
    );

    try {

      await ensureMsg91Ready();

      state.currentIdentifier =
        `${CONFIG.countryCode || '91'}${phone}`;

      window.sendOtp(
        state.currentIdentifier,

        function () {

          phonePreview.textContent =
            `+${CONFIG.countryCode || '91'} ${phone}`;

          setStep('verify');

          otpInput.focus();

          startResendTimer();

          setButtonLoading(
            sendOtpButton,
            false
          );
        },

        function (error) {

          console.warn(
            '[DTC Cart OTP] Send OTP error:',
            error
          );

          phoneError.textContent =
            'We could not send the OTP. Please check the number and try again.';

          setButtonLoading(
            sendOtpButton,
            false
          );
        }
      );

    } catch (error) {

      console.error(
        '[DTC Cart OTP]',
        error
      );

      phoneError.textContent =
        'OTP service is temporarily unavailable. Please try again.';

      setButtonLoading(
        sendOtpButton,
        false
      );
    }
  }


  /* =========================================================
     VERIFY OTP
  ========================================================= */

  function handleVerifyOtp() {

    clearErrors();

    const otp =
      digitsOnly(otpInput.value);

    if (!/^\d{6}$/.test(otp)) {

      verifyError.textContent =
        'Please enter the complete 6-digit OTP.';

      otpInput.focus();

      return;
    }

    if (
      typeof window.verifyOtp !==
      'function'
    ) {
      verifyError.textContent =
        'OTP service is still loading. Please try again.';

      return;
    }

    setButtonLoading(
      verifyOtpButton,
      true,
      'Verifying...'
    );

    window.verifyOtp(
      otp,

      async function (data) {

        /*
          MSG91 callback confirms OTP was verified.
        */

        const verifiedPhone =
          `+${state.currentIdentifier}`;

        const record =
          saveVerifiedPhone(
            verifiedPhone
          );

        setStep('success');

        /*
          Attach verified identity to Shopify cart.
        */
        try {

          await syncPhoneToShopifyCart(
            record
          );

        } catch (error) {

          /*
            Do not block checkout/product purchase
            if cart metadata temporarily fails.
          */

          console.warn(
            '[DTC Cart OTP] Phone verified, but Shopify cart identity sync failed:',
            error
          );
        }

        setButtonLoading(
          verifyOtpButton,
          false
        );

        setTimeout(
          () => {

            closeModal({
              clearPending: false
            });

            resumePendingAction();

          },
          450
        );
      },

      function (error) {

        console.warn(
          '[DTC Cart OTP] Verify OTP error:',
          error
        );

        verifyError.textContent =
          'Incorrect or expired OTP. Please try again.';

        setButtonLoading(
          verifyOtpButton,
          false
        );
      }
    );
  }


  /* =========================================================
     RESEND OTP
  ========================================================= */

  function startResendTimer() {

    clearInterval(
      state.resendTimer
    );

    let seconds = 30;

    resendButton.disabled = true;

    resendButton.textContent =
      `Resend OTP in ${seconds}s`;

    state.resendTimer =
      setInterval(
        () => {

          seconds -= 1;

          if (seconds <= 0) {

            clearInterval(
              state.resendTimer
            );

            resendButton.disabled =
              false;

            resendButton.textContent =
              'Resend OTP';

            return;
          }

          resendButton.textContent =
            `Resend OTP in ${seconds}s`;

        },
        1000
      );
  }


  function handleResendOtp() {

    if (
      typeof window.retryOtp !==
      'function'
    ) {
      verifyError.textContent =
        'OTP service is unavailable. Please try again.';

      return;
    }

    resendButton.disabled = true;

    resendButton.textContent =
      'Sending...';

    /*
      null = use the retry channel configured
      inside your MSG91 Widget.
    */
    window.retryOtp(
      null,

      function () {

        verifyError.textContent = '';

        startResendTimer();
      },

      function (error) {

        console.warn(
          '[DTC Cart OTP] Resend OTP error:',
          error
        );

        verifyError.textContent =
          'Could not resend OTP. Please try again shortly.';

        startResendTimer();
      }
    );
  }


  /* =========================================================
     SKIP
  ========================================================= */

  function handleSkip() {

    if (!CONFIG.allowSkip) {
      return;
    }

    /*
      Don't keep interrupting the customer
      during this browser tab/session.
    */
    sessionStorage.setItem(
      SKIP_KEY,
      '1'
    );

    closeModal({
      clearPending: false
    });

    resumePendingAction();
  }


  /* =========================================================
     ADD TO CART INTERCEPTION
  ========================================================= */

  document.addEventListener(
    'submit',

    function (event) {

      const form =
        event.target.closest(
          FORM_SELECTOR
        );

      if (!form) {
        return;
      }


      /*
        Replay after verification/sync:
        allow normal theme functionality.
      */
      if (
        state.bypassForm === form
      ) {
        state.bypassForm = null;

        return;
      }


      const verifiedRecord =
        getVerifiedPhoneRecord();


      /*
        Already verified.
        Make sure this cart has identity metadata
        at least once per browser session.
      */
      if (verifiedRecord) {

        if (
          sessionStorage.getItem(
            CART_SYNC_KEY
          ) !== '1'
        ) {

          event.preventDefault();
          event.stopImmediatePropagation();

          state.pendingAction = {
            form: form,
            submitter:
              event.submitter || null
          };

          syncPhoneToShopifyCart(
            verifiedRecord
          )
            .catch(
              (error) => {
                console.warn(
                  '[DTC Cart OTP] Cart identity sync failed:',
                  error
                );
              }
            )
            .finally(
              () => {
                resumePendingAction();
              }
            );

        }

        return;
      }


      /*
        Customer previously selected
        Continue without WhatsApp
        during this session.
      */
      if (
        CONFIG.allowSkip &&
        sessionStorage.getItem(
          SKIP_KEY
        ) === '1'
      ) {
        return;
      }


      /*
        Stop original Add to Cart.
      */
      event.preventDefault();

      event.stopImmediatePropagation();


      state.pendingAction = {
        form: form,

        submitter:
          event.submitter || null
      };


      openModal();

    },
    true
  );


  /*
    Handle AJAX/theme buttons that don't submit
    a conventional /cart/add form.

    Useful for quick add / Shella-style buttons.
  */
  document.addEventListener(
    'click',

    function (event) {

      const button =
        event.target.closest(
          BUTTON_SELECTOR
        );

      if (!button) {
        return;
      }


      /*
        Standard form is already handled
        by submit listener above.
      */
      const form =
        button.closest(
          FORM_SELECTOR
        );

      if (form) {
        return;
      }


      if (
        state.bypassButton === button
      ) {
        state.bypassButton = null;

        return;
      }


      const verifiedRecord =
        getVerifiedPhoneRecord();

      if (verifiedRecord) {

        if (
          sessionStorage.getItem(
            CART_SYNC_KEY
          ) !== '1'
        ) {

          event.preventDefault();
          event.stopImmediatePropagation();

          state.pendingAction = {
            button: button
          };

          syncPhoneToShopifyCart(
            verifiedRecord
          )
            .catch(
              (error) => {
                console.warn(
                  '[DTC Cart OTP] Cart sync failed:',
                  error
                );
              }
            )
            .finally(
              () => {
                resumePendingAction();
              }
            );
        }

        return;
      }


      if (
        CONFIG.allowSkip &&
        sessionStorage.getItem(
          SKIP_KEY
        ) === '1'
      ) {
        return;
      }


      event.preventDefault();

      event.stopImmediatePropagation();


      state.pendingAction = {
        button: button
      };


      openModal();

    },
    true
  );


  /* =========================================================
     UI EVENTS
  ========================================================= */

  sendOtpButton.addEventListener(
    'click',
    handleSendOtp
  );

  verifyOtpButton.addEventListener(
    'click',
    handleVerifyOtp
  );

  resendButton.addEventListener(
    'click',
    handleResendOtp
  );

  changePhoneButton.addEventListener(
    'click',
    function () {

      clearErrors();

      otpInput.value = '';

      setStep('phone');

      setTimeout(
        () => phoneInput.focus(),
        100
      );
    }
  );

  skipButton.addEventListener(
    'click',
    handleSkip
  );


  /*
    Only show Skip / Close if optional.
  */
  if (!CONFIG.allowSkip) {

    skipButton.hidden = true;

    closeButtons.forEach(
      (button) => {
        button.hidden = true;
      }
    );

  } else {

    closeButtons.forEach(
      (button) => {

        button.addEventListener(
          'click',

          function () {
            closeModal();
          }
        );
      }
    );
  }


  /* =========================================================
     INPUT CLEANUP
  ========================================================= */

  phoneInput.addEventListener(
    'input',
    function () {

      this.value =
        digitsOnly(this.value)
          .slice(0, 10);

      phoneError.textContent = '';
    }
  );


  otpInput.addEventListener(
    'input',
    function () {

      this.value =
        digitsOnly(this.value)
          .slice(0, 6);

      verifyError.textContent = '';
    }
  );


  otpInput.addEventListener(
    'keydown',
    function (event) {

      if (event.key === 'Enter') {
        event.preventDefault();

        handleVerifyOtp();
      }
    }
  );


  phoneInput.addEventListener(
    'keydown',
    function (event) {

      if (event.key === 'Enter') {
        event.preventDefault();

        handleSendOtp();
      }
    }
  );


  document.addEventListener(
    'keydown',
    function (event) {

      if (
        event.key === 'Escape' &&
        modal.classList.contains(
          'is-open'
        ) &&
        CONFIG.allowSkip
      ) {
        closeModal();
      }
    }
  );

})();