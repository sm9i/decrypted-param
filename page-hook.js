(() => {
  const subtle = window.crypto?.subtle;
  const hookVersion = 5;
  if (!subtle || typeof subtle.encrypt !== "function") {
    return;
  }

  const previousState = window.__subtleEncryptHookState;
  if (previousState?.version === hookVersion) {
    return;
  }
  if (previousState?.originalEncrypt) {
    subtle.encrypt = previousState.originalEncrypt;
  }
  if (previousState?.originalFetch) {
    window.fetch = previousState.originalFetch;
  }
  if (previousState?.xhrPrototype && previousState.originalXhrOpen) {
    previousState.xhrPrototype.open = previousState.originalXhrOpen;
  }
  if (previousState?.xhrPrototype && previousState.originalXhrSend) {
    previousState.xhrPrototype.send = previousState.originalXhrSend;
  }

  const originalEncrypt = subtle.encrypt.bind(subtle);
  const state = {
    version: hookVersion,
    originalEncrypt,
    originalFetch: window.fetch,
    xhrPrototype: window.XMLHttpRequest?.prototype || null,
    originalXhrOpen: window.XMLHttpRequest?.prototype.open || null,
    originalXhrSend: window.XMLHttpRequest?.prototype.send || null,
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

  const decodeReadableText = (data) => {
    if (!Array.isArray(data) && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      return null;
    }
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
    const request = { url: String(url || location.href), method: String(method || "GET").toUpperCase(), body: bodyToText(body), createdAt: Date.now() };
    state.requests.push(request);
    if (state.requests.length > 200) state.requests.splice(0, state.requests.length - 200);
    return request;
  };

  const findRequest = (encryptedBase64, encryptedAt) => {
    const encoded = encodeURIComponent(encryptedBase64);
    for (let index = state.requests.length - 1; index >= 0; index -= 1) {
      const request = state.requests[index];
      if (Math.abs(request.createdAt - encryptedAt) > 60000) continue;
      let searchable = `${request.url}\n${request.body}`;
      try { searchable += `\n${decodeURIComponent(searchable.replace(/\+/g, "%20"))}`; } catch {}
      if (searchable.includes(encryptedBase64) || searchable.includes(encoded)) return request;
    }
    return null;
  };

  const printEncryption = (id, decoded, encryptedData) => {
    const encryptedBase64 = bytesToBase64(encryptedData);
    const encryptedAt = Date.now();
    const addressLookup = {};
    Object.defineProperty(addressLookup, "查询接口地址", {
      enumerable: true,
      get() {
        const request = findRequest(encryptedBase64, encryptedAt);
        if (!request) return "暂未匹配到接口，请在请求发出后再次点击该 getter";
        console.groupCollapsed("%c匹配到接口", "color:#004d40;font-weight:600", request.url);
        console.log("接口地址", request.url);
        console.log("请求方法", request.method);
        console.log("请求参数", request.body || "（无请求体）");
        console.log("decode 数据", decoded);
        console.groupEnd();
        return request.url;
      }
    });
    console.groupCollapsed(`%c[decrypted #${id}] window.crypto.subtle.encrypt`, "color:#fff;background:#1565c0;padding:3px 8px;font-weight:600");
    console.log("decode 数据", decoded);
    console.log("encrypt 返回数据（Base64）", encryptedBase64);
    console.log("地址", addressLookup);
    console.groupEnd();
  };

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
  subtle.encrypt = function hookedEncrypt(algorithm, key, data) {
    const decoded = decodeReadableText(data);
    const result = originalEncrypt(algorithm, key, data);
    if (decoded !== null) {
      const id = ++state.sequence;
      Promise.resolve(result).then((encryptedData) => printEncryption(id, decoded, encryptedData), () => {});
    }
    return result;
  };
  window.__subtleEncryptHookState = state;
  window.__subtleEncryptHookInstalled = true;
})();
