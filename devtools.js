chrome.devtools.panels.create(
  "decrypted",
  "",
  "devtools-panel.html",
  () => {
    // The panel is intentionally small for now. The decryption workflow can
    // be added without changing the DevTools registration point.
  }
);
