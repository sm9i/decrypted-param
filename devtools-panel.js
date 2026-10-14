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

const hookScriptUrl = chrome.runtime.getURL("page-hook.js");
const unhookScriptUrl = chrome.runtime.getURL("page-unhook.js");

function evaluateInInspectedPage(enabled) {
  if (!chrome.devtools?.inspectedWindow) {
    console.error("当前页面不支持 DevTools inspectedWindow API");
    return false;
  }

  const scriptUrl = enabled ? hookScriptUrl : unhookScriptUrl;
  const injectionCode = `(() => {
    const script = document.createElement("script");
    script.src = ${JSON.stringify(scriptUrl)};
    script.async = false;
    script.onload = () => script.remove();
    script.onerror = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  })()`;

  chrome.devtools.inspectedWindow.eval(
    injectionCode,
    (_result, exceptionInfo) => {
      if (exceptionInfo?.isException) {
        console.error(exceptionInfo.description || "页面执行 Hook 失败");
        statusElement.textContent = "注入失败";
        return;
      }
      statusElement.textContent = enabled ? "已注入" : "已清除";
    }
  );
  return true;
}

function syncHookWithSetting() {
  if (isAutoHookEnabled()) {
    evaluateInInspectedPage(true);
  } else {
    evaluateInInspectedPage(false);
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
