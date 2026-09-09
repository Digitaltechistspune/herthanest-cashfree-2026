(() => {
  'use strict';

  /* =========================================================
     DTC — HERTHA NEST
     PHONE OTP + ADD TO CART INTERCEPTOR

     Shopify Theme-Only MVP
     MSG91 Web SDK Custom UI
  ========================================================= */

  const CONFIG =
    window.DTC_CART_OTP_CONFIG || {};


  /* =========================================================
     STORAGE
  ========================================================= */

  const STORAGE_KEY =
    'dtc_cart_phone_verified_v1';

  const SKIP_KEY =
    'dtc_cart_phone_skipped_v1';

  const CART_SYNC_KEY =
    'dtc_cart_phone_synced_v1';


  /* =========================================================
     SHOPIFY / THEME SELECTORS
  ========================================================= */

  const FORM_SELECTOR =
    'form[action*="/cart/add"]';


  const BUTTON_SELECTOR = [

    /* Shopify */
    'button[name="add"]',

    '[data-add-to-cart]',

    '.product-form__submit',

    '.btn--add-to-cart',


    /* Shella */
    '[data-js-product-button-add-to-cart]',

    '.js-product-button-add-to-cart',


    /* Hertha Nest custom Latest Products section */
    '.hn-new30__add'

  ].join(',');


  /* =========================================================
     DOM
  ========================================================= */

  const modal =
    document.getElementById(
      'dtc-cart-otp'
    );


  if (!modal) {

    console.error(
      '[DTC Cart OTP] Popup HTML was not found.'
    );

    return;
  }


  const phoneStep =
    modal.querySelector(
      '[data-dtc-step="phone"]'
    );


  const verifyStep =
    modal.querySelector(
      '[data-dtc-step="verify"]'
    );


  const successStep =
    modal.querySelector(
      '[data-dtc-step="success"]'
    );


  const phoneInput =
    document.getElementById(
      'dtc-otp-phone'
    );


  const consentInput =
    document.getElementById(
      'dtc-otp-consent'
    );


  const otpInput =
    document.getElementById(
      'dtc-otp-code'
    );


  const sendOtpButton =
    document.getElementById(
      'dtc-send-otp'
    );


  const verifyOtpButton =
    document.getElementById(
      'dtc-verify-otp'
    );


  const resendButton =
    document.getElementById(
      'dtc-resend-otp'
    );


  const changePhoneButton =
    document.getElementById(
      'dtc-change-phone'
    );


  const skipButton =
    document.getElementById(
      'dtc-skip-otp'
    );


  const phonePreview =
    document.getElementById(
      'dtc-otp-phone-preview'
    );


  const phoneError =
    document.getElementById(
      'dtc-phone-error'
    );


  const verifyError =
    document.getElementById(
      'dtc-verify-error'
    );


  const closeButtons =
    modal.querySelectorAll(
      '[data-dtc-close]'
    );


  /* =========================================================
     VALIDATE REQUIRED ELEMENTS
  ========================================================= */

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


  if (
    requiredElements.some(
      element => !element
    )
  ) {

    console.error(
      '[DTC Cart OTP] Some popup elements are missing.'
    );

    return;
  }


  if (
    !CONFIG.widgetId ||
    !CONFIG.tokenAuth
  ) {

    console.error(
      '[DTC Cart OTP] MSG91 Widget ID/tokenAuth is missing.'
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

    currentReqId: null,

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

    return String(
      value || ''
    ).replace(
      /\D/g,
      ''
    );

  }


  function clearErrors() {

    phoneError.textContent = '';

    verifyError.textContent = '';

  }


  function setStep(stepName) {

    phoneStep.hidden =
      stepName !== 'phone';

    verifyStep.hidden =
      stepName !== 'verify';

    successStep.hidden =
      stepName !== 'success';

  }


  function setButtonLoading(
    button,
    loading,
    loadingText
  ) {

    if (!button) {
      return;
    }


    if (loading) {

      if (
        !button.dataset.originalText
      ) {

        button.dataset.originalText =
          button.textContent;

      }


      button.disabled = true;

      button.textContent =
        loadingText ||
        'Please wait...';

      return;

    }


    button.disabled = false;


    if (
      button.dataset.originalText
    ) {

      button.textContent =
        button.dataset.originalText;

    }

  }


  function normaliseError(
    error,
    fallback
  ) {

    if (!error) {

      return fallback;

    }


    if (
      typeof error === 'string'
    ) {

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

      return JSON.stringify(
        error
      );

    } catch (_) {

      return fallback;

    }

  }


  function extractReqId(data) {

    if (!data) {
      return null;
    }


    if (
      typeof data.reqId ===
      'string'
    ) {

      return data.reqId;

    }


    if (
      typeof data.requestId ===
      'string'
    ) {

      return data.requestId;

    }


    if (
      data.data &&
      typeof data.data.reqId ===
      'string'
    ) {

      return data.data.reqId;

    }


    if (
      data.data &&
      typeof data.data.requestId ===
      'string'
    ) {

      return data.data.requestId;

    }


    return null;

  }


  /* =========================================================
     MSG91 READY CHECK

     MSG91 itself is loaded and initialized
     by dtc-cart-phone-otp.liquid.
  ========================================================= */

  function ensureMsg91Ready() {

    return new Promise(
      function(
        resolve,
        reject
      ) {

        const startedAt =
          Date.now();


        const timer =
          window.setInterval(
            function() {

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


                console.log(
                  '[DTC Cart OTP] MSG91 methods ready.'
                );


                if (
                  typeof window.getWidgetData ===
                  'function'
                ) {

                  try {

                    console.log(
                      '[DTC Cart OTP] Widget Data:',
                      window.getWidgetData()
                    );

                  } catch (error) {

                    console.warn(
                      '[DTC Cart OTP] Could not read widget data:',
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
                12000
              ) {

                window.clearInterval(
                  timer
                );


                reject(
                  new Error(
                    'MSG91 OTP methods were not available after 12 seconds.'
                  )
                );

              }

            },
            100
          );

      }
    );

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
          Number(
            record.expiresAt
          )
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
        '[DTC Cart OTP] Could not read verification storage:',
        error
      );


      return null;

    }

  }


  function saveVerifiedPhone(
    phone
  ) {

    const days =
      Number(
        CONFIG.verifiedDays
      ) > 0

        ? Number(
            CONFIG.verifiedDays
          )

        : 30;


    const record = {

      phone: phone,

      consent: true,

      verifiedAt:
        Date.now(),

      expiresAt:
        Date.now() +
        (
          days *
          24 *
          60 *
          60 *
          1000
        )

    };


    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        record
      )
    );


    sessionStorage.removeItem(
      SKIP_KEY
    );


    return record;

  }


  /* =========================================================
     SHOPIFY CART ATTRIBUTES
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

          body:
            JSON.stringify({
              attributes
            })

        }
      );


    if (!response.ok) {

      throw new Error(
        `Shopify cart update failed with status ${response.status}`
      );

    }


    sessionStorage.setItem(
      CART_SYNC_KEY,
      '1'
    );


    console.log(
      '[DTC Cart OTP] Verified phone synced to Shopify cart.'
    );

  }


  /* =========================================================
     MODAL
  ========================================================= */

  function openModal() {

    clearErrors();

    otpInput.value = '';

    state.currentReqId =
      null;


    setStep(
      'phone'
    );


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


    ensureMsg91Ready()
      .then(
        function() {

          console.log(
            '[DTC Cart OTP] OTP service ready.'
          );

        }
      )
      .catch(
        function(error) {

          console.error(
            '[DTC Cart OTP] MSG91 not ready:',
            error
          );


          phoneError.textContent =
            'OTP service could not load. Please refresh and try again.';

        }
      );


    window.setTimeout(
      function() {

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
      Standard Shopify product form.
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
          '[DTC Cart OTP] Could not resume product form:',
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
      Custom AJAX Add to Cart button,
      including Hertha Nest .hn-new30__add
    */
    if (pending.button) {

      state.bypassButton =
        pending.button;


      pending.button.click();


      window.setTimeout(
        function() {

          state.bypassButton =
            null;

        },
        200
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


    /*
      Indian mobile:
      starts 6–9
      total 10 digits
    */
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
        MSG91 expects:
        country code + number
        WITHOUT +

        Example:
        919999999999
      */
      state.currentIdentifier =
        `${
          CONFIG.countryCode ||
          '91'
        }${phone}`;


      console.log(
        '[DTC Cart OTP] Sending OTP to:',
        state.currentIdentifier
      );


      let completed =
        false;


      const timeout =
        window.setTimeout(
          function() {

            if (completed) {

              return;

            }


            completed =
              true;


            setButtonLoading(
              sendOtpButton,
              false
            );


            phoneError.textContent =
              'OTP request timed out. Please try again.';


            console.error(
              '[DTC Cart OTP] MSG91 sendOtp returned no callback.'
            );

          },
          15000
        );


      window.sendOtp(

        state.currentIdentifier,


        function(data) {

          if (completed) {

            return;

          }


          completed =
            true;


          window.clearTimeout(
            timeout
          );


          console.log(
            '[DTC Cart OTP] Send OTP success:',
            data
          );


          state.currentReqId =
            extractReqId(
              data
            );


          console.log(
            '[DTC Cart OTP] Request ID:',
            state.currentReqId
          );


          phonePreview.textContent =
            `+${
              CONFIG.countryCode ||
              '91'
            } ${phone}`;


          setButtonLoading(
            sendOtpButton,
            false
          );


          setStep(
            'verify'
          );


          startResendTimer();


          window.setTimeout(
            function() {

              otpInput.focus();

            },
            50
          );

        },


        function(error) {

          if (completed) {

            return;

          }


          completed =
            true;


          window.clearTimeout(
            timeout
          );


          setButtonLoading(
            sendOtpButton,
            false
          );


          console.error(
            '[DTC Cart OTP] Send OTP error:',
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
        '[DTC Cart OTP] Send OTP initialization error:',
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
      !/^\d{6}$/.test(
        otp
      )
    ) {

      verifyError.textContent =
        'Please enter the complete 6-digit OTP.';


      otpInput.focus();

      return;

    }


    setButtonLoading(
      verifyOtpButton,
      true,
      'Verifying...'
    );


    try {

      await ensureMsg91Ready();


      let completed =
        false;


      const timeout =
        window.setTimeout(
          function() {

            if (completed) {

              return;

            }


            completed =
              true;


            setButtonLoading(
              verifyOtpButton,
              false
            );


            verifyError.textContent =
              'OTP verification timed out. Please try again.';

          },
          15000
        );


      /*
        MSG91 supports reqId as optional
        fourth parameter.

        Using it makes this safer if multiple
        OTP requests happen in one session.
      */
      window.verifyOtp(

        otp,


        async function(data) {

          if (completed) {

            return;

          }


          completed =
            true;


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


          setStep(
            'success'
          );


          /*
            Save phone/consent metadata
            to current Shopify cart.
          */
          try {

            await syncPhoneToShopifyCart(
              record
            );

          } catch (error) {

            /*
              Do not break the customer's purchase
              because cart metadata failed.
            */
            console.warn(
              '[DTC Cart OTP] OTP verified but Shopify cart metadata failed:',
              error
            );

          }


          setButtonLoading(
            verifyOtpButton,
            false
          );


          window.setTimeout(
            function() {

              closeModal({
                clearPending: false
              });


              resumePendingAction();

            },
            500
          );

        },


        function(error) {

          if (completed) {

            return;

          }


          completed =
            true;


          window.clearTimeout(
            timeout
          );


          setButtonLoading(
            verifyOtpButton,
            false
          );


          console.error(
            '[DTC Cart OTP] Verify OTP error:',
            error
          );


          verifyError.textContent =
            normaliseError(
              error,
              'Incorrect or expired OTP. Please try again.'
            );

        },


        /*
          Optional reqId.
        */
        state.currentReqId ||
        undefined

      );

    } catch (error) {

      console.error(
        '[DTC Cart OTP] Verify initialization error:',
        error
      );


      setButtonLoading(
        verifyOtpButton,
        false
      );


      verifyError.textContent =
        'OTP service could not load. Please refresh and try again.';

    }

  }


  /* =========================================================
     RESEND OTP
  ========================================================= */

  function startResendTimer() {

    window.clearInterval(
      state.resendTimer
    );


    let seconds =
      30;


    resendButton.disabled =
      true;


    resendButton.textContent =
      `Resend OTP in ${seconds}s`;


    state.resendTimer =
      window.setInterval(
        function() {

          seconds -=
            1;


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


    resendButton.disabled =
      true;


    resendButton.textContent =
      'Sending...';


    try {

      await ensureMsg91Ready();


      /*
        Because your MSG91 channel uses
        DEFAULT CONFIGURATION,
        retry channel should be null.
      */
      window.retryOtp(

        null,


        function(data) {

          console.log(
            '[DTC Cart OTP] OTP resent:',
            data
          );


          const newReqId =
            extractReqId(
              data
            );


          if (newReqId) {

            state.currentReqId =
              newReqId;

          }


          verifyError.textContent =
            '';


          startResendTimer();

        },


        function(error) {

          console.error(
            '[DTC Cart OTP] Retry OTP error:',
            error
          );


          verifyError.textContent =
            normaliseError(
              error,
              'Could not resend OTP. Please try again.'
            );


          startResendTimer();

        },


        state.currentReqId ||
        undefined

      );

    } catch (error) {

      console.error(
        '[DTC Cart OTP] Retry initialization error:',
        error
      );


      verifyError.textContent =
        'OTP service could not load. Please refresh and try again.';


      startResendTimer();

    }

  }


  /* =========================================================
     CHANGE PHONE
  ========================================================= */

  function handleChangePhone() {

    window.clearInterval(
      state.resendTimer
    );


    state.currentIdentifier =
      null;


    state.currentReqId =
      null;


    otpInput.value =
      '';


    clearErrors();


    setStep(
      'phone'
    );


    window.setTimeout(
      function() {

        phoneInput.focus();

      },
      100
    );

  }


  /* =========================================================
     CONTINUE WITHOUT WHATSAPP
  ========================================================= */

  function handleSkip() {

    if (
      !CONFIG.allowSkip
    ) {

      return;

    }


    /*
      Only suppress popup during
      current tab/session.
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
     NORMAL SHOPIFY ADD TO CART FORMS
  ========================================================= */

  document.addEventListener(
    'submit',

    function(event) {

      const form =
        event.target.closest(
          FORM_SELECTOR
        );


      if (!form) {

        return;

      }


      /*
        This is our replay after
        successful OTP verification.
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
        Customer already verified.
      */
      if (verifiedRecord) {

        /*
          Sync phone metadata once
          for current browser session/cart.
        */
        if (
          sessionStorage.getItem(
            CART_SYNC_KEY
          ) !== '1'
        ) {

          event.preventDefault();

          event.stopImmediatePropagation();


          state.pendingAction = {

            form,

            submitter:
              event.submitter ||
              null

          };


          syncPhoneToShopifyCart(
            verifiedRecord
          )

            .catch(
              function(error) {

                console.warn(
                  '[DTC Cart OTP] Cart sync failed:',
                  error
                );

              }
            )

            .finally(
              function() {

                resumePendingAction();

              }
            );

        }


        return;

      }


      /*
        Customer already chose
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
        Stop Shopify/theme Add to Cart
        before OTP.
      */
      event.preventDefault();

      event.stopImmediatePropagation();


      state.pendingAction = {

        form,

        submitter:
          event.submitter ||
          null

      };


      openModal();

    },

    /*
      Capture phase ensures our listener
      gets the event before most theme JS.
    */
    true
  );


  /* =========================================================
     CUSTOM / AJAX ADD TO CART BUTTONS
  ========================================================= */

  document.addEventListener(
    'click',

    function(event) {

      const button =
        event.target.closest(
          BUTTON_SELECTOR
        );


      if (!button) {

        return;

      }


      /*
        If this button sits inside
        a normal Shopify cart form,
        the submit handler above handles it.
      */
      const form =
        button.closest(
          FORM_SELECTOR
        );


      if (form) {

        return;

      }


      /*
        This is the click that WE replay
        after verification.
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
            button
          };


          syncPhoneToShopifyCart(
            verifiedRecord
          )

            .catch(
              function(error) {

                console.warn(
                  '[DTC Cart OTP] Cart sync failed:',
                  error
                );

              }
            )

            .finally(
              function() {

                resumePendingAction();

              }
            );

        }


        return;

      }


      /*
        Customer chose skip.
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
        Prevent Hertha Nest / Shella
        AJAX Add To Cart.
      */
      event.preventDefault();

      event.stopImmediatePropagation();


      state.pendingAction = {
        button
      };


      openModal();

    },

    /*
      Capture phase is essential for
      custom AJAX Add to Cart buttons.
    */
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
    handleChangePhone
  );


  skipButton.addEventListener(
    'click',
    handleSkip
  );


  /* =========================================================
     CLOSE BEHAVIOUR
  ========================================================= */

  if (
    !CONFIG.allowSkip
  ) {

    /*
      Mandatory mode:
      cannot close or skip OTP.
    */
    skipButton.hidden =
      true;


    closeButtons.forEach(
      function(button) {

        button.hidden =
          true;

      }
    );

  } else {

    closeButtons.forEach(
      function(button) {

        button.addEventListener(
          'click',

          function() {

            /*
              Closing the popup does NOT
              add the product.
            */
            closeModal();

          }
        );

      }
    );

  }


  /* =========================================================
     PHONE INPUT
  ========================================================= */

  phoneInput.addEventListener(
    'input',

    function() {

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


  phoneInput.addEventListener(
    'keydown',

    function(event) {

      if (
        event.key ===
        'Enter'
      ) {

        event.preventDefault();


        handleSendOtp();

      }

    }
  );


  /* =========================================================
     OTP INPUT
  ========================================================= */

  otpInput.addEventListener(
    'input',

    function() {

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


  otpInput.addEventListener(
    'keydown',

    function(event) {

      if (
        event.key ===
        'Enter'
      ) {

        event.preventDefault();


        handleVerifyOtp();

      }

    }
  );


  /* =========================================================
     ESC KEY
  ========================================================= */

  document.addEventListener(
    'keydown',

    function(event) {

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
     STARTUP DIAGNOSTIC
  ========================================================= */

  console.log(
    '[DTC Cart OTP] Script loaded successfully.'
  );


  /*
    Check MSG91 after page load.
    This does NOT block the storefront.
  */
  window.setTimeout(
    function() {

      ensureMsg91Ready()

        .then(
          function() {

            console.log(
              '[DTC Cart OTP] MSG91 initialized successfully.'
            );


            console.log(
              '[DTC Cart OTP] sendOtp:',
              typeof window.sendOtp
            );


            console.log(
              '[DTC Cart OTP] verifyOtp:',
              typeof window.verifyOtp
            );


            console.log(
              '[DTC Cart OTP] retryOtp:',
              typeof window.retryOtp
            );

          }
        )

        .catch(
          function(error) {

            console.error(
              '[DTC Cart OTP] MSG91 startup check failed:',
              error
            );

          }
        );

    },
    500
  );

})();