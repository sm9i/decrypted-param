const autoHookCheckbox = document.querySelector("#auto-hook");
const statusElement = document.querySelector("#status");
const autoHookStorageKey = "decrypted.autoHookEnabled";

function isAutoHookEnabled() {
  try {
    return localStorage.getItem(autoHookStorageKey) === "true";
  } catch {
    return false;
  }
}

function setAutoHookEnabled(enabled) {
  try {
    localStorage.setItem(autoHookStorageKey, String(enabled));
  } catch {
    // The panel can still operate for this session if storage is unavailable.
  }
  chrome.storage?.local?.set({ autoHookEnabled: enabled });
}

const installHookCode = () => {
  const subtle = window.crypto?.subtle;
  if (!subtle || typeof subtle.encrypt !== "function") {
    console.error("[decrypted] window.crypto.subtle.encrypt is unavailable");
    return;
  }

  const hookVersion = 5;
  const previousState = window.__subtleEncryptHookState;
  if (previousState?.version === hookVersion) {
    console.info("[decrypted] crypto.subtle.encrypt hook is already installed");
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
  const hookState = {
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
    const chunkSize = 0x8000;
    let binary = "";

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(index, index + chunkSize)
      );
    }

    return window.btoa(binary);
  };

  const decodeReadableText = (data) => {
    if (
      !Array.isArray(data) &&
      !(data instanceof ArrayBuffer) &&
      !ArrayBuffer.isView(data)
    ) {
      return null;
    }

    try {
      let bytes = data;
      if (Array.isArray(data)) {
        bytes = new Uint8Array(data);
      } else if (ArrayBuffer.isView(data)) {
        bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      }

      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const containsUnreadableCharacters =
        decoded.includes("\uFFFD") ||
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(decoded);

      if (!decoded.trim() || containsUnreadableCharacters) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  };

  const bodyToSearchText = (body) => {
    if (body == null) {
      return "";
    }
    if (typeof body === "string") {
      return body;
    }
    if (body instanceof URLSearchParams) {
      return body.toString();
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      return Array.from(body.entries())
        .map(([name, value]) =>
          typeof value === "string" ? `${name}=${value}` : `${name}=[File]`
        )
        .join("&");
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      try {
        const bytes = body instanceof ArrayBuffer
          ? new Uint8Array(body)
          : new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
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
      body: bodyToSearchText(body),
      createdAt: Date.now()
    };
    hookState.requests.push(request);

    if (hookState.requests.length > 200) {
      hookState.requests.splice(0, hookState.requests.length - 200);
    }

    return request;
  };

  const addDecodedVariant = (value) => {
    let searchable = String(value || "");
    try {
      searchable += `\n${decodeURIComponent(searchable.replace(/\+/g, "%20"))}`;
    } catch {
      // The body may contain non-URI percent characters.
    }
    return searchable;
  };

  const findRequest = (encryptedBase64, encryptedAt) => {
    const encodedBase64 = encodeURIComponent(encryptedBase64);
    for (let index = hookState.requests.length - 1; index >= 0; index -= 1) {
      const request = hookState.requests[index];
      // A generous window prevents an old identical encrypted value from being
      // matched while still allowing a request queued after encryption.
      if (Math.abs(request.createdAt - encryptedAt) > 60_000) {
        continue;
      }

      const searchable = addDecodedVariant(`${request.url}\n${request.body}`);
      if (
        searchable.includes(encryptedBase64) ||
        searchable.includes(encodedBase64)
      ) {
        return request;
      }
    }
    return null;
  };

  const printEncryption = (id, decoded, encryptedData) => {
    const encryptedBase64 = bytesToBase64(encryptedData);
    const encryptedAt = Date.now();
    const titleStyle =
      "background:#1565c0;color:#fff;padding:3px 8px;border-radius:4px;font-weight:600";
    const decodedStyle =
      "background:#e8f5e9;color:#1b5e20;padding:2px 6px;border-radius:3px;font-weight:600";
    const encryptedStyle =
      "background:#fff3e0;color:#e65100;padding:2px 6px;border-radius:3px;font-weight:600";
    const addressStyle =
      "background:#ede7f6;color:#4527a0;padding:2px 6px;border-radius:3px;font-weight:600";
    const successStyle =
      "background:#e0f2f1;color:#004d40;padding:2px 6px;border-radius:3px;font-weight:600";
    const warningStyle =
      "background:#ffebee;color:#b71c1c;padding:2px 6px;border-radius:3px;font-weight:600";

    const addressLookup = {};
    Object.defineProperty(addressLookup, "查询接口地址", {
      enumerable: true,
      configurable: false,
      get() {
        const request = findRequest(encryptedBase64, encryptedAt);
        if (!request) {
          const message = "暂未匹配到接口，请在请求发出后再次点击该 getter";
          console.warn("%c接口匹配", warningStyle, message);
          return message;
        }

        console.groupCollapsed("%c匹配到接口", successStyle, request.url);
        console.log("%c接口地址", addressStyle, request.url);
        console.log("%c请求方法", addressStyle, request.method);
        console.log("%c请求参数", encryptedStyle, request.body || "（无请求体）");
        console.log("%cdecode 数据", decodedStyle, decoded);
        console.groupEnd();
        return request.url;
      }
    });

    console.groupCollapsed(
      `%c[decrypted #${id}] window.crypto.subtle.encrypt`,
      titleStyle
    );
    console.log("%cdecode 数据", decodedStyle, decoded);
    console.log("%cencrypt 返回数据（Base64）", encryptedStyle, encryptedBase64);
    console.log("%c地址", addressStyle, addressLookup);
    console.groupEnd();
  };

  if (typeof hookState.originalFetch === "function") {
    window.fetch = function hookedFetch(input, init) {
      const url = typeof input === "string" || input instanceof URL
        ? String(input)
        : input?.url;
      const method = init?.method || input?.method || "GET";

      if (init && Object.prototype.hasOwnProperty.call(init, "body")) {
        rememberRequest(url, method, init.body);
      } else if (typeof Request !== "undefined" && input instanceof Request) {
        const request = rememberRequest(url, method, "");
        try {
          input.clone().text().then((body) => {
            request.body = body;
          }).catch(() => {});
        } catch {
          // A consumed Request cannot be cloned; the original fetch still runs.
        }
      } else {
        rememberRequest(url, method, "");
      }

      return hookState.originalFetch.apply(this, arguments);
    };
  }

  if (
    hookState.xhrPrototype &&
    hookState.originalXhrOpen &&
    hookState.originalXhrSend
  ) {
    hookState.xhrPrototype.open = function hookedXhrOpen(method, url) {
      hookState.xhrMetadata.set(this, { method, url });
      return hookState.originalXhrOpen.apply(this, arguments);
    };

    hookState.xhrPrototype.send = function hookedXhrSend(body) {
      const metadata = hookState.xhrMetadata.get(this) || {};
      rememberRequest(metadata.url, metadata.method, body);
      return hookState.originalXhrSend.apply(this, arguments);
    };
  }

  subtle.encrypt = function hookedEncrypt(algorithm, key, data) {
    const decoded = decodeReadableText(data);
    const result = originalEncrypt(algorithm, key, data);

    if (decoded !== null) {
      const id = ++hookState.sequence;
      Promise.resolve(result).then(
        (encryptedData) => printEncryption(id, decoded, encryptedData),
        () => {}
      );
    }

    return result;
  };

  window.__subtleEncryptHookState = hookState;
  window.__subtleEncryptHookInstalled = true;
  console.info("[decrypted] crypto.subtle.encrypt hook installed");
};

const uninstallHookCode = () => {
  const state = window.__subtleEncryptHookState;
  if (!state) {
    console.info("[decrypted] crypto.subtle.encrypt hook is not installed");
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
  console.info("[decrypted] crypto.subtle.encrypt hook uninstalled");
};

function evaluateInInspectedPage(code) {
  if (!chrome.devtools?.inspectedWindow) {
    console.error("当前页面不支持 DevTools inspectedWindow API");
    return false;
  }

  chrome.devtools.inspectedWindow.eval(
    `(${code.toString()})()`,
    (_result, exceptionInfo) => {
      if (exceptionInfo?.isException) {
        console.error(exceptionInfo.description || "页面执行 Hook 失败");
        statusElement.textContent = "注入失败";
        return;
      }
      statusElement.textContent = code === installHookCode ? "已注入" : "已清除";
    }
  );
  return true;
}

function syncHookWithSetting() {
  if (isAutoHookEnabled()) {
    evaluateInInspectedPage(installHookCode);
  } else {
    evaluateInInspectedPage(uninstallHookCode);
  }
}

autoHookCheckbox.checked = isAutoHookEnabled();
// Keep the new extension storage value in sync with settings from older builds.
setAutoHookEnabled(autoHookCheckbox.checked);
autoHookCheckbox.addEventListener("change", () => {
  const enabled = autoHookCheckbox.checked;
  setAutoHookEnabled(enabled);
  syncHookWithSetting();
});

// The panel may be opened after the page has already loaded. Inject immediately
// in that case, and inject again after every navigation while enabled.
syncHookWithSetting();
if (chrome.devtools?.network?.onNavigated) {
  chrome.devtools.network.onNavigated.addListener(() => {
    if (isAutoHookEnabled()) {
      syncHookWithSetting();
    }
  });
}
