# 静态资产安全闭环

P1 仅受控内部上传，不接受用户私有结果导入、远程 URL 抓取、zip、HTML、SVG、PDF、脚本、模型权重、医学文件或3D交互资源。首版支持净化后的 PNG/JPEG/WebP、UTF-8 text/markdown；研究3D可登记为未来产物声明，P1只发布获准栅格预览。格式扩充需要独立威胁评审。

## 上传到发布

1. 内部 EDITOR/OWNER 调有界字节流上传命令（2 MiB 原始及展示字节上限，单对象，无分块）。服务器生成 assetId/storage key，忽略客户端路径；先流式计数/超时/并发限制，再解码，不能先无界 multipart 缓冲。文件名仅审计展示，经清洗，永不构造路径。
2. 写隔离 bucket；仅校验服务可读；projectId 来源于授权过的路径。SHA256 检查实际字节，mime/magic/完整解码一致；图像≤4M像素、限制内存/时间；拒绝多格式/压缩炸弹/伪扩展。P1不接受压缩包，任何本地导入还须 realpath containment、禁符号链接/UNC/绝对路径/`..`及编码变体。
3. 图像重编码去 EXIF/ICC/注释等元数据，生成独立 deliveryDigest；文字严格 UTF-8，禁原始 HTML、图片远程引用、危险链接、嵌入代码执行。渲染层仍必须安全 AST allowlist + HTML sanitizer，不能把测试中保守拒绝器当生产 sanitizer。
4. 来源授权逐资产记录 provenance、权利人、rightsRef（内部证据ID）、授权范围/到期、reviewer、scanRevision、sourceDigest/deliveryDigest。标成 SYNTHETIC 不能自证授权；必须有制作与权利证据。P1公开 dataClass 仅 SYNTHETIC/PUBLIC_CURATED，不接受 PERSONAL/MEDICAL_SENSITIVE。
5. 独立审核者批准展示字节；同次 PublicationReview 固定全部 assetId+deliveryDigest+policyRevision+授权证据。APPROVED 不代表已公开；只有激活的 ReleaseAsset 映射可读取。

## 存储与读取

选择2MiB是保守产品限制：当前[Vercel Functions官方上限](https://vercel.com/docs/functions/limitations)为请求/响应4.5MB，不能沿用旧图片服务10MB能力声明。超限资源留后续受控直传方案，不在P1伪称支持。发布包JSON另限512KiB、嵌套深度16、section≤24；实际反序列化、解码器内存和并发配额须在P1测试，不由Schema单独保证。

源文件与隔离数据存 private quarantine/source bucket；经批准展示字节存独立 curated bucket，**该 bucket 的原始 origin 仍禁止公开读取**。独立资产域名仅按 releaseId+assetId 映射读取，禁止 query URL、自由 path、任意 bucket/key、旧 ToolAsset id、RunArtifact id。专用凭据仅可读 curated bucket；不得访问源 bucket 或业务私有存储。不能用给整 bucket public policy 代替发布授权。

每次 GET/HEAD/Range 都检查项目未归档、非 PRIVATE、Release=PUBLISHED、同项目映射、asset APPROVED/授权未过期/未下线、digest一致；未命中404。P1不支持 Range 返回416；HEAD使用同一授权；不返回签名源 URL，不做 redirect。返回白名单 content type、nosniff、独立 origin、CSP `default-src 'none'`、无凭据CORS精确允许站点，cookie不跨域；Markdown通过Docs renderer安全渲染，原文不当HTML。

P1 所有公共/私有 API、页面投影、OG、错误、资产均 `Cache-Control: no-store`，CDN绕过缓存，禁止 service worker/ISR/静态导出保存发布内容。Unlisted同时 `X-Robots-Tag: noindex,nofollow` 与 `Referrer-Policy: no-referrer`；Private不进入 metadata。应用内也不以 slug 永久 memoize。未来如启用 CDN，必须先完成可撤销授权、purge/负缓存/边缘故障的实测协议，不能继承 P1批准。

## 撤回与故障

撤回先事务关闭 Release/asset 映射，再删除展示对象；写删除清单和告警。资产紧急下线直接 RETIRED，所有引用 release 的读取立刻拒绝该资产；新页面应显式资源不可用，禁止源文件fallback。已发出的请求可能完成；对撤回后开始的请求必须拒绝，真实并发测试证明边界。已被访客下载/截图/第三方保存的公开字节不可追回，因此敏感材料不进入公开发布。

正常回滚只切当前指针并按命令指定撤回旧 release；安全撤回则停止全部被污染 release，不得只让目录消失。存储/数据库失败、复制失败、响应丢失、重复删除与并发撤回必须有真实故障注入后才能宣布闭环。无队列依赖的最小清理清单由受控维护命令重试，属于 P1实现；不能承诺自动恢复 SLA。

验收：A项目资产挂到B版本422；private source即使assetId泄漏仍404；公开页不得产生源bucket请求；撤回后新GET/HEAD及历史release均拒绝；原始CDN/origin不可绕过；无授权证据/过期/净化后hash变更不得发布。本轮仅离线参考规则，不证明上述存储行为已实现。
