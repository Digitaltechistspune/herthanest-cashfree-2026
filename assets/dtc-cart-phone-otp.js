(() => {
  'use strict';

  /* =========================================================
     DTC — HERTHA NEST CART PHONE OTP
     Shopify theme-only MVP + MSG91 Custom UI
  ========================================================= */

  const CONFIG = window.DTC_CART_OTP_CONFIG || {};

  const STORAGE_KEY = 'dtc_cart_phone_verified_v1';
  const SKIP_KEY = 'dtc_cart_phone_skipped_v1';
  const CART_SYNC_KEY = 'dtc_cart_phone_synced_v1';

  const FORM_SELECTOR = 'form[action*="/cart/add"]';

  const BUTTON_SELECTOR = [
    'button[name="add"]',
    '[data-add-to-cart]',
    '[data-js-product-button-add-to-cart]',
    '.js-product-button-add-to-cart',
    '.product-form__submit',
    '.btn--add-to-cart',

    /* Hertha Nest custom Latest Products carousel */
    '.hn-new30__add'
  ].join(',');

  /* =========================================================
     DOM
  ========================================================= */

  const modal = document.getElementById('dtc-cart-otp');

  if (!modal) {
    console.warn('[DTC Cart OTP] Modal #dtc-cart-otp was not found.');
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

  const requiredElements = [
    phoneStep,
    verifyStep,
    successStep,
    phoneInput,
    consentInput,
    otpInput,
    sendOtpButton,
    verifyOtpButton,
    resendButton,
    changePhoneButton,
    skipButton,
    phonePreview,
    phoneError,
    verifyError
  ];

  if (requiredElements.some((element) => !element)) {
    console.error(
      '[DTC Cart OTP] One or more required popup elements are missing.'
    );

    return;
  }

  if (!CONFIG.widgetId || !CONFIG.tokenAuth) {
    console.error(
      '[DTC Cart OTP] Missing MSG91 widgetId/tokenAuth in DTC_CART_OTP_CONFIG.'
    );
  }

  /* =========================================================
     STATE
  ========================================================= */

  const state = {
    pendingAction: null,

    bypassForm: null,

    bypassButton: null,

    currentIdentifier: null,

    sdkPromise: null,

    sdkInitialized: false,

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

  function setButtonLoading(
    button,
    loading,
    loadingText
  ) {
    if (!button) return;

    if (loading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText =
          button.textContent;
      }

      button.disabled = true;

      button.textContent =
        loadingText || 'Please wait...';

      return;
    }

    button.disabled = false;

    if (button.dataset.originalText) {
      button.textContent =
        button.dataset.originalText;
    }
  }

  function setStep(stepName) {
    phoneStep.hidden =
      stepName !== 'phone';

    verifyStep.hidden =
      stepName !== 'verify';

    successStep.hidden =
      stepName !== 'success';
  }

  function clearErrors() {
    phoneError.textContent = '';
    verifyError.textContent = '';
  }

  function normaliseError(
    error,
    fallback
  ) {
    if (!error) {
      return fallback;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    if (
      error.data &&
      error.data.message
    ) {
      return error.data.message;
    }

    if (
      error.response &&
      error.response.message
    ) {
      return error.response.message;
    }

    try {
      return JSON.stringify(error);

    } catch (_) {
      return fallback;
    }
  }

  /* =========================================================
     VERIFIED PHONE STORAGE
  ========================================================= */

  function getVerifiedPhoneRecord() {
    try {
      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (!raw) {
        return null;
      }

      const record =
        JSON.parse(raw);

      if (
        !record ||
        !record.phone ||
        !record.expiresAt ||
        Date.now() >
          Number(record.expiresAt)
      ) {
        localStorage.removeItem(
          STORAGE_KEY
        );

        sessionStorage.removeItem(
          CART_SYNC_KEY
        );

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
        Date.now() +
        days *
          24 *
          60 *
          60 *
          1000
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(record)
    );

    sessionStorage.removeItem(
      SKIP_KEY
    );

    return record;
  }

  /* =========================================================
     SHOPIFY CART IDENTITY
  ========================================================= */

  async function syncPhoneToShopifyCart(
    record
  ) {
    if (
      !record ||
      !record.phone
    ) {
      return;
    }

    const attributes = {
      __dtc_verified_phone:
        record.phone,

      __dtc_whatsapp_consent:
        record.consent
          ? 'yes'
          : 'no',

      __dtc_phone_verified_at:
        new Date(
          record.verifiedAt
        ).toISOString(),

      __dtc_phone_source:
        'add_to_cart_msg91_otp'
    };

    const response =
      await fetch(
        `${rootUrl()}cart/update.js`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',

            'Accept':
              'application/json'
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
     MSG91 INITIALIZATION
  ========================================================= */

  function initialiseMsg91Widget() {
    if (state.sdkInitialized) {
      return;
    }

    if (
      typeof window.initSendOTP !==
      'function'
    ) {
      throw new Error(
        'MSG91 initSendOTP is unavailable.'
      );
    }

    if (
      !CONFIG.widgetId ||
      !CONFIG.tokenAuth
    ) {
      throw new Error(
        'MSG91 Widget ID or Widget Token is missing.'
      );
    }

    const configuration = {
      widgetId:
        String(CONFIG.widgetId),

      tokenAuth:
        String(CONFIG.tokenAuth),

      exposeMethods: true,

      /*
        CAPTCHA IS CURRENTLY OFF.

        MSG91 requires this to be a string.

        DO NOT leave this as:
        captchaRenderId:

        because that breaks the whole JS file.
      */
      captchaRenderId:
        CONFIG.captchaEnabled === true
          ? 'dtc-otp-captcha'
          : '',

      success: function (data) {
        console.log(
          '[DTC Cart OTP] MSG91 widget success:',
          data
        );
      },

      failure: function (error) {
        console.error(
          '[DTC Cart OTP] MSG91 widget failure:',
          error
        );
      }
    };

    console.log(
      '[DTC Cart OTP] Initialising MSG91 widget...'
    );

    window.initSendOTP(
      configuration
    );

    state.sdkInitialized = true;
  }

  function waitForMsg91Methods(
    resolve,
    reject
  ) {
    const startedAt =
      Date.now();

    const timer =
      window.setInterval(
        function () {
          const ready =
            typeof window.sendOtp ===
              'function' &&
            typeof window.verifyOtp ===
              'function' &&
            typeof window.retryOtp ===
              'function';

          if (ready) {
            window.clearInterval(
              timer
            );

            if (
              typeof window.getWidgetData ===
              'function'
            ) {
              try {
                console.log(
                  '[DTC Cart OTP] MSG91 widget data:',
                  window.getWidgetData()
                );

              } catch (error) {
                console.warn(
                  '[DTC Cart OTP] Could not read widget data.',
                  error
                );
              }
            }

            resolve();

            return;
          }

          if (
            Date.now() -
              startedAt >
            10000
          ) {
            window.clearInterval(
              timer
            );

            reject(
              new Error(
                'MSG91 exposed methods were not ready within 10 seconds.'
              )
            );
          }
        },

        100
      );
  }

  function waitForInitFunction() {
    return new Promise(
      function (
        resolve,
        reject
      ) {
        const startedAt =
          Date.now();

        const timer =
          window.setInterval(
            function () {
              if (
                typeof window.initSendOTP ===
                'function'
              ) {
                window.clearInterval(
                  timer
                );

                resolve();

                return;
              }

              if (
                Date.now() -
                  startedAt >
                10000
              ) {
                window.clearInterval(
                  timer
                );

                reject(
                  new Error(
                    'MSG91 initSendOTP did not become available.'
                  )
                );
              }
            },

            100
          );
      }
    );
  }

  function ensureMsg91Ready() {
    if (state.sdkPromise) {
      return state.sdkPromise;
    }

    state.sdkPromise =
      new Promise(
        async function (
          resolve,
          reject
        ) {
          try {
            /*
              SDK already present.
              IMPORTANT:
              We still initialise OUR widget.
            */
            if (
              typeof window.initSendOTP ===
              'function'
            ) {
              initialiseMsg91Widget();

              waitForMsg91Methods(
                resolve,
                reject
              );

              return;
            }

            let script =
              document.querySelector(
                'script[src*="verify.msg91.com/otp-provider.js"]'
              );

            if (!script) {
              script =
                document.createElement(
                  'script'
                );

              script.src =
                'https://verify.msg91.com/otp-provider.js';

              script.async = true;

              script.dataset.dtcMsg91Sdk =
                'true';

              document.head.appendChild(
                script
              );
            }

            await new Promise(
              function (
                scriptResolve,
                scriptReject
              ) {
                if (
                  typeof window.initSendOTP ===
                  'function'
                ) {
                  scriptResolve();

                  return;
                }

                script.addEventListener(
                  'load',

                  function () {
                    scriptResolve();
                  },

                  {
                    once: true
                  }
                );

                script.addEventListener(
                  'error',

                  function () {
                    scriptReject(
                      new Error(
                        'Unable to load MSG91 OTP SDK.'
                      )
                    );
                  },

                  {
                    once: true
                  }
                );

                /*
                  Handles an SDK script that
                  already loaded earlier.
                */
                waitForInitFunction()
                  .then(
                    scriptResolve
                  )
                  .catch(
                    function () {
                      /*
                        Let actual script
                        load/error handle it.
                      */
                    }
                  );
              }
            );

            await waitForInitFunction();

            initialiseMsg91Widget();

            waitForMsg91Methods(
              resolve,
              reject
            );

          } catch (error) {
            state.sdkPromise =
              null;

            reject(error);
          }
        }
      );

    return state.sdkPromise;
  }

  /* =========================================================
     MODAL
  ========================================================= */

  function openModal() {
    clearErrors();

    otpInput.value = '';

    setStep('phone');

    modal.classList.add(
      'is-open'
    );

    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'dtc-otp-open'
    );

    /*
      Load MSG91 in background.
    */
    ensureMsg91Ready()
      .catch(
        function (error) {
          console.error(
            '[DTC Cart OTP] MSG91 initialization failed:',
            error
          );

          phoneError.textContent =
            'OTP service could not load. Please refresh and try again.';
        }
      );

    window.setTimeout(
      function () {
        phoneInput.focus();
      },

      150
    );
  }

  function closeModal({
    clearPending = true
  } = {}) {
    modal.classList.remove(
      'is-open'
    );

    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'dtc-otp-open'
    );

    clearErrors();

    if (clearPending) {
      state.pendingAction =
        null;
    }
  }

  /* =========================================================
     RESUME ORIGINAL ADD TO CART
  ========================================================= */

  function resumePendingAction() {
    const pending =
      state.pendingAction;

    state.pendingAction =
      null;

    if (!pending) {
      return;
    }

    /*
      Standard Shopify form.
    */
    if (pending.form) {
      state.bypassForm =
        pending.form;

      try {
        if (
          typeof pending.form
            .requestSubmit ===
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
          typeof pending.form
            .requestSubmit ===
          'function'
        ) {
          pending.form.requestSubmit();
        }
      }

      return;
    }

    /*
      Custom AJAX Add to Cart.
    */
    if (pending.button) {
      state.bypassButton =
        pending.button;

      pending.button.click();

      window.setTimeout(
        function () {
          state.bypassButton =
            null;
        },

        150
      );
    }
  }

  /* =========================================================
     SEND OTP
  ========================================================= */

  async function handleSendOtp() {
    clearErrors();

    const phone =
      digitsOnly(
        phoneInput.value
      );

    if (
      !/^[6-9]\d{9}$/.test(
        phone
      )
    ) {
      phoneError.textContent =
        'Please enter a valid 10-digit Indian mobile number.';

      phoneInput.focus();

      return;
    }

    if (
      !consentInput.checked
    ) {
      phoneError.textContent =
        'Please agree to receive cart reminders and order updates on WhatsApp.';

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

      /*
        Country code WITHOUT +
        Example: 919999999999
      */
      state.currentIdentifier =
        `${
          CONFIG.countryCode ||
          '91'
        }${phone}`;

      console.log(
        '[DTC Cart OTP] Calling MSG91 sendOtp for:',
        state.currentIdentifier
      );

      let completed = false;

      const timeout =
        window.setTimeout(
          function () {
            if (completed) {
              return;
            }

            completed = true;

            setButtonLoading(
              sendOtpButton,
              false
            );

            phoneError.textContent =
              'OTP request timed out. Please try again.';

            console.error(
              '[DTC Cart OTP] MSG91 sendOtp produced no success/failure callback.'
            );
          },

          15000
        );

      window.sendOtp(
        state.currentIdentifier,

        function (data) {
          if (completed) {
            return;
          }

          completed = true;

          window.clearTimeout(
            timeout
          );

          console.log(
            '[DTC Cart OTP] OTP sent successfully:',
            data
          );

          phonePreview.textContent =
            `+${
              CONFIG.countryCode ||
              '91'
            } ${phone}`;

          setStep('verify');

          setButtonLoading(
            sendOtpButton,
            false
          );

          startResendTimer();

          window.setTimeout(
            function () {
              otpInput.focus();
            },

            50
          );
        },

        function (error) {
          if (completed) {
            return;
          }

          completed = true;

          window.clearTimeout(
            timeout
          );

          setButtonLoading(
            sendOtpButton,
            false
          );

          console.error(
            '[DTC Cart OTP] Send OTP failed:',
            error
          );

          phoneError.textContent =
            normaliseError(
              error,
              'We could not send the OTP. Please try again.'
            );
        }
      );

    } catch (error) {
      console.error(
        '[DTC Cart OTP] OTP initialization/send error:',
        error
      );

      setButtonLoading(
        sendOtpButton,
        false
      );

      phoneError.textContent =
        'OTP service could not load. Please refresh and try again.';
    }
  }

  /* =========================================================
     VERIFY OTP
  ========================================================= */

  async function handleVerifyOtp() {
    clearErrors();

    const otp =
      digitsOnly(
        otpInput.value
      );

    if (
      !/^\d{6}$/.test(otp)
    ) {
      verifyError.textContent =
        'Please enter the complete 6-digit OTP.';

      otpInput.focus();

      return;
    }

    try {
      await ensureMsg91Ready();

    } catch (error) {
      console.error(
        '[DTC Cart OTP] MSG91 unavailable for verify:',
        error
      );

      verifyError.textContent =
        'OTP service is unavailable. Please refresh and try again.';

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

    let completed = false;

    const timeout =
      window.setTimeout(
        function () {
          if (completed) {
            return;
          }

          completed = true;

          setButtonLoading(
            verifyOtpButton,
            false
          );

          verifyError.textContent =
            'OTP verification timed out. Please try again.';
        },

        15000
      );

    window.verifyOtp(
      otp,

      async function (data) {
        if (completed) {
          return;
        }

        completed = true;

        window.clearTimeout(
          timeout
        );

        console.log(
          '[DTC Cart OTP] OTP verified:',
          data
        );

        const verifiedPhone =
          `+${
            state.currentIdentifier
          }`;

        const record =
          saveVerifiedPhone(
            verifiedPhone
          );

        setStep('success');

        /*
          Save verified phone
          in Shopify cart.
        */
        try {
          await syncPhoneToShopifyCart(
            record
          );

        } catch (error) {
          console.warn(
            '[DTC Cart OTP] Phone verified, but Shopify cart sync failed:',
            error
          );
        }

        setButtonLoading(
          verifyOtpButton,
          false
        );

        window.setTimeout(
          function () {
            closeModal({
              clearPending: false
            });

            resumePendingAction();
          },

          450
        );
      },

      function (error) {
        if (completed) {
          return;
        }

        completed = true;

        window.clearTimeout(
          timeout
        );

        setButtonLoading(
          verifyOtpButton,
          false
        );

        console.error(
          '[DTC Cart OTP] Verify OTP failed:',
          error
        );

        verifyError.textContent =
          normaliseError(
            error,
            'Incorrect or expired OTP. Please try again.'
          );
      }
    );
  }

  /* =========================================================
     RESEND OTP
  ========================================================= */

  function startResendTimer() {
    window.clearInterval(
      state.resendTimer
    );

    let seconds = 30;

    resendButton.disabled =
      true;

    resendButton.textContent =
      `Resend OTP in ${seconds}s`;

    state.resendTimer =
      window.setInterval(
        function () {
          seconds -= 1;

          if (
            seconds <= 0
          ) {
            window.clearInterval(
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

  async function handleResendOtp() {
    clearErrors();

    try {
      await ensureMsg91Ready();

    } catch (error) {
      verifyError.textContent =
        'OTP service is unavailable. Please refresh and try again.';

      return;
    }

    if (
      typeof window.retryOtp !==
      'function'
    ) {
      verifyError.textContent =
        'OTP resend service is unavailable. Please try again.';

      return;
    }

    resendButton.disabled =
      true;

    resendButton.textContent =
      'Sending...';

    /*
      null = default channel
      configured in MSG91.
    */
    window.retryOtp(
      null,

      function (data) {
        console.log(
          '[DTC Cart OTP] OTP resent:',
          data
        );

        verifyError.textContent =
          '';

        startResendTimer();
      },

      function (error) {
        console.error(
          '[DTC Cart OTP] Resend OTP failed:',
          error
        );

        verifyError.textContent =
          normaliseError(
            error,
            'Could not resend OTP. Please try again shortly.'
          );

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
     ADD TO CART — NORMAL FORMS
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
        Replay after successful
        OTP verification.
      */
      if (
        state.bypassForm ===
        form
      ) {
        state.bypassForm =
          null;

        return;
      }

      const verifiedRecord =
        getVerifiedPhoneRecord();

      /*
        Already verified.
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
              event.submitter ||
              null
          };

          syncPhoneToShopifyCart(
            verifiedRecord
          )
            .catch(
              function (error) {
                console.warn(
                  '[DTC Cart OTP] Cart identity sync failed:',
                  error
                );
              }
            )

            .finally(
              function () {
                resumePendingAction();
              }
            );
        }

        return;
      }

      /*
        Customer selected
        Continue without WhatsApp.
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
        Block original
        Add to Cart.
      */
      event.preventDefault();

      event.stopImmediatePropagation();

      state.pendingAction = {
        form: form,

        submitter:
          event.submitter ||
          null
      };

      openModal();
    },

    true
  );

  /* =========================================================
     ADD TO CART — AJAX / CUSTOM BUTTONS
  ========================================================= */

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
        Standard Shopify forms
        are handled above.
      */
      const form =
        button.closest(
          FORM_SELECTOR
        );

      if (form) {
        return;
      }

      /*
        Replayed click after
        successful verification.
      */
      if (
        state.bypassButton ===
        button
      ) {
        state.bypassButton =
          null;

        return;
      }

      const verifiedRecord =
        getVerifiedPhoneRecord();

      /*
        Already verified.
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
            button: button
          };

          syncPhoneToShopifyCart(
            verifiedRecord
          )
            .catch(
              function (error) {
                console.warn(
                  '[DTC Cart OTP] Cart sync failed:',
                  error
                );
              }
            )

            .finally(
              function () {
                resumePendingAction();
              }
            );
        }

        return;
      }

      /*
        Customer already skipped
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
        Intercept Hertha Nest
        AJAX Add to Cart.
      */
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

      window.setTimeout(
        function () {
          phoneInput.focus();
        },

        100
      );
    }
  );

  skipButton.addEventListener(
    'click',
    handleSkip
  );

  /*
    If skip is disabled,
    customer must verify OTP.
  */
  if (!CONFIG.allowSkip) {
    skipButton.hidden = true;

    closeButtons.forEach(
      function (button) {
        button.hidden = true;
      }
    );

  } else {
    closeButtons.forEach(
      function (button) {
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
        digitsOnly(
          this.value
        ).slice(
          0,
          10
        );

      phoneError.textContent =
        '';
    }
  );

  otpInput.addEventListener(
    'input',

    function () {
      this.value =
        digitsOnly(
          this.value
        ).slice(
          0,
          6
        );

      verifyError.textContent =
        '';
    }
  );

  phoneInput.addEventListener(
    'keydown',

    function (event) {
      if (
        event.key ===
        'Enter'
      ) {
        event.preventDefault();

        handleSendOtp();
      }
    }
  );

  otpInput.addEventListener(
    'keydown',

    function (event) {
      if (
        event.key ===
        'Enter'
      ) {
        event.preventDefault();

        handleVerifyOtp();
      }
    }
  );

  document.addEventListener(
    'keydown',

    function (event) {
      if (
        event.key ===
          'Escape' &&
        modal.classList.contains(
          'is-open'
        ) &&
        CONFIG.allowSkip
      ) {
        closeModal();
      }
    }
  );

  /* =========================================================
     INITIAL LOG
  ========================================================= */

  console.log(
    '[DTC Cart OTP] Script loaded successfully.'
  );

})();