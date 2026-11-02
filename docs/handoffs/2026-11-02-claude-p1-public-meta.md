# 交接：P1-PUBLIC-META 公开站点元数据（Claude，2026-11-02）

> 分支 `claude/p1-public-meta-20261102`，基于 `main` `ac6f82b`（已含 #47、#48、#49）。独立 worktree：`D:/AIGC/claude-p1-public-meta-20261102`。依据 2026-10-30 第三方评审中的 UX-08（缺少分享预览与站点元数据）和 SEC-04（缺少 `security.txt`）；报告原件不在仓库内，结论以当前代码核查为准。
>
> 技术决定、平台兼容性、索引边界与待 Owner 决定事项见 [`docs/seo/p1-public-meta-20261102.md`](../seo/p1-public-meta-20261102.md)。本文只记录过程与证据。

## 1. 范围

- 已完成：OG / Twitter 分享卡（中英两张）、`robots.txt`、`sitemap.xml`、全站 canonical 与默认 OG、首页中英文 canonical / hreflang / `og:locale` 纠正、元数据始终输出到 `<head>`、404 页不再声明 canonical。
- 阻塞：`/.well-known/security.txt`。仓库没有 Owner 批准公开的安全联系渠道或披露政策，GitHub 私有漏洞报告未开启，因此未生成正式文件，HTTP 契约断言该路径保持 404。
- 未修改：Supabase Auth / Session、middleware、RLS、Registry、安全响应头与 CSP 策略、落地页组件 / CSS / 动效、依赖与 lockfile、GitHub Actions、Vercel 与生产配置。`next.config.ts` 只新增 `htmlLimitedBots`，`headers()` 未动。

## 2. 分享卡

| 中文 | English |
| --- | --- |
| ![中文分享卡](../../public/og/ai-generator-zh.jpg) | ![English share card](../../public/og/ai-generator-en.jpg) |

沿用登录页品牌面板（森林绿底、落地页 agents 程序化纹理、纸色字标、青柠色主标题），只使用落地页已有文案。字体由脚本从 `app/fonts` 的 WOFF2 解码，渲染子进程的 fontconfig 只能看到这些文件；已用仅含 Figtree 的配置验证中文会显示为缺字方框而不会回退到系统字体，确认输出不依赖本机字体。

## 3. 过程中发现并修正的问题

1. Next 15.5 在设置 `metadataBase` 时，会把路径为 `/` 的 URL 解析为裸域名并丢弃查询串，英文首页的 canonical 与 `hreflang="en"` 因此都变成了中文首页。改为首页 `metadataBase: null` 并传入绝对 URL；单元测试与 HTTP 契约都覆盖。
2. 首页的元数据（含 `<title>`）对浏览器、微信（`MicroMessenger`）和 Googlebot 被流式输出到 `<body>`；Next 内置名单中的 Facebook、X、Discord、Telegram、WhatsApp、Slack 抓取器才在 `<head>` 中。改为 `htmlLimitedBots: /.*/` 后，8 种 UA 均在 `<head>` 中。
3. 404 页继承了 `https://www.ai-mdc.com/_not-found` 作为 canonical；现已清除 canonical 与分享标签，保留 `noindex`。
4. 现有测试 `features/tools/brainstorm/contracts.test.ts` 以源码文本断言根布局的标题字面量；保留原字面量，未修改该测试。

## 4. 验证记录（本地，head 见 PR）

- `pnpm install --frozen-lockfile`、`pnpm typecheck`、`pnpm lint`（0 warning）、`pnpm test`（200 个文件、1,530 项通过，184 项为既有的数据库集成用例跳过）、`pnpm build`（Next 15.5.28，0 warning；`/robots.txt`、`/sitemap.xml` 为静态路由）。
- HTTP：`scripts/verify-public-meta.ts` 61 项通过；`scripts/verify-security-headers.ts` 17 项通过。均针对本地 `next start`（`127.0.0.1:3217`）。
- 未在本地运行 Playwright；新增的 `tests/e2e/mobile/public-meta.spec.ts` 只使用 HTTP 请求，由远端 CI 现有矩阵执行。

## 5. 资源与外部访问

- 浏览器：未启动、未连接任何浏览器，未截图或录屏（遵守 AGENTS.md）。分享卡与字体测试图通过直接读取生成的图片文件检查。
- 本地进程：三次以 `node node_modules/next/dist/bin/next start -p 3217 -H 127.0.0.1` 启动，每次结束后按记录的 PID（35340、11360、30804）停止，并确认进程已退出、端口不再监听、无本任务残留 Node 进程。
- 生产只读探测：对 `www.ai-mdc.com` 与 `ai-mdc.com` 发起少量 GET（含若干爬虫 UA），全部返回 429 `X-Vercel-Mitigated: challenge`；未尝试绕过。
- Vercel：仅检索公开文档；未读取或修改项目防火墙、环境变量或部署设置（连接缺少团队授权）。
- GitHub：只读查询仓库私有漏洞报告状态（`enabled: false`）。

## 6. 待 Owner 处理

见记录文档第 10 节：security.txt 联系渠道与披露政策、Security Checkpoint 对爬虫与预览抓取器的范围、示例项目与 `/platform` 是否索引、`/en` 路由与英文 `<html lang>`、AI 训练爬虫策略。上线后各平台实际预览需要 Owner 用各平台调试工具复核。
