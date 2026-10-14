# decrypted Chrome extension

打开 DevTools 的 `decrypted` 面板后，使用“自动注入 Hook”开关控制注入状态：

- 开启后设置会持久化，即使不打开 DevTools 也会在页面加载时自动注入，并在页面导航/刷新后自动重新注入。
- 关闭后会清除当前页面的 Hook，之后不会自动注入。

Hook 会拦截 `crypto.subtle.encrypt` 和 CryptoJS 的 `AES.encrypt`，在 Console 中输出加密前明文、加密结果，并尝试关联随后通过 Fetch/XHR 发出的接口请求。

CryptoJS 对象会在页面主运行环境的 `document_start` 阶段发现，因此也支持打包后位于模块闭包中的 `u.AES.encrypt`、`c.AES.encrypt` 等局部混淆别名。扩展更新后需要重新加载扩展并刷新目标网页。
