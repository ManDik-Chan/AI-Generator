# AI-Generator V2

面向亲朋好友使用的私人 AI 助手平台。V2 使用 Next.js 15、TypeScript 与 Tailwind CSS 重构，目标是简单、稳定、美观和易维护。

## 本地开发

要求 Node.js 22 LTS 与 pnpm。

```bash
pnpm install
pnpm dev
```

访问 `http://localhost:3000`。环境变量参考 `.env.example`，真实密钥只写入 `.env.local`。

## 质量检查

```bash
pnpm lint
pnpm typecheck
pnpm build
```

架构、迁移、数据库与部署决策见 `docs/`。旧 Streamlit 原型保存在 `legacy/streamlit/`，仅供迁移参考。
