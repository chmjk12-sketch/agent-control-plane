# Agent 开发规范 (V3.0)

> 本规则由 Agent Control Plane 自动生成，所有 Agent 必须遵循。
> 控制平面地址: https://administrator.chmjk67.top

---

## 1. 技术栈（强制）

- **后端**: Python 3.11 + FastAPI + Pydantic v2 + Uvicorn
- **AI SDK**: OpenAI SDK（兼容 DeepSeek/Claude，统一接口）
- **HTTP 客户端**: `httpx`（异步，带超时和重试）
- **配置**: `pydantic-settings` + `.env` 文件
- **测试**: `pytest` + `pytest-asyncio` + `respx`（Mock HTTP）
- **日志**: 结构化 JSON 日志，输出到 stdout

---

## 2. 强制端点（必须实现）

每个 Agent 必须暴露以下端点，否则控制平面无法注册和监控：

| 端点 | 方法 | 返回格式 | 说明 |
|------|------|---------|------|
| `/health` | GET | `{"status": "ok"}` | 健康检查，Docker 依赖此端点 |
| `/metrics` | GET | Prometheus 格式 | 指标暴露，Prometheus 抓取 |
| `/api/v1/{action}` | POST | 标准响应格式 | 业务 API |

### 标准响应格式

```json
{
  "code": 0,
  "data": {},
  "message": "success"
}
```

错误响应：
```json
{
  "code": 400,
  "data": null,
  "message": "错误描述"
}
```

---

## 3. 控制平面集成（强制）

Agent 启动时必须向控制平面注册，每次请求后异步上报执行记录。

### 环境变量

```bash
CP_API_KEY=         # 控制平面 API Key
CP_BASE_URL=https://administrator.chmjk67.top  # 控制平面地址
AGENT_SLUG=         # Agent 唯一标识
```

### 启动注册

```python
@app.on_event("startup")
async def register_agent():
    """向控制平面注册"""
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{CP_BASE_URL}/api/agents/register",
            headers={"Authorization": f"Bearer {CP_API_KEY}"},
            json={"slug": AGENT_SLUG, "endpoint": f"http://{AGENT_SLUG}_app:80"}
        )
```

### 请求上报（异步，不阻塞响应）

```python
async def report_execution(request_data, response_data, cost, latency_ms):
    """异步上报执行记录"""
    asyncio.create_task(_do_report(request_data, response_data, cost, latency_ms))

async def _do_report(request_data, response_data, cost, latency_ms):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{CP_BASE_URL}/api/agent-executions",
                headers={"Authorization": f"Bearer {CP_API_KEY}"},
                json={"agentSlug": AGENT_SLUG, "cost": cost, "latencyMs": latency_ms}
            )
    except Exception:
        pass  # 上报失败不影响主流程
```

---

## 4. MCP 支持（可选但推荐）

如果 Agent 需要暴露工具供其他 Agent 调用：

1. 在 `agent.yaml` 中设置 `mcp.enabled: true`
2. 实现 `/mcp/tools` 端点返回工具列表
3. 实现工具执行端点

```python
@app.get("/mcp/tools")
def list_tools():
    return {
        "tools": [
            {
                "name": "query_data",
                "description": "查询数据",
                "inputSchema": {"type": "object", "properties": {"q": {"type": "string"}}}
            }
        ]
    }
```

---

## 5. 测试要求（强制）

- **100% Mock 外部调用**：所有 HTTP 请求必须使用 `respx` Mock
- **CI/CD 中不配置真实 API Key**：测试必须在没有真实密钥的情况下通过
- **强制测试文件**：
  - `tests/test_health.py` — 健康检查测试
  - `tests/test_api.py` — API 端点测试
  - `tests/test_mock.py` — Mock 外部调用测试

```python
# tests/test_api.py 示例
import respx
from httpx import Response

@respx.mock
def test_query_data():
    # Mock 外部 API
    respx.post("https://api.deepseek.com/v1/chat/completions").mock(
        return_value=Response(200, json={"choices": [{"message": {"content": "result"}}]})
    )
    response = client.post("/api/v1/analyze", json={"data": "test"})
    assert response.status_code == 200
    assert response.json()["code"] == 0
```

---

## 6. 代码规范

### 6.1 类型注解

所有函数参数和返回值必须添加类型注解：

```python
from pydantic import BaseModel

class AnalyzeRequest(BaseModel):
    data: str
    options: dict[str, Any] | None = None

async def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    ...
```

### 6.2 错误处理

使用自定义异常类，统一错误响应：

```python
class AgentError(Exception):
    def __init__(self, code: int, message: str):
        self.code = code
        self.message = message

@app.exception_handler(AgentError)
async def agent_error_handler(request, exc: AgentError):
    return JSONResponse(
        status_code=200,
        content={"code": exc.code, "data": null, "message": exc.message}
    )
```

### 6.3 日志规范

```python
import structlog

logger = structlog.get_logger()

# 正确
logger.info("request_processed", agent_slug=AGENT_SLUG, latency_ms=120)

# 错误（不要使用 print）
print(f"Processed in 120ms")  # ❌
```

---

## 7. Docker 规范

### Dockerfile 要求

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY src/ ./src/

# 暴露端口（内部端口必须是 80）
EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:80/health')"

# 启动命令
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "80"]
```

### 关键要求

1. **内部端口必须是 80**：Caddy 反向代理约定
2. **必须包含 HEALTHCHECK**：Docker 健康检查
3. **使用非 root 用户运行**（推荐）
4. **镜像标签使用 `latest` 和 Git SHA 双标签**

---

## 8. agent.yaml 规范

每个 Agent 项目根目录必须包含 `agent.yaml`：

```yaml
apiVersion: v1
kind: Agent
metadata:
  name: 我的Agent
  slug: my-agent
  description: "Agent功能描述"
  tags: ["分析", "AI"]
spec:
  runtime:
    type: docker
    port: 80
    resources:
      cpu: 0.5
      memory: 512M
  api:
    basePath: /api/v1
    healthCheck: /health
    endpoints:
      - path: /analyze
        method: POST
        description: 分析数据
  ai:
    model: deepseek-chat
    temperature: 0.7
    maxTokens: 4096
  deploy:
    strategy: blue-green
    replicas: 1
  cost:
    budget: 500
    alertThreshold: 80
  mcp:
    enabled: false
```

---

## 9. 禁止事项

1. **禁止硬编码密钥**：所有密钥通过环境变量注入
2. **禁止同步 HTTP 调用**：所有外部请求必须使用 `httpx.AsyncClient`
3. **禁止无限重试**：最多 3 次重试，带指数退避
4. **禁止阻塞主线程**：耗时操作必须异步或放入线程池
5. **禁止忽略异常**：所有异常必须记录日志，用户可见错误返回友好消息

---

## 10. 验证清单

部署前必须确认：

- [ ] `/health` 端点返回 `{"status": "ok"}`
- [ ] `/metrics` 端点返回 Prometheus 格式
- [ ] 所有测试通过（`pytest`）
- [ ] Docker 镜像可以正常构建和运行
- [ ] 环境变量已正确配置
- [ ] 控制平面可以正常注册和接收上报
