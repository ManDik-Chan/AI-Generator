# 文档校验复现

本目录仅校验P0文档，不导入应用代码、不读环境密钥、不连接数据库，不运行私有模型。fixtures全部是结构样例，不是用户数据、项目或实验结果。

1. 在独立工具目录安装 `openapi-spec-validator==0.9.0`（其依赖含JSON Schema validator）；真实解析器版本见 `../evidence/contract-validation.json`。
2. 如需重新生成OpenAPI，运行 `node docs/platform/validation/generate_openapi.cjs`。
3. 从本审计源码目录运行 `python docs/platform/validation/validate_contracts.py`。本机独立库目录是 `D:\AIGC\platform-p0-audit-20261028\validation-libs`，已通过该工具目录的PYTHONPATH运行；未向应用增加依赖。

验证：两份2020-12 Schema metaschema、OpenAPI3.2.1完整规范验证、结构正反例、Markdown本地链接、原有Git blob一致性和新增文件边界。源码一致性步骤当前固定读取本机PR25 Git object库；在其他机器需提供同commit的只读object库并显式更新BASE_REPO路径。不能拿本轮PASS代替未来AuthZ/数据库/渲染/真实推理测试。

[OpenAPI validator官方用法](https://openapi-spec-validator.readthedocs.io/en/latest/)；[JSON Schema 2020-12验证词汇](https://json-schema.org/draft/2020-12/json-schema-validation)。
