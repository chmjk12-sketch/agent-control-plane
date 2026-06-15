# Agent Control Plane V3.0 架构设计文档

> 日期: 2026-06-15
> 版本: v3.0
> 状态: 设计中

---

## 一、现状分析

### 1.1 现有架构概览

当前系统（V2.0）是基于 Next.js 15 的 Agent 管理平台，部署在阿里云 ECS（2核2G）。

```
GitHub Push → GitHub Actions → Docker Build (ACR) → SSH 部署 ECS
                                    ↓
                         PostgreSQL + App + Caddy (Docker Compose)
```

### 1.2 现有功能清单

| 模块 | 功能 | 状态 |
|------|------|------|
| Agent 管理 | CRUD、版本管理、上架/下架 | ✅ |
| API 网关 | `/api/proxy/[slug]` 统一代理、Token 提取、预算检查 | ✅ |
| 蓝绿部署 | Caddy 动态路由切换、灰度权重调节 | ✅ |
| 健康检查 | 30s 轮询、5s 超时、自动告警 | ✅ |
| Token 监控 | 按模型计费、月度预算、超支拦截 | ✅ |
| CI/CD | GitHub Actions + SSH 直连部署 | ✅ |

### 1.3 现有技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端 | Next.js (App Router) | 15.5.19 |
| UI | React + Tailwind CSS v4 + Radix UI | 18.3.1 |
| 状态 | Zustand + TanStack Query | 5.0.14 / 5.101.0 |
| ORM | Prisma | 5.22.0 |
| 数据库 | PostgreSQL | 16 |
| 代理 | Caddy | 2 |
| 容器 | Docker + Docker Compose | - |
| CI/CD | GitHub Actions | - |

### 1.4 现有数据模型（10 张表）

- `User` - 用户
- `Agent` - Agent 核心配置（含 V2.0 新增字段）
- `AgentVersion` - 版本管理
- `Deployment` - 部署记录
- `AgentExecution` - 执行记录
- `AgentHealth` - 健康状态
- `HealthCheckLog` - 健康检查日志（V2.0）
- `Alert` - 告警中心（V2.0）
- `ApiKey` - API 密钥（V2.0）

### 1.5 已知问题

1. **ICP 备案未完成** - 域名 `chmjk67.top` 无法通过 80/443 访问，临时使用 IP
2. **Prisma OpenSSL 警告** - Docker build 阶段检测到版本不匹配（已修复）
3. **内存压力** - 2G 内存下运行多个容器容易触发 OOM
4. **缺少监控** - 无 Prometheus/Grafana，仅靠 API 接口暴露数据
5. **缺少日志聚合** - 仅容器 stdout，无 ELK/Loki
6. **单环境** - 无 dev/staging/prod 隔离

---

## 二、目标架构设计

### 2.1 设计原则

1. **不重复造轮子** - 优先使用成熟开源方案
2. **资源受限优化** - 2核2G 内存，必须极致轻量化
3. **TRAE 优先** - Agent 通过 TRAE IDE 生成，统一规范
4. **渐进式演进** - 从现有架构平滑迁移，不推倒重来
5. **MCP 兼容** - 支持 2026 年标准协议

### 2.2 目标架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户层 (User Layer)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  控制平面UI   │  │  Agent前端-1  │  │  Agent前端-N  │          │
│  │  (Next.js)   │  │  (iframe)    │  │  (iframe)    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      控制平面 (Control Plane)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ Agent注册 │  │ 路由网关  │  │ 工作流引擎│  │ MCP Hub  │        │
│  │ 版本管理  │  │ (Caddy)  │  │(自研轻量)│  │          │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ CI/CD触发 │  │ 成本计费  │  │ 监控告警  │  │ 审计日志  │        │
│  │ (GitHub) │  │          │  │          │  │          │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │ Agent运行时-1│  │ Agent运行时-2│  │ Agent运行时-N│
       │ (Docker)   │  │ (Docker)   │  │ (Docker)   │
       │            │  │            │  │            │
       │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │
       │ │FastAPI │ │  │ │FastAPI │ │  │ │FastAPI │ │
       │ │+ CrewAI│ │  │ │+ CrewAI│ │  │ │+ CrewAI│ │
       │ │+ MCP   │ │  │ │+ MCP   │ │  │ │+ MCP   │ │
       │ └────────┘ │  │ └────────┘ │  │ └────────┘ │
       └────────────┘  └────────────┘  └────────────┘

共享：PostgreSQL (1实例) + Redis (1实例，可选)
Swap：4G（防 OOM）
```

### 2.3 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 多 Agent 框架 | **CrewAI**（Python 库） | 纯代码，无额外服务，2G 内存可运行 |
| 工作流引擎 | **自研轻量版** | 不引入 Dify（太重），基于现有代码扩展 |
| 向量检索 | **SQLite + sqlite-vec** | 轻量级，无需独立服务 |
| MCP 实现 | **Embedded 模式** | 复用 Agent HTTP 端口，不启动独立进程 |
| Caddy 动态路由 | **Caddyfile + reload** | 不启用 API 模式（安全），热重载秒级生效 |
| 监控 | **Prometheus + Grafana** | 开源标准，资源可控 |
| 日志 | **Loki + Grafana** | 与监控统一栈，轻量 |

---

## 三、增删改清单

### 3.1 新增模块

| 模块 | 说明 | 优先级 |
|------|------|--------|
| **Agent 模板引擎** | 标准化 Agent 项目生成（TRAE 规则） | P0 |
| **MCP Hub** | 集中管理 Agent 工具暴露 | P1 |
| **工作流引擎** | 多 Agent 编排（基于现有扩展） | P1 |
| **Prometheus 监控** | 指标采集 + Grafana 大盘 | P1 |
| **Loki 日志聚合** | 日志收集 + 查询 | P2 |
| **审计日志** | 操作记录 | P2 |
| **Swap 挂载** | ECS 4G Swap 防 OOM | P0 |

### 3.2 修改模块

| 模块 | 变更 | 说明 |
|------|------|------|
| **Agent 表** | 新增字段 | `mcpEnabled`, `mcpToolsEndpoint` |
| **Caddy 路由** | 动态注入 | 控制平面生成 Caddyfile 片段 + reload |
| **CI/CD** | 增强 | 支持 Agent 项目自动构建部署 |
| **TRAE 规则** | 新增 | Mock 测试强制要求 |

### 3.3 删除/废弃

| 模块 | 说明 |
|------|------|
| Dify 完整部署 | 资源占用过高，改用 CrewAI |
| Weaviate/Chroma | 向量库，改用 sqlite-vec |
| Caddy API 模式 | 安全风险，改用 Caddyfile |

---

## 四、Agent 生产规范

### 4.1 项目结构

```
my-agent/
├── .trae/
│   └── rules.md              # TRAE 生成规则
├── agent.yaml                # Agent 元数据
├── docker-compose.yml        # 本地开发
├── Dockerfile                # 标准化镜像
├── .github/
│   └── workflows/
│       └── deploy.yml        # 复用控制平面部署流程
├── src/
│   ├── main.py               # FastAPI 入口
│   ├── api/
│   │   └── v1/
│   │       └── analyze.py    # 业务 API
│   ├── models/
│   │   └── schemas.py        # Pydantic 模型
│   └── config.py             # 配置
├── frontend/                 # 可选：独立前端
│   ├── src/
│   │   ├── App.tsx
│   │   └── api.ts
│   └── package.json
└── tests/                    # 强制：Mock 测试
    ├── conftest.py
    ├── test_health.py
    └── test_api.py
```

### 4.2 agent.yaml 规范

```yaml
apiVersion: v1
kind: Agent
metadata:
  name: root-cause-analyzer
  slug: root-cause-agent
  description: 根因分析 Agent
  icon: 🔍
  tags: [运维, 分析, AI]
  
spec:
  runtime:
    type: docker
    image: root-cause-agent:latest
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
        description: 执行根因分析
        input:
          problem: string
        output:
          result: string
          confidence: float
  
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
    enabled: true
    mode: embedded
    toolsEndpoint: /mcp/tools
    exposedTools:
      - name: query_crm_customer
        description: 检索CRM客户画像
        inputSchema:
          type: object
          properties:
            customerId: { type: string }
```

### 4.3 TRAE 规则（.trae/rules.md）

```markdown
# Agent 生成规则

## 1. 技术栈
- 后端：Python 3.11 + FastAPI + Pydantic
- 前端：React 18 + TypeScript + Tailwind CSS
- AI：OpenAI SDK / DeepSeek API
- 部署：Docker + Docker Compose

## 2. 代码规范
1. API 返回标准格式：
   ```json
   {"code": 0, "data": {}, "message": "success"}
   ```
2. 必须实现 `/health` 端点
3. 必须实现 `/metrics` Prometheus 指标端点
4. 日志使用结构化 JSON

## 3. 控制平面集成
- 读取环境变量：`CP_API_KEY`, `CP_BASE_URL`, `AGENT_SLUG`
- 启动时向控制平面注册
- 每次请求上报执行记录

## 4. MCP 支持（如启用）
- 在 `/mcp/tools` 暴露工具列表
- 工具执行通过现有 API 端点

## 5. 自动化测试（强制）
- 必须在 `tests/` 目录下基于 pytest 编写单测
- 所有外部 HTTP 调用必须 Mock（AI API、控制平面）
- CI/CD 中不配置真实 API Key，100% 覆盖率
```

---

## 五、CI/CD 流程

```
开发者使用 TRAE 生成 Agent 代码
           │
           ▼
    提交到 GitHub
           │
           ▼
    GitHub Actions
           │
           ├─→ 运行测试（Mock，无真实 API Key）
           ├─→ 构建 Docker 镜像
           ├─→ 推送到 ACR
           │
           ▼
    控制平面收到部署通知
           │
           ├─→ 解析 agent.yaml
           ├─→ 创建/更新 Agent 记录
           ├─→ 生成 Caddyfile 片段
           ├─→ 执行 `caddy reload`
           │
           ▼
    蓝绿部署 / 灰度发布
```

---

## 六、数据模型变更

### 6.1 新增表

```prisma
model Environment {
  id        String   @id @default(cuid())
  name      String   // dev | staging | prod
  agents    Agent[]
  createdAt DateTime @default(now()) @map("created_at")
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?  @map("user_id")
  action     String   // create | update | delete | deploy
  resource   String   // agent | deployment | api_key
  resourceId String   @map("resource_id")
  details    String?
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([resource, resourceId])
  @@index([createdAt])
}

model NotificationChannel {
  id        String   @id @default(cuid())
  name      String
  type      String   // feishu | dingtalk | slack | email
  config    String   // JSON
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
}
```

### 6.2 修改表

```prisma
model Agent {
  // ... 现有字段
  mcpEnabled      Boolean @default(false) @map("mcp_enabled")
  mcpToolsEndpoint String? @map("mcp_tools_endpoint")
  environmentId   String? @map("environment_id")
  environment     Environment? @relation(fields: [environmentId], references: [id])
}
```

---

## 七、资源分配（2核2G + 4G Swap）

| 服务 | CPU | 内存 | 说明 |
|------|-----|------|------|
| 控制平面 | 0.5核 | 512M | Next.js + Prisma |
| PostgreSQL | 0.5核 | 512M | 共享实例 |
| Redis | 0.25核 | 256M | 可选，缓存/消息 |
| Agent-1 | 0.5核 | 512M | 业务 Agent |
| Agent-2 | 0.25核 | 256M | 轻量 Agent |
| **总计** | **2核** | **2G** | |
| Swap | - | 4G | OOM 防护 |

---

## 八、开源资源清单

| 功能 | 开源方案 | 替代自研 |
|------|----------|----------|
| 多 Agent 协作 | **CrewAI** | Agent 通信层 |
| 工作流编排 | **自研轻量** | 基于现有扩展 |
| 向量检索 | **sqlite-vec** | 向量数据库 |
| API 网关 | **Caddy** | 路由管理 |
| 监控 | **Prometheus + Grafana** | 自定义监控 |
| 日志 | **Loki + Grafana** | 日志系统 |
| 消息队列 | **Redis** | Agent 间通信 |
| CI/CD | **GitHub Actions** | 自建流水线 |

---

## 九、实施路线图

### Phase 1：基础加固（1-2 周）
- [ ] ECS 挂载 4G Swap
- [ ] 共享 PostgreSQL 实例
- [ ] Prisma OpenSSL 问题彻底修复
- [ ] ICP 备案完成

### Phase 2：Agent 规范（2-3 周）
- [ ] Agent 模板引擎
- [ ] TRAE 规则标准化
- [ ] agent.yaml 规范
- [ ] Mock 测试强制要求

### Phase 3：MCP 与路由（2 周）
- [ ] MCP Embedded 模式
- [ ] Caddy 动态路由（Caddyfile + reload）
- [ ] Agent 自动注册

### Phase 4：监控与日志（2 周）
- [ ] Prometheus + Grafana
- [ ] Loki 日志聚合
- [ ] 告警规则配置

### Phase 5：多 Agent 协同（3-4 周）
- [ ] 工作流引擎
- [ ] CrewAI 集成
- [ ] 多 Agent 编排 UI

---

## 十、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 2G 内存不足 | 高 | Swap + 资源共享 + 轻量方案 |
| ICP 备案延迟 | 中 | 继续用 IP 访问 |
| TRAE 生成质量不稳定 | 中 | 严格规则 + Code Review |
| MCP 标准变化 | 低 | Embedded 模式，适配成本低 |

---

*文档结束*
