# decrypted Chrome extension

打开 DevTools 的 `decrypted` 面板后，使用“自动注入 Hook”开关控制注入状态：

- 开启后设置会持久化，即使不打开 DevTools 也会在页面加载时自动注入，并在页面导航/刷新后自动重新注入。
- 关闭后会清除当前页面的 Hook，之后不会自动注入。
