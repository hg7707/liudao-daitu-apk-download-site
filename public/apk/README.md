# APK 放置目录

请将正式、已签名的 Android APK 放到本目录，并确保文件名与 `data/app-config.json` 的 `apkFileName` 完全一致。

示例：配置为 `"apkFileName": "app-latest.apk"` 时，正式文件应为：

```text
public/apk/app-latest.apk
```

本目录中的 APK 被 `.gitignore` 忽略，避免大文件和正式安装包被误提交。服务器只会通过 `/download` 流式提供配置指定的 APK；`/apk/...` 直接访问会被拒绝。
