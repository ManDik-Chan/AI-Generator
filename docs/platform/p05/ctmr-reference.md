# CTMR 作为表达能力参考

固定来源为归档 P0 `09-ctmr-reference-adapter.md` 与 capability evidence；CTMR commit `ddb510499a690c286ca607dc876d757c62662813`，tree `15213cbf95e62d9c37840d4fd2378798df6ec41d`。原路线图将commit误标tree的错误沿用P0纠正。本轮未重新拉取CTMR、加载模型、执行实验或复制私有素材。

| 所需表示 | 通用契约 | CTMR证据边界 |
|---|---|---|
| 自研模型/架构 | researchClaims topic + description + modelVersion + evidenceAssetIds；Architecture文档 | P0读取到Mamba/LightMUNet代码，不能证明训练权重和效果；真实推理路径与画圆模拟路径分开描述 |
| 研究/实验文档 | ProjectDocumentation固定Version内资产与contentHash；来源审核 | 上游论文/README是声明，非本项目实验；私有文档未经作者批准不公开 |
| 模型版本/指标 | Claim四种status，REPORTED指标绑定modelVersion/dataset/protocol/unit/evidence | LFS指针不是已取得权重，dataset/plans缺失、检测权重未提供；Dice/mAP/延迟/显存未验证则UNPUBLISHED，不填0 |
| 三维/静态产物 | 通用Claim记录mesh产物计划，文档描述坐标/单位/格式；IMAGE资产呈现批准预览 | 现有四个PLY来源/权利未知，不视为合成；P1不实现mesh viewer/医学栈，格式扩充以后单独评审 |
| 未来异步接口 | PLANNED声明与未来Compute/Job分层，版本绑定operation/schema摘要 | 未发现已验证HTTP API；不生成调用按钮；Qt/QThread不等于可恢复服务 |

`contracts/research.fixture.json` 是人为编造的通用结构样例，不是CTMR公开内容或实验结果。`SOURCE_IMPLEMENTED`/`EXPERIMENT_VERIFIED`缺证据资产时离线规则拒绝；有引用也只是结构/语义前置，审核人仍需读真实证据与重现实验。模型包、许可、无UI入口、合成几何、axis/affine/spacing、可信权重加载与运行隔离全部留后续门禁。

非AI排序研究fixture不带Provider/Key/GPU仍能表达Overview、Docs和未发布指标，验证核心不是给CTMR定制GUI。Core没有CTMR字段、通道、标签、患者或模型专名枚举。未来CTMR输入语义、网络层/labelmap和重建实现保留在独立项目自己的文档/Adapter schema。

表达能力通过不等于素材获准公开；本轮没有任何真实CTMR内容发布授权，实际内容导入仍阻断。P1可先用非AI合成测试项目开发。
