(() => {
  const hookVersion = 8;
  const earlyCryptoJsState = window.__decryptedEarlyCryptoJsState;
  const earlyCryptoJsCandidates = earlyCryptoJsState?.candidates
    ? [...earlyCryptoJsState.candidates]
    : [];

  const previousState = window.__subtleEncryptHookState;
  if (previousState?.version === hookVersion) {
    previousState.scanCryptoJs?.();
    return;
  }

  const restoreState = (state) => {
    const subtle = window.crypto?.subtle;
    if (subtle && state?.originalEncrypt) subtle.encrypt = state.originalEncrypt;
    if (state?.originalFetch) window.fetch = state.originalFetch;
    if (state?.xhrPrototype && state.originalXhrOpen) state.xhrPrototype.open = state.originalXhrOpen;
    if (state?.xhrPrototype && state.originalXhrSend) state.xhrPrototype.send = state.originalXhrSend;
    if (state?.cryptoJsHooks) {
      for (const hook of state.cryptoJsHooks) {
        if (hook.target.encrypt === hook.wrapper) hook.target.encrypt = hook.originalEncrypt;
      }
    }
    if (state?.cryptoJsScanTimer) window.clearInterval(state.cryptoJsScanTimer);
    const currentAesDescriptor = Object.getOwnPropertyDescriptor(Object.prototype, "AES");
    if (
      state &&
      currentAesDescriptor &&
      currentAesDescriptor.get === state.aesTrapGetter &&
      currentAesDescriptor.set === state.aesTrapSetter
    ) {
      if (state.originalAesDescriptor) Object.defineProperty(Object.prototype, "AES", state.originalAesDescriptor);
      else delete Object.prototype.AES;
    }
  };

  restoreState(previousState);

  const subtle = window.crypto?.subtle;
  const state = {
    version: hookVersion,
    originalEncrypt: subtle && typeof subtle.encrypt === "function" ? subtle.encrypt.bind(subtle) : null,
    originalFetch: window.fetch,
    xhrPrototype: window.XMLHttpRequest?.prototype || null,
    originalXhrOpen: window.XMLHttpRequest?.prototype.open || null,
    originalXhrSend: window.XMLHttpRequest?.prototype.send || null,
    originalAesDescriptor: Object.getOwnPropertyDescriptor(Object.prototype, "AES"),
    aesTrapGetter: null,
    aesTrapSetter: null,
    cryptoJsScanTimer: null,
    cryptoJsHookFound: false,
    cryptoJsHooks: [],
    hookedCryptoJsObjects: new WeakSet(),
    sequence: 0,
    requests: [],
    xhrMetadata: new WeakMap()
  };

  const bytesToBase64 = (value) => {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return window.btoa(binary);
  };

  const wordArrayToBytes = (value) => {
    if (!value || !Array.isArray(value.words) || !Number.isFinite(value.sigBytes)) return null;
    const bytes = new Uint8Array(Math.max(0, value.sigBytes));
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = (value.words[index >>> 2] >>> (24 - (index % 4) * 8)) & 0xff;
    }
    return bytes;
  };

  const decodeReadableText = (data) => {
    if (typeof data === "string") return data;
    const wordArrayBytes = wordArrayToBytes(data);
    if (wordArrayBytes) data = wordArrayBytes;
    if (!Array.isArray(data) && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return null;
    try {
      let bytes = data;
      if (Array.isArray(data)) bytes = new Uint8Array(data);
      else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!decoded.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/.test(decoded)) return null;
      return decoded;
    } catch {
      return null;
    }
  };

  const bodyToText = (body) => {
    if (body == null) return "";
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return Array.from(body.entries()).map(([name, value]) => `${name}=${typeof value === "string" ? value : "[File]"}`).join("&");
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      try {
        const bytes = body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
        return new TextDecoder().decode(bytes);
      } catch {
        return "";
      }
    }
    return String(body);
  };

  const rememberRequest = (url, method, body) => {
    const request = {
      url: String(url || location.href),
      method: String(method || "GET").toUpperCase(),
      body: bodyToText(body),
      createdAt: Date.now()
    };
    state.requests.push(request);
    if (state.requests.length > 200) state.requests.splice(0, state.requests.length - 200);
    return request;
  };

  const findRequest = (encryptedValues, encryptedAt) => {
    const values = encryptedValues.filter(Boolean);
    const encodedValues = values.map((value) => encodeURIComponent(value));
    for (let index = state.requests.length - 1; index >= 0; index -= 1) {
      const request = state.requests[index];
      if (Math.abs(request.createdAt - encryptedAt) > 60_000) continue;
      let searchable = `${request.url}\n${request.body}`;
      try { searchable += `\n${decodeURIComponent(searchable.replace(/\+/g, "%20"))}`; } catch {}
      if (values.some((value) => searchable.includes(value)) || encodedValues.some((value) => searchable.includes(value))) return request;
    }
    return null;
  };

  const printEncryption = (source, decoded, encryptedDisplay, encryptedValues) => {
    const id = ++state.sequence;
    const encryptedAt = Date.now();
    const addressLookup = {};
    Object.defineProperty(addressLookup, "查询接口地址", {
      enumerable: true,
      get() {
        const request = findRequest(encryptedValues, encryptedAt);
        if (!request) return "暂未匹配到接口，请在请求发出后再次点击该 getter";
        console.groupCollapsed("%c匹配到接口", "color:#004d40;font-weight:600", request.url);
        console.log("接口地址", request.url);
        console.log("请求方法", request.method);
        console.log("请求参数", request.body || "（无请求体）");
        console.log("加密前明文", decoded);
        console.groupEnd();
        return request.url;
      }
    });
    console.groupCollapsed(`%c[decrypted #${id}] ${source}`, "color:#fff;background:#1565c0;padding:3px 8px;font-weight:600");
    console.log("加密前明文", decoded);
    console.log("encrypt 返回数据", encryptedDisplay);
    console.log("地址", addressLookup);
    console.groupEnd();
  };

  const getCryptoJsEncryptedValues = (result) => {
    const values = [];
    const add = (value) => {
      if (value != null) {
        const text = String(value);
        if (text && !values.includes(text)) values.push(text);
      }
    };
    try { add(result?.toString()); } catch {}
    try { add(result?.ciphertext?.toString()); } catch {}
    try {
      const ciphertextBytes = wordArrayToBytes(result?.ciphertext);
      if (ciphertextBytes) add(bytesToBase64(ciphertextBytes));
    } catch {}
    return values;
  };

  const removeAesTrap = () => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "AES");
    if (
      descriptor?.get === state.aesTrapGetter &&
      descriptor?.set === state.aesTrapSetter
    ) {
      delete Object.prototype.AES;
    }
  };

  const hookCryptoJsAes = (aes, source = "CryptoJS.AES.encrypt") => {
    if (!aes || (typeof aes !== "object" && typeof aes !== "function") || state.hookedCryptoJsObjects.has(aes)) return false;
    if (typeof aes.encrypt !== "function" || typeof aes.decrypt !== "function") return false;
    const originalEncrypt = aes.encrypt;
    const wrapper = function hookedCryptoJsAesEncrypt(message) {
      const decoded = decodeReadableText(message);
      const result = originalEncrypt.apply(this, arguments);
      if (decoded !== null) {
        const encryptedValues = getCryptoJsEncryptedValues(result);
        printEncryption(source, decoded, encryptedValues[0] || result, encryptedValues);
      }
      return result;
    };
    try {
      aes.encrypt = wrapper;
      if (aes.encrypt !== wrapper) return false;
    } catch {
      return false;
    }
    state.hookedCryptoJsObjects.add(aes);
    state.cryptoJsHooks.push({ target: aes, originalEncrypt, wrapper });
    state.cryptoJsHookFound = true;
    if (state.cryptoJsScanTimer) {
      window.clearInterval(state.cryptoJsScanTimer);
      state.cryptoJsScanTimer = null;
    }
    // The inherited setter is only needed to discover a closure-local alias.
    // Remove it as soon as a compatible AES helper has been found.
    removeAesTrap();
    console.info(`[decrypted] ${source} hook installed`);
    return true;
  };

  const inspectCryptoJsRoot = (root, name) => {
    if (!root || (typeof root !== "object" && typeof root !== "function")) return;
    try { hookCryptoJsAes(root.AES, `${name}.AES.encrypt`); } catch {}
    try { hookCryptoJsAes(root.default?.AES, `${name}.default.AES.encrypt`); } catch {}
  };

  state.scanCryptoJs = () => {
    inspectCryptoJsRoot(window.CryptoJS, "CryptoJS");
    for (const name of Object.getOwnPropertyNames(window)) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(window, name);
        if (descriptor && "value" in descriptor) inspectCryptoJsRoot(descriptor.value, name);
      } catch {}
    }
  };

  // CryptoJS normally assigns `C.AES = ...`. This inherited setter observes
  // the assignment even when `C` is a minified local variable such as `u` or `c`.
  if (!state.originalAesDescriptor) {
    state.aesTrapGetter = function aesTrapGetter() { return undefined; };
    state.aesTrapSetter = function aesTrapSetter(value) {
      Object.defineProperty(this, "AES", { value, writable: true, enumerable: true, configurable: true });
      hookCryptoJsAes(value, "CryptoJS.AES.encrypt");
    };
    try {
      Object.defineProperty(Object.prototype, "AES", {
        get: state.aesTrapGetter,
        set: state.aesTrapSetter,
        enumerable: false,
        configurable: true
      });
    } catch {}
  }

  if (typeof state.originalFetch === "function") {
    window.fetch = function hookedFetch(input, init) {
      const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
      const method = init?.method || input?.method || "GET";
      if (init && Object.prototype.hasOwnProperty.call(init, "body")) rememberRequest(url, method, init.body);
      else if (typeof Request !== "undefined" && input instanceof Request) {
        const request = rememberRequest(url, method, "");
        try { input.clone().text().then((body) => { request.body = body; }).catch(() => {}); } catch {}
      } else rememberRequest(url, method, "");
      return state.originalFetch.apply(this, arguments);
    };
  }

  if (state.xhrPrototype && state.originalXhrOpen && state.originalXhrSend) {
    state.xhrPrototype.open = function hookedXhrOpen(method, url) {
      state.xhrMetadata.set(this, { method, url });
      return state.originalXhrOpen.apply(this, arguments);
    };
    state.xhrPrototype.send = function hookedXhrSend(body) {
      const metadata = state.xhrMetadata.get(this) || {};
      rememberRequest(metadata.url, metadata.method, body);
      return state.originalXhrSend.apply(this, arguments);
    };
  }

  if (subtle && state.originalEncrypt) {
    subtle.encrypt = function hookedSubtleEncrypt(algorithm, key, data) {
      const decoded = decodeReadableText(data);
      const result = state.originalEncrypt(algorithm, key, data);
      if (decoded !== null) {
        Promise.resolve(result).then((encryptedData) => {
          const encryptedBase64 = bytesToBase64(encryptedData);
          printEncryption("window.crypto.subtle.encrypt", decoded, encryptedBase64, [encryptedBase64]);
        }, () => {});
      }
      return result;
    };
  }

  window.__subtleEncryptHookState = state;
  window.__subtleEncryptHookInstalled = true;
  if (earlyCryptoJsState) {
    earlyCryptoJsState.onCandidate = (candidate) => {
      hookCryptoJsAes(
        candidate.value,
        `CryptoJS.AES.encrypt (${candidate.discovery || "early discovery"})`
      );
    };
  }
  for (const candidate of earlyCryptoJsCandidates) {
    hookCryptoJsAes(candidate.value || candidate, `CryptoJS.AES.encrypt (${candidate.discovery || "early discovery"})`);
  }
  if (earlyCryptoJsCandidates.length > 0) {
    earlyCryptoJsState?.restore?.();
    delete window.__decryptedEarlyCryptoJsState;
  }
  state.scanCryptoJs();
  if (!state.cryptoJsHookFound) {
    state.cryptoJsScanTimer = window.setInterval(state.scanCryptoJs, 1000);
  }
  console.info("[decrypted] encrypt hooks installed; waiting for CryptoJS AES if it is loaded later");
})();
