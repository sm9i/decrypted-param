(() => {
  const earlyCryptoJsState = window.__decryptedEarlyCryptoJsState;
  earlyCryptoJsState?.restore?.();
  delete window.__decryptedEarlyCryptoJsState;

  const state = window.__subtleEncryptHookState;
  if (!state) {
    return;
  }

  const subtle = window.crypto?.subtle;
  if (subtle && state.originalEncrypt) {
    subtle.encrypt = state.originalEncrypt;
  }
  if (state.originalFetch) {
    window.fetch = state.originalFetch;
  }
  if (state.xhrPrototype && state.originalXhrOpen) {
    state.xhrPrototype.open = state.originalXhrOpen;
  }
  if (state.xhrPrototype && state.originalXhrSend) {
    state.xhrPrototype.send = state.originalXhrSend;
  }
  if (state.cryptoJsHooks) {
    for (const hook of state.cryptoJsHooks) {
      if (hook.target.encrypt === hook.wrapper) {
        hook.target.encrypt = hook.originalEncrypt;
      }
    }
  }
  if (state.cryptoJsScanTimer) {
    window.clearInterval(state.cryptoJsScanTimer);
  }

  const currentAesDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "AES");
  if (
    currentAesDescriptor?.get === state.aesTrapGetter &&
    currentAesDescriptor?.set === state.aesTrapSetter
  ) {
    if (state.originalAesDescriptor) {
      Object.defineProperty(Object.prototype, "AES", state.originalAesDescriptor);
    } else {
      delete Object.prototype.AES;
    }
  }

  delete window.__subtleEncryptHookState;
  delete window.__subtleEncryptHookInstalled;
})();
