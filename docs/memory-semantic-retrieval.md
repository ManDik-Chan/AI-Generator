# Phase 5A3-2 混合语义记忆召回

## 为什么使用混合召回

关键词和 topic 对明确的“CPU”“电脑配置”具有高可信度、低成本和稳定可解释性，但无法覆盖“中央处理器”“那台机器的芯片”等不同表达。纯向量召回又可能把高相似噪声排到直接词项之前。因此系统先保留确定性排名，再按需查询语义候选，并以加权 Reciprocal Rank Fusion（RRF，k=60；deterministic=1.0、semantic=0.9）合并。直接词项、置顶、importance、Persona 与稳定类别保留轻量加权。

融合后统一执行 enabled、当前用户、GLOBAL/当前 Persona、topicKey 或规范化 content 去重、最多 8 条与最多 2400 字符。Memory 始终整条取舍；similarity 不进入 Prompt，也不返回浏览器。

## Provider 与配置

Provider 使用通用 OpenAI-compatible `POST <baseUrl>/embeddings`，不在业务层写死供应商：

```env
AI_EMBEDDING_BASE_URL=
AI_EMBEDDING_API_KEY=
AI_EMBEDDING_MODEL=embedding-3
AI_EMBEDDING_DIMENSIONS=512
AI_EMBEDDING_TIMEOUT_MS=15000

MEMORY_SEMANTIC_MODE=adaptive
MEMORY_SEMANTIC_THRESHOLD=0.55
MEMORY_SEMANTIC_MAX_CANDIDATES=20
```

Embedding Base URL / Key 为空时回退文本 Provider 的 `AI_BASE_URL` / `AI_API_KEY`。模型默认 `embedding-3`，维度固定且严格验证为 512。字符串与最多 32 条字符串批次均支持；响应必须包含完整、唯一 index 和 512 个有限数。无配置时构建、聊天与关键词召回正常。

## pgvector 与数据边界

Migration `20260713150000_add_memory_embeddings` 启用 `vector` extension 并创建独立 `memory_embeddings`：Memory 一对一主键、userId、model、dimensions、contentHash、`extensions.vector(512)` 和时间。Memory/Profile 删除都 Cascade。RLS 限制当前 `auth.uid()`，写入还必须引用同一用户 Memory；服务端查询仍显式传入 userId。

每用户上限 300 条，当前使用 userId/model/dimensions 普通索引和精确余弦扫描，不创建 HNSW/IVFFlat。SQL 参数化，只返回 Memory 业务字段与服务端 similarity，不读取或返回原始向量。

## Embedding 生命周期与 contentHash

输入顺序固定为 category、topicKey 可读片段、content、去重 keywords。topic 的点、下划线、短横线转为空格。ID、userId、personaId、来源、pinned、useCount、lastUsedAt 和时间不进入输入。SHA-256 `contentHash` 与 model/dimensions 一起判断索引是否有效。

自动 CREATE/UPDATE 完成 Memory 事务后，在现有后台任务中生成或更新向量；失败不回滚 Memory。手动创建、编辑和重新启用使用 Next.js `after` 安排后台同步。hash 未变化跳过 Provider；置顶、使用统计、最近使用或停用不会重建。删除由外键 Cascade 清除向量。

## adaptive 模式与查询

- `off`：不调用 Embedding，只运行确定性召回。
- `always`：存在 Memory 候选时每轮最多生成一次 query embedding，主要用于测试。
- `adaptive`：必须存在当前作用域有效向量；确定性结果少于 2 条、最高结果无当前直接/关键词匹配、概览意图，或“你还记得 / 关于我 / 之前我说过 / 我的…是什么”等意图时调用。问候、感谢、继续等跳过。

语义 SQL 过滤当前 userId、enabled、GLOBAL/当前 Persona、model、512 维、threshold，默认最多 20、最大 50，并按 similarity、pinned、importance、updatedAt、id 稳定排序。每轮只生成一次 query embedding，不计入聊天消息次数。

## 回填

```bash
pnpm memory:embed:backfill -- --all --dry-run
pnpm memory:embed:backfill -- --all --batch-size=16
pnpm memory:embed:backfill -- --user=<uuid> --limit=300
```

必须显式选择全部或单个用户。默认批次 16、最大 32；仅处理 enabled 且缺失、hash 过期、模型或维度不匹配的记录。有效向量跳过，可安全中断续跑。单批失败不删除 Memory，限流时停止。日志只含 scanned/skipped/generated/failed。

## 安全降级与隐私

配置缺失、401/403、404、429、timeout、响应/维度错误、pgvector 或 extension 失败均回退确定性召回；不产生通用 500、不重试文本模型、不刷新页面、不影响自动记忆。日志只记录 request/user/conversation、stage、errorCode、候选数量和耗时，不含问题正文、Memory、Prompt、Key、Cookie 或向量。

启用时，Memory 整理文本和当前问题可能发送到配置的 Embedding Provider。向量只保存在当前项目数据库，不返回浏览器、不与其他用户共享。总开关关闭时不召回、不生成查询向量、不自动提取。用户仍可查看、编辑、停用和删除原 Memory。

本阶段只处理长期 Memory，不实现文件/网页 RAG、Message 向量化、外部知识库、自动删除或历史重复自动合并。Phase 6 未开始。

## 真实验收状态

项目所有者已于 2026-07-13 完成真实本地验收：

- Supabase migration `20260713150000_add_memory_embeddings` 与 vector extension：通过。
- `memory_embeddings` 表、Embedding-3 固定 512 维：通过。
- 现有 Memory 回填：scanned 1、generated 1、failed 0，通过。
- 不同表达语义召回：通过；“中央处理单元”召回 CPU，“设备核心硬件”召回完整配置，“负责图形运算的部件”召回显卡。
- 确定性关键词、`topicKey` / `keywords` 与 Hybrid RRF 混合排序：通过，无退化。
- 自动 CREATE、同主题 UPDATE、Memory 内容变化后的 contentHash 与向量重建：通过。
- 用户和 Persona 隔离、Memory 删除 Cascade、配置错误安全降级：通过。
- 390px、430px、1440px 管理页面：通过。
- 聊天流式输出、History API 浅更新、无整页刷新和无全屏 loading：通过。
- 未提交 `.env`、API Key、Service Role Key、数据库密码、向量或用户隐私数据。

Phase 5A3-2 已完成。这仍不是文件或网页 RAG，没有 Message 全文向量化、自动删除或自动批量合并；Phase 6 未开始。
