# Agent 开发规范

## 项目结构
- `src/main.py` - 主入口文件，FastAPI 应用定义
- `src/agents/` - Agent 逻辑模块
- `src/tools/` - 工具函数模块
- `tests/` - 测试文件

## 开发要求
1. 所有 API 端点必须包含健康检查 `/health`
2. 使用 FastAPI 标准模式定义路由
3. 环境变量通过 `.env` 文件管理
4. 错误处理使用标准 HTTP 状态码

## 部署规范
1. 容器必须暴露健康检查端点
2. 端口通过 `AGENT_PORT` 环境变量配置
3. 日志输出到 stdout/stderr

## 代码风格
- Python 3.11+
- Type hints 必须添加
- 遵循 PEP 8 规范
