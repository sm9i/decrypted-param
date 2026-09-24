const hookScriptUrl = chrome.runtime.getURL("page-hook.js");
const unhookScriptUrl = chrome.runtime.getURL("page-unhook.js");

function runPageScript(url) {
  const script = document.createElement("script");
  script.src = url;
  script.async = false;
  script.dataset.decryptedHook = "true";
  script.onload = () => script.remove();
  script.onerror = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function syncPageHook(enabled) {
  runPageScript(enabled ? hookScriptUrl : unhookScriptUrl);
}

chrome.storage.local.get({ autoHookEnabled: false }, ({ autoHookEnabled }) => {
  syncPageHook(Boolean(autoHookEnabled));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.autoHookEnabled) {
    return;
  }
  syncPageHook(Boolean(changes.autoHookEnabled.newValue));
});
