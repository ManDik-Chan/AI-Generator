# 站点字体（本地托管）

构建时不再从 Google Fonts 下载字体。此前 `next/font/google` 在 CI 和本地构建中都偶发失败（`Cannot read properties of null (reading '1')`），本目录用于消除这个不确定因素。

| 文件 | 字体 | 加载方式 |
|---|---|---|
| `figtree-latin.woff2` | Figtree 可变字体（拉丁子集），覆盖 400–600 | `app/layout.tsx` 中的 `next/font/local`：预加载，并自动生成防止布局跳动的后备字体度量 |
| `noto-sans-sc/noto-sans-sc-000…100.woff2` | Noto Sans SC 2.004 可变字体，Google Fonts 的 101 个 `unicode-range` 分片 | `noto-sans-sc.css`：浏览器只下载页面实际用到的分片，不预加载 |

- **来源**：2026-10-30 一次成功的 `next build` 中，`next/font/google` 下载的文件与生成的 `@font-face` 声明。字节与此前线上一致，`@font-face` 声明逐字保留，只改了文件路径。
- **许可**：两款字体均为 SIL Open Font License 1.1，见 `OFL.txt`。字体文件的 name 表中也保留了版权与许可信息。
- **更新**：通常不需要更新。如需升级字体版本，临时恢复 `next/font/google` 构建一次，从 `.next/static/media` 与生成的 CSS 中重新取出文件和声明，替换后再改回本地加载。
