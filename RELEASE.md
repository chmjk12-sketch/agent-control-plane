# Agent Control Plane V2.0 发布总结

## 项目概述

Agent Control Plane 是一个基于 Next.js 15 的 Agent 管理平台，提供 Agent 注册、部署、监控、API 网关、蓝绿灰度发布、健康检查、Token 监控和预算告警等完整功能。

**访问地址：**
- **IP 访问：`http://39.105.86.184`（已验证可用）**
- 域名访问：`https://administrator.chmjk67.top`（ICP 备案完成后生效）

---

## V2.0 核心功能

### 1. 数据模型扩展（PostgreSQL）
- Agent 模型新增：环境槽位、流量权重、部署策略、健康检查路径、容器名、内部端口、镜像地址、成本预算
- 新增模型：HealthCheckLog（健康检查日志）、Alert（告警中心）、ApiKey（API 密钥管理）

### 2. API 网关
- `/api/proxy/[slug]` — 统一代理入口，支持 Token 提取和预算检查
- 超预算自动返回 429，阻止继续消费

### 3. 部署通知回调
- `/api/deploy-notify` — GitHub Actions 部署完成后回调，更新部署状态
- API Key 鉴权保护

### 4. 蓝绿部署 + 灰度发布
- Caddy 反向代理动态路由切换
- `/api/agents/[id]/canary` — 流量权重调节（0-100%）
- 支持 A/B 测试和渐进式发布

### 5. 健康检查与自愈
- HealthChecker 类：每 30 秒轮询所有 online/degraded Agent
- 5 秒超时，自动记录日志、更新状态、触发告警
- 容错设计：启动延迟 15s + 并发限制 5 + 连续失败自动停止

### 6. Token 监控与预算告警
- 按模型计算 Token 成本（DeepSeek/GPT/Claude）
- 月度预算限制，超支自动拦截
- 告警中心支持批量标记已解决

### 7. API 密钥管理
- 每个 Agent 可创建多个 API Key
- hash 存储 + prefix 显示，安全可追溯

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 15 (App Router), React 18, Tailwind CSS v4, Radix UI |
| 状态管理 | Zustand, TanStack Query v5 |
| 后端 | Next.js API Routes, Prisma ORM |
| 数据库 | PostgreSQL 16 |
| 反向代理 | Caddy 2 (自动 HTTPS) |
| 容器化 | Docker, Docker Compose |
| CI/CD | GitHub Actions + SSH 直连部署 |
| 镜像仓库 | 阿里云容器镜像服务 (ACR) |

---

## 部署架构

```
GitHub Push
    |
    v
GitHub Actions (ubuntu-latest)
    |- Docker Build & Push (ACR)
    |- SSH 直连 ECS 部署
         |- Docker 网络检查
         |- PostgreSQL 启动/检查
         |- 镜像拉取
         |- 容器启动
         |- 数据库迁移 (psql 直接执行 SQL)
         |- 健康检查
         |- Caddy 配置更新
    |- DNS A 记录检查
    |- 部署通知 (飞书/钉钉)
```

---

## 文件清单

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | PostgreSQL + App + Caddy 三服务编排 |
| `Caddyfile` | 自动 HTTPS 反向代理配置 |
| `Dockerfile` | 多阶段构建，内置 Prisma CLI + HEALTHCHECK |
| `.github/workflows/deploy.yml` | SSH 直连部署 + 回滚支持 + 通知 |
| `prisma/schema.prisma` | 完整数据模型定义 |
| `prisma/migrations/` | PostgreSQL 迁移 SQL |
| `src/lib/health-checker.ts` | 容错健康检查器 |
| `src/lib/caddy-manager.ts` | Caddy 路由管理 |
| `src/lib/api-helpers.ts` | API 鉴权 + 成本计算 |
| `src/instrumentation.ts` | HealthChecker 启动入口 |

---

## GitHub Secrets 配置

| Secret | 用途 | 必需 |
|--------|------|------|
| `ECS_SSH_KEY` | ECS 服务器 SSH 私钥 | 是 |
| `ECS_USER` | SSH 用户名 | 是 |
| `REGISTRY_USERNAME` | 阿里云镜像仓库用户名 | 是 |
| `REGISTRY_PASSWORD` | 阿里云镜像仓库密码 | 是 |
| `ALIYUN_ACCESS_KEY_ID` | 阿里云 AK（DNS 用） | 是 |
| `ALIYUN_ACCESS_KEY_SECRET` | 阿里云 SK（DNS 用） | 是 |
| `NOTIFY_WEBHOOK_URL` | 飞书/钉钉 webhook | 可选 |

---

## 部署历史

| Run | 状态 | 说明 |
|-----|------|------|
| Run 1-10 | 部分失败 | 构建问题（Alpine OpenSSL、ESLint） |
| Run 11-14 | 成功 | V1.0 稳定部署 |
| Run 15-19 | 部分失败 | CI/CD 管道问题（Actions 表达式、Python f-string） |
| Run 20-25 | 部分失败 | 脚本传递问题（端口冲突、heredoc 转义、base64） |
| Run 26-29 | 成功 | 分步 RunCommand，修复 Prisma CLI 兼容性 |
| Run 30-32 | 失败 | SSH 认证失败（ECS 未配置公钥） |
| **Run 33** | **成功** | **SSH 部署首次成功，HEALTH_OK** |
> | Run 34-44 | 成功 | IP 访问配置完成 |
> | **Run 45** | **成功** | **IP 访问验证通过，返回完整 JSON** |

---

## 已知问题

1. **ICP 备案未完成** — 域名 `chmjk67.top` 无法通过 80/443 端口访问（阿里云拦截）
   - 解决方案：已完成 ICP 备案申请，等待审核
   - 临时方案：通过 IP 地址 `http://39.105.86.184` 直接访问

2. **Prisma OpenSSL 警告** — Docker build 阶段检测到 OpenSSL 版本警告
   - 不影响运行时（已使用 `node:22-bookworm-slim` 修复）
   - 运行时引擎加载正常

---

## 后续优化方向

1. **Docker Compose 生产部署** — 替代手动 docker run
2. **K8s 迁移** — 利用 Deployment/Service/Ingress 原生支持
3. **监控大盘** — Grafana + Prometheus 指标采集
4. **日志聚合** — ELK/Loki 集中日志管理
5. **多环境支持** — dev/staging/prod 环境隔离
