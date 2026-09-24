(() => {
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

  delete window.__subtleEncryptHookState;
  delete window.__subtleEncryptHookInstalled;
})();
