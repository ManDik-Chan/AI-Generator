# 离线复现

在独立Python工具环境使用 jsonschema==4.26.0、openapi-spec-validator==0.9.0（传递依赖版本见evidence/validation.json）。本机复用P0独立validation-libs，不修改应用package/lockfile、不安装应用依赖。

```powershell
$env:PYTHONPATH='D:\AIGC\platform-p0-audit-20261028\validation-libs'
& 'C:\Users\ManDik\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' docs/platform/p05/validation/generate_contracts.py
& 'C:\Users\ManDik\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' docs/platform/p05/validation/validate.py --repo D:/AIGC/platform-p05-20261028
```

其他机器用隔离Python环境；`--p0-root`、`--repo`、`--base`、`--report`均可显式传参，工具没有硬编码BASE_REPO。P0归档校验器保留原样，但新入口仅执行其42例之前的只读prefix，不运行其重写fixtures/证据或源码核对后缀。不改/删/放宽原42断言。

原42例实际覆盖：Manifest 18例（3接受+15拒绝）、Presentation 9例（3+6）、Run 9例（3+6）、Finalize3、Credential1、Callback2；合计42。它们只验证JSON结构、字段、枚举、条件required和format，甚至包含P1禁用的未来Remote/Embed/BYOK结构；保留这些通过仅用于历史回归，不授权其进入P1。

新增用例检查当前P1结构、参考发布语义、不可变投影/读取条件、状态转换、OpenAPI嵌入一致性、文档链接和源码变更边界。reference_rules.py是独立可执行规范样例，不被业务应用导入，不验证真实事务、身份、RLS、Storage、XSS sanitizer、CDN或JCS；这些仍须P1实现测试。

脚本只向指定report及本P0.5合成fixture写输出，不读.env、不连接网络/DB、不启动浏览器、Provider或模型。验证后还需比较生成前后文件哈希，避免生成漂移。原始输入与P0归档的哈希在baseline.json保存。
