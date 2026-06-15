# Agent Control Plane V3.0 Phase 4 实施计划 — 监控与日志

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 部署 Prometheus + Grafana 监控栈和 Loki 日志聚合，实现 Agent 运行状态可视化、成本趋势分析、实时日志查询和告警规则配置。

**Architecture:** Prometheus 通过 Agent 的 `/metrics` 端点拉取指标；Grafana 连接 Prometheus 和 Loki 数据源提供可视化大盘；Loki 收集容器 stdout 日志；控制平面提供告警规则配置 API。所有监控组件以 Docker Compose 服务运行，资源严格限制。

**Tech Stack:** Prometheus, Grafana, Loki (grafana/loki), Docker Compose, Next.js API

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `docker-compose.yml` | 修改 | 新增 prometheus, grafana, loki 服务 |
| `monitoring/prometheus.yml` | 新增 | Prometheus 配置：Agent 发现规则 |
| `monitoring/loki-config.yml` | 新增 | Loki 配置 |
| `monitoring/grafana/provisioning/` | 新增 | Grafana 数据源和大盘预配置 |
| `src/lib/alert-engine.ts` | 新增 | 告警规则引擎 |
| `src/app/api/alerts/rules/route.ts` | 新增 | 告警规则 CRUD API |
| `src/app/api/metrics/overview/route.ts` | 新增 | 指标聚合 API |
| `prisma/schema.prisma` | 修改 | 新增 AlertRule 表 |

---

## Task 1: Prisma Schema 扩展（AlertRule 表）

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 新增 AlertRule 模型**

在 schema.prisma 末尾添加：

```prisma
model AlertRule {
  id          String   @id @default(cuid())
  name        String
  description String?
  
  // 规则条件
  metric      String   // cpu | memory | latency | cost | error_rate | health
  operator    String   // gt | lt | eq | gte | lte
  threshold   Float
  duration    Int      @default(5) // 持续多少分钟触发
  
  // 作用范围
  agentId     String?  @map("agent_id")
  agent       Agent?   @relation(fields: [agentId], references: [id], onDelete: Cascade)
  global      Boolean  @default(false) // 是否全局规则
  
  // 通知配置
  severity    String   @default("warning") // info | warning | critical
  channels    String   @default("[]") // 通知渠道 JSON
  
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@index([agentId])
  @@index([enabled])
}
```

同时在 Agent 模型中添加 alertRules 关系：

```prisma
model Agent {
  // ... 现有字段 ...
  
  // V3.0 新增：告警规则
  alertRules  AlertRule[]
  
  // ... 现有关系 ...
}
```

- [ ] **Step 2: 生成迁移文件**

```bash
npx prisma migrate dev --name add_alert_rules
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AlertRule model for monitoring alerts"
```

---

## Task 2: Prometheus 配置

**Files:**
- Create: `monitoring/prometheus.yml`
- Create: `monitoring/prometheus-targets.json`

- [ ] **Step 1: 创建 Prometheus 主配置**

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'agent-control-plane'
    replica: '{{.ExternalURL}}'

scrape_configs:
  # 控制平面自身指标
  - job_name: 'control-plane'
    static_configs:
      - targets: ['acp-app:3000']
    metrics_path: /api/metrics
    scrape_interval: 15s

  # Agent 动态发现（通过文件）
  - job_name: 'agents'
    file_sd_configs:
      - files:
          - '/etc/prometheus/targets.json'
        refresh_interval: 30s
    metrics_path: /metrics
    scrape_interval: 15s

  # Prometheus 自身
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter（如安装）
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

- [ ] **Step 2: 创建初始目标文件**

```json
// monitoring/prometheus-targets.json
[
  {
    "targets": [],
    "labels": {
      "job": "agents"
    }
  }
]
```

- [ ] **Step 3: Commit**

```bash
git add monitoring/prometheus.yml monitoring/prometheus-targets.json
git commit -m "feat: add Prometheus config with agent file-based discovery"
```

---

## Task 3: Loki 配置

**Files:**
- Create: `monitoring/loki-config.yml`

- [ ] **Step 1: 创建 Loki 配置**

```yaml
# monitoring/loki-config.yml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  path_prefix: /tmp/loki
  storage:
    filesystem:
      chunks_directory: /tmp/loki/chunks
      rules_directory: /tmp/loki/rules
  replication_factor: 1
  ring:
    instance_addr: 127.0.0.1
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

ruler:
  alertmanager_url: http://localhost:9093

# 限制资源使用
limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20
```

- [ ] **Step 2: Commit**

```bash
git add monitoring/loki-config.yml
git commit -m "feat: add Loki config for log aggregation"
```

---

## Task 4: Grafana 预配置

**Files:**
- Create: `monitoring/grafana/provisioning/datasources/datasources.yml`
- Create: `monitoring/grafana/provisioning/dashboards/dashboards.yml`
- Create: `monitoring/grafana/dashboards/agent-overview.json`

- [ ] **Step 1: 创建数据源配置**

```yaml
# monitoring/grafana/provisioning/datasources/datasources.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: false
```

- [ ] **Step 2: 创建大盘配置**

```yaml
# monitoring/grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    editable: true
    options:
      path: /var/lib/grafana/dashboards
```

- [ ] **Step 3: 创建 Agent 概览大盘（简化版）**

```json
{
  "dashboard": {
    "title": "Agent Overview",
    "tags": ["agent", "control-plane"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Agent Status",
        "type": "stat",
        "targets": [
          {
            "expr": "up{job=\"agents\"}",
            "legendFormat": "{{instance}}"
          }
        ],
        "gridPos": { "h": 8, "w": 12, "x": 0, "y": 0 }
      },
      {
        "id": 2,
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{job=\"agents\"}[5m])",
            "legendFormat": "{{instance}}"
          }
        ],
        "gridPos": { "h": 8, "w": 12, "x": 12, "y": 0 }
      },
      {
        "id": 3,
        "title": "Logs",
        "type": "logs",
        "datasource": "Loki",
        "targets": [
          {
            "expr": "{job=\"agents\"}"
          }
        ],
        "gridPos": { "h": 12, "w": 24, "x": 0, "y": 8 }
      }
    ]
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add monitoring/grafana/
git commit -m "feat: add Grafana provisioning with Prometheus and Loki datasources"
```

---

## Task 5: Docker Compose 新增监控服务

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 添加 prometheus, grafana, loki 服务**

```yaml
# docker-compose.yml 追加以下服务

  prometheus:
    image: prom/prometheus:v2.55.0
    container_name: acp-prometheus
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/prometheus-targets.json:/etc/prometheus/targets.json
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=15d'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
    networks:
      - caddy-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:9090/-/healthy"]
      interval: 30s
      timeout: 5s
      retries: 3

  grafana:
    image: grafana/grafana:11.3.0
    container_name: acp-grafana
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    environment:
      GF_SECURITY_ADMIN_USER: ${GRAFANA_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_SERVER_ROOT_URL: ${GRAFANA_ROOT_URL:-http://localhost:3001}
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    networks:
      - caddy-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3

  loki:
    image: grafana/loki:3.2.0
    container_name: acp-loki
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    volumes:
      - ./monitoring/loki-config.yml:/etc/loki/local-config.yaml:ro
      - loki-data:/tmp/loki
    command: -config.file=/etc/loki/local-config.yaml
    networks:
      - caddy-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3100/ready"]
      interval: 30s
      timeout: 5s
      retries: 3

volumes:
  postgres-data:
  caddy-data:
  caddy-config:
  prometheus-data:
  grafana-data:
  loki-data:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add Prometheus, Grafana, Loki services to docker-compose"
```

---

## Task 6: 告警规则引擎

**Files:**
- Create: `src/lib/alert-engine.ts`

- [ ] **Step 1: 创建告警规则引擎**

```typescript
// src/lib/alert-engine.ts
import { prisma } from "./prisma";

interface AlertCondition {
  metric: string;
  operator: "gt" | "lt" | "eq" | "gte" | "lte";
  threshold: number;
  currentValue: number;
}

export class AlertEngine {
  /**
   * 评估单条规则
   */
  evaluateCondition(condition: AlertCondition): boolean {
    const { metric, operator, threshold, currentValue } = condition;

    switch (operator) {
      case "gt":
        return currentValue > threshold;
      case "lt":
        return currentValue < threshold;
      case "eq":
        return currentValue === threshold;
      case "gte":
        return currentValue >= threshold;
      case "lte":
        return currentValue <= threshold;
      default:
        console.warn(`[AlertEngine] Unknown operator: ${operator}`);
        return false;
    }
  }

  /**
   * 检查 Agent 是否触发告警规则
   */
  async checkAgentAlerts(agentId: string, metrics: Record<string, number>): Promise<Array<{
    ruleId: string;
    ruleName: string;
    severity: string;
    message: string;
  }>> {
    const rules = await prisma.alertRule.findMany({
      where: {
        OR: [{ agentId }, { global: true }],
        enabled: true,
      },
    });

    const triggered: Array<{
      ruleId: string;
      ruleName: string;
      severity: string;
      message: string;
    }> = [];

    for (const rule of rules) {
      const currentValue = metrics[rule.metric];
      if (currentValue === undefined) continue;

      const isTriggered = this.evaluateCondition({
        metric: rule.metric,
        operator: rule.operator as any,
        threshold: rule.threshold,
        currentValue,
      });

      if (isTriggered) {
        triggered.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          message: `${rule.metric} ${rule.operator} ${rule.threshold} (当前: ${currentValue})`,
        });

        // 创建告警记录
        await prisma.alert.create({
          data: {
            agentId,
            type: "health",
            severity: rule.severity,
            message: `[${rule.name}] ${rule.metric} 触发告警: ${currentValue} ${rule.operator} ${rule.threshold}`,
          },
        });
      }
    }

    return triggered;
  }

  /**
   * 获取活跃告警统计
   */
  async getAlertStats(): Promise<{
    total: number;
    critical: number;
    warning: number;
    info: number;
    byAgent: Record<string, number>;
  }> {
    const alerts = await prisma.alert.findMany({
      where: { resolved: false },
    });

    const stats = {
      total: alerts.length,
      critical: 0,
      warning: 0,
      info: 0,
      byAgent: {} as Record<string, number>,
    };

    for (const alert of alerts) {
      if (alert.severity === "critical") stats.critical++;
      else if (alert.severity === "warning") stats.warning++;
      else stats.info++;

      stats.byAgent[alert.agentId] = (stats.byAgent[alert.agentId] || 0) + 1;
    }

    return stats;
  }
}

export const alertEngine = new AlertEngine();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/alert-engine.ts
git commit -m "feat: add alert engine for rule evaluation and alert generation"
```

---

## Task 7: 告警规则 API

**Files:**
- Create: `src/app/api/alerts/rules/route.ts`

- [ ] **Step 1: 创建告警规则 CRUD API**

```typescript
// src/app/api/alerts/rules/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const agentId = new URL(req.url).searchParams.get("agentId");
  const rules = await prisma.alertRule.findMany({
    where: agentId ? { OR: [{ agentId }, { global: true }] } : {},
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ data: rules });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const rule = await prisma.alertRule.create({
    data: {
      name: body.name,
      description: body.description,
      metric: body.metric,
      operator: body.operator,
      threshold: body.threshold,
      duration: body.duration || 5,
      agentId: body.agentId,
      global: body.global || false,
      severity: body.severity || "warning",
      channels: JSON.stringify(body.channels || []),
    },
  });
  return NextResponse.json(rule, { status: 201 });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/alerts/rules/
git commit -m "feat: add alert rules CRUD API"
```

---

## Task 8: 指标聚合 API

**Files:**
- Create: `src/app/api/metrics/overview/route.ts`

- [ ] **Step 1: 创建指标概览 API**

```typescript
// src/app/api/metrics/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const days = parseInt(url.searchParams.get("days") || "7");

  const since = new Date();
  since.setDate(since.getDate() - days);

  // 基础统计
  const where = agentId ? { agentId, createdAt: { gte: since } } : { createdAt: { gte: since } };

  const [totalRequests, totalCost, avgLatency, errorCount] = await Promise.all([
    prisma.agentExecution.count({ where }),
    prisma.agentExecution.aggregate({ where, _sum: { cost: true } }),
    prisma.agentExecution.aggregate({ where, _avg: { latencyMs: true } }),
    prisma.agentExecution.count({ where: { ...where, status: "error" } }),
  ]);

  // 按天聚合
  const dailyStats = await prisma.$queryRaw`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as requests,
      SUM(cost) as cost,
      AVG(latency_ms) as avg_latency
    FROM agent_executions
    WHERE created_at >= ${since}
    ${agentId ? prisma.$queryRaw`AND agent_id = ${agentId}` : prisma.$queryRaw``}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `;

  // Agent 健康状态
  const agentHealth = await prisma.agentHealth.findMany({
    include: { agent: { select: { name: true, slug: true } } },
  });

  return NextResponse.json({
    summary: {
      totalRequests,
      totalCost: totalCost._sum.cost || 0,
      avgLatency: Math.round(avgLatency._avg.latencyMs || 0),
      errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
    },
    dailyStats,
    agentHealth: agentHealth.map((h) => ({
      agentId: h.agentId,
      name: h.agent.name,
      slug: h.agent.slug,
      status: h.status,
      uptime: h.uptime,
      memoryMb: h.memoryMb,
      cpuPercent: h.cpuPercent,
      lastHeartbeat: h.lastHeartbeat,
    })),
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/metrics/
git commit -m "feat: add metrics overview API with aggregation"
```

---

## Task 9: 环境变量更新

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 添加监控相关配置**

```bash
# .env.example 追加
# 监控配置
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin123
GRAFANA_ROOT_URL=http://localhost:3001

# Prometheus 推送网关（Agent 使用）
PROMETHEUS_PUSHGATEWAY=http://acp-prometheus:9091
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add monitoring env vars for Grafana and Prometheus"
```

---

## 验证清单

部署完成后验证：

```bash
# 1. 启动监控服务
docker compose up -d prometheus grafana loki

# 2. 检查 Prometheus 目标
curl http://localhost:9090/api/v1/targets

# 3. 检查 Grafana 健康
curl http://localhost:3001/api/health

# 4. 检查 Loki 就绪
curl http://localhost:3100/ready

# 5. 创建告警规则
curl -X POST http://localhost:3000/api/alerts/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "高延迟告警",
    "metric": "latency",
    "operator": "gt",
    "threshold": 5000,
    "severity": "warning"
  }'

# 6. 查看指标概览
curl http://localhost:3000/api/metrics/overview

# 7. 检查容器资源
docker stats --no-stream
```

---

*Phase 4 计划结束*
