# Agent Control Plane V3.0 Phase 3 实施计划 — MCP 与动态路由

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 MCP Embedded 模式、Caddy 动态路由（Caddyfile + reload）、Agent 自动注册，完成控制平面与 Agent 运行时的协议对接。

**Architecture:** MCP 以 Embedded 模式运行在 Agent 的 HTTP 服务中，通过 `/mcp/tools` 暴露工具列表；Caddy 路由改为 Caddyfile 片段生成 + reload 模式，控制平面统一管理路由配置；Agent 启动时自动向控制平面注册。

**Tech Stack:** Next.js 15, Caddy 2, Prisma, Docker, MCP Protocol

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改 | 新增 McpTool 表，Agent 增加 mcp 字段 |
| `src/lib/caddy-manager.ts` | 重写 | Caddyfile 片段生成 + reload 模式 |
| `src/lib/mcp-hub.ts` | 新增 | MCP 工具注册与发现中心 |
| `src/app/api/mcp/tools/route.ts` | 新增 | MCP 工具列表 API |
| `src/app/api/mcp/register/route.ts` | 新增 | Agent MCP 注册 API |
| `src/app/api/agents/[id]/mcp/route.ts` | 新增 | Agent MCP 配置管理 API |
| `src/app/api/caddy/reload/route.ts` | 新增 | Caddy 手动重载 API |
| `docker-compose.yml` | 修改 | 添加 caddy-agents 卷挂载 |

---

## Task 1: Prisma Schema 扩展（MCP 表）

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 新增 McpTool 模型**

在 schema.prisma 末尾添加：

```prisma
model McpTool {
  id          String   @id @default(cuid())
  agentId     String   @map("agent_id")
  agent       Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  
  name        String
  description String
  inputSchema String   @map("input_schema") // JSON Schema
  endpoint    String   // Agent 内部执行端点
  method      String   @default("POST") // HTTP method
  
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@index([agentId])
  @@index([name])
}
```

同时在 Agent 模型中添加 mcpTools 关系：

```prisma
model Agent {
  // ... 现有字段 ...
  
  // V3.0 新增：MCP 工具
  mcpTools    McpTool[]
  
  // ... 现有关系 ...
}
```

- [ ] **Step 2: 生成迁移文件**

```bash
npx prisma migrate dev --name add_mcp_tools
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add McpTool model for MCP embedded mode"
```

---

## Task 2: Caddy 动态路由重写（Caddyfile + reload）

**Files:**
- Modify: `src/lib/caddy-manager.ts`

- [ ] **Step 1: 重写 CaddyManager 为片段模式**

```typescript
// src/lib/caddy-manager.ts
import { promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "./prisma";

const execAsync = promisify(exec);

const CADDY_FILE = "/opt/app/Caddyfile";
const AGENTS_DIR = "/opt/app/caddy-agents";

interface AgentRoute {
  slug: string;
  containerName: string;
  port: number;
  domain?: string;
  weight?: number;
}

export class CaddyManager {
  private caddyContainer: string;

  constructor(caddyContainer = "acp-caddy") {
    this.caddyContainer = caddyContainer;
  }

  /**
   * 生成 Agent 的 Caddyfile 片段
   */
  static async generateAgentRoute(agent: AgentRoute): Promise<string> {
    const domain = agent.domain || `${agent.slug}.chmjk67.top`;
    return `
# Agent: ${agent.slug}
${domain} {
    reverse_proxy ${agent.containerName}:${agent.port}
}
`;
  }

  /**
   * 写入 Agent 路由片段
   */
  static async writeAgentRoute(agent: AgentRoute): Promise<void> {
    await fs.mkdir(AGENTS_DIR, { recursive: true });
    const routeFile = `${AGENTS_DIR}/${agent.slug}.caddy`;
    const content = await this.generateAgentRoute(agent);
    await fs.writeFile(routeFile, content, "utf-8");
  }

  /**
   * 删除 Agent 路由
   */
  static async removeAgentRoute(slug: string): Promise<void> {
    const routeFile = `${AGENTS_DIR}/${slug}.caddy`;
    try {
      await fs.unlink(routeFile);
    } catch (e) {
      // 文件不存在，忽略
    }
  }

  /**
   * 重新生成主 Caddyfile 并 reload
   */
  async reloadCaddy(): Promise<void> {
    // 读取所有 Agent 路由
    const files = await fs.readdir(AGENTS_DIR).catch(() => [] as string[]);
    let routes = "";

    for (const file of files) {
      if (file.endsWith(".caddy")) {
        const content = await fs.readFile(`${AGENTS_DIR}/${file}`, "utf-8");
        routes += content + "\n";
      }
    }

    // 生成完整 Caddyfile
    const caddyfile = `
# 控制平面默认路由
:80 {
    reverse_proxy acp-app:3000
}

# Agent 动态路由
${routes}
`;

    await fs.writeFile(CADDY_FILE, caddyfile, "utf-8");

    // 热重载 Caddy
    try {
      await execAsync(`docker exec ${this.caddyContainer} caddy reload --config /etc/caddy/Caddyfile`);
      console.log("[CaddyManager] Caddy reloaded successfully");
    } catch (e: any) {
      console.error("[CaddyManager] Caddy reload failed:", e.message);
      // fallback: restart caddy container
      try {
        await execAsync(`docker restart ${this.caddyContainer}`);
        console.log("[CaddyManager] Caddy restarted as fallback");
      } catch (restartErr: any) {
        throw new Error(`Caddy reload and restart both failed: ${restartErr.message}`);
      }
    }
  }

  /**
   * 为 Agent 添加路由并 reload
   */
  async addAgentRoute(agent: AgentRoute): Promise<void> {
    await CaddyManager.writeAgentRoute(agent);
    await this.reloadCaddy();
  }

  /**
   * 移除 Agent 路由并 reload
   */
  async removeAgentRouteAndReload(slug: string): Promise<void> {
    await CaddyManager.removeAgentRoute(slug);
    await this.reloadCaddy();
  }

  /**
   * 同步所有在线 Agent 的路由
   */
  async syncAllAgentRoutes(): Promise<void> {
    const agents = await prisma.agent.findMany({
      where: { status: { in: ["online", "degraded"] } },
    });

    // 清理旧片段
    const files = await fs.readdir(AGENTS_DIR).catch(() => [] as string[]);
    for (const file of files) {
      if (file.endsWith(".caddy")) {
        await fs.unlink(`${AGENTS_DIR}/${file}`);
      }
    }

    // 重新生成所有路由
    for (const agent of agents) {
      await CaddyManager.writeAgentRoute({
        slug: agent.slug,
        containerName: agent.containerName || agent.slug,
        port: agent.internalPort,
      });
    }

    await this.reloadCaddy();
  }
}

export const caddyManager = new CaddyManager();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/caddy-manager.ts
git commit -m "feat: rewrite CaddyManager to use Caddyfile fragments + reload"
```

---

## Task 3: MCP Hub 核心

**Files:**
- Create: `src/lib/mcp-hub.ts`

- [ ] **Step 1: 创建 MCP Hub**

```typescript
// src/lib/mcp-hub.ts
import { prisma } from "./prisma";

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface McpToolRegistration {
  agentSlug: string;
  tools: McpToolDefinition[];
  endpoint: string; // Agent 的工具执行端点
}

export class McpHub {
  /**
   * 注册 Agent 的 MCP 工具
   */
  async registerTools(reg: McpToolRegistration): Promise<void> {
    const agent = await prisma.agent.findUnique({
      where: { slug: reg.agentSlug },
    });

    if (!agent) {
      throw new Error(`Agent not found: ${reg.agentSlug}`);
    }

    // 先删除该 Agent 的旧工具
    await prisma.mcpTool.deleteMany({
      where: { agentId: agent.id },
    });

    // 注册新工具
    for (const tool of reg.tools) {
      await prisma.mcpTool.create({
        data: {
          agentId: agent.id,
          name: tool.name,
          description: tool.description,
          inputSchema: JSON.stringify(tool.inputSchema),
          endpoint: reg.endpoint,
        },
      });
    }

    // 更新 Agent 的 MCP 状态
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        mcpEnabled: true,
        mcpToolsEndpoint: reg.endpoint,
      },
    });
  }

  /**
   * 获取所有已注册的工具
   */
  async listAllTools(): Promise<Array<{
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    agentSlug: string;
    endpoint: string;
  }>> {
    const tools = await prisma.mcpTool.findMany({
      where: { enabled: true },
      include: { agent: { select: { slug: true } } },
    });

    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: JSON.parse(t.inputSchema),
      agentSlug: t.agent.slug,
      endpoint: t.endpoint,
    }));
  }

  /**
   * 获取指定 Agent 的工具
   */
  async listAgentTools(agentSlug: string): Promise<Array<{
    name: string;
    description: string;
    inputSchema: Record<string, any>;
    endpoint: string;
  }>> {
    const agent = await prisma.agent.findUnique({
      where: { slug: agentSlug },
      include: { mcpTools: true },
    });

    if (!agent) throw new Error(`Agent not found: ${agentSlug}`);

    return agent.mcpTools
      .filter((t) => t.enabled)
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: JSON.parse(t.inputSchema),
        endpoint: t.endpoint,
      }));
  }

  /**
   * 执行工具调用（代理到 Agent）
   */
  async executeTool(
    toolName: string,
    params: Record<string, any>
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const tool = await prisma.mcpTool.findFirst({
      where: { name: toolName, enabled: true },
      include: { agent: true },
    });

    if (!tool) {
      return { success: false, error: `Tool not found: ${toolName}` };
    }

    // 构建目标 URL
    const agent = tool.agent;
    const baseUrl = agent.endpoint
      ? agent.endpoint
      : `http://${agent.containerName}_${agent.environmentSlot}:${agent.internalPort}`;
    const url = `${baseUrl}${tool.endpoint}`;

    try {
      const res = await fetch(url, {
        method: tool.method as string,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        return {
          success: false,
          error: `Agent returned ${res.status}: ${await res.text()}`,
        };
      }

      const data = await res.json();
      return { success: true, result: data };
    } catch (e: any) {
      return { success: false, error: `Execution failed: ${e.message}` };
    }
  }

  /**
   * 注销 Agent 的所有工具
   */
  async unregisterAgentTools(agentSlug: string): Promise<void> {
    const agent = await prisma.agent.findUnique({
      where: { slug: agentSlug },
    });

    if (!agent) return;

    await prisma.mcpTool.deleteMany({
      where: { agentId: agent.id },
    });

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        mcpEnabled: false,
        mcpToolsEndpoint: null,
      },
    });
  }
}

export const mcpHub = new McpHub();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/mcp-hub.ts
git commit -m "feat: add MCP Hub for tool registration and discovery"
```

---

## Task 4: MCP API 路由

**Files:**
- Create: `src/app/api/mcp/tools/route.ts`
- Create: `src/app/api/mcp/register/route.ts`
- Create: `src/app/api/agents/[id]/mcp/route.ts`

- [ ] **Step 1: 创建 MCP 工具列表 API**

```typescript
// src/app/api/mcp/tools/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { mcpHub } from "@/lib/mcp-hub";

// 获取所有可用工具（MCP 标准格式）
export const GET = apiHandler(async (req: NextRequest) => {
  const agentSlug = new URL(req.url).searchParams.get("agentSlug");

  let tools;
  if (agentSlug) {
    tools = await mcpHub.listAgentTools(agentSlug);
  } else {
    tools = await mcpHub.listAllTools();
  }

  // MCP 标准响应格式
  return NextResponse.json({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  });
});
```

- [ ] **Step 2: 创建 MCP 注册 API**

```typescript
// src/app/api/mcp/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { mcpHub } from "@/lib/mcp-hub";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { agentSlug, tools, endpoint } = body;

  if (!agentSlug || !tools || !endpoint) {
    return NextResponse.json(
      { error: "缺少必要参数: agentSlug, tools, endpoint" },
      { status: 400 }
    );
  }

  await mcpHub.registerTools({ agentSlug, tools, endpoint });

  return NextResponse.json({
    success: true,
    message: `Registered ${tools.length} tools for agent: ${agentSlug}`,
  });
});
```

- [ ] **Step 3: 创建 Agent MCP 配置管理 API**

```typescript
// src/app/api/agents/[id]/mcp/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";
import { mcpHub } from "@/lib/mcp-hub";

// 获取 Agent 的 MCP 配置
export const GET = apiHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: { mcpTools: true },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    enabled: agent.mcpEnabled,
    toolsEndpoint: agent.mcpToolsEndpoint,
    tools: agent.mcpTools.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      enabled: t.enabled,
    })),
  });
});

// 更新 Agent MCP 状态
export const PATCH = apiHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const body = await req.json();

  const agent = await prisma.agent.update({
    where: { id },
    data: {
      mcpEnabled: body.enabled,
      mcpToolsEndpoint: body.toolsEndpoint,
    },
  });

  return NextResponse.json({
    success: true,
    mcpEnabled: agent.mcpEnabled,
    mcpToolsEndpoint: agent.mcpToolsEndpoint,
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp/ src/app/api/agents/
git commit -m "feat: add MCP APIs - tool listing, registration, agent config"
```

---

## Task 5: Caddy 重载 API

**Files:**
- Create: `src/app/api/caddy/reload/route.ts`

- [ ] **Step 1: 创建 Caddy 重载 API**

```typescript
// src/app/api/caddy/reload/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { caddyManager } from "@/lib/caddy-manager";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { syncAll = false } = body;

  try {
    if (syncAll) {
      await caddyManager.syncAllAgentRoutes();
      return NextResponse.json({
        success: true,
        message: "All agent routes synced and Caddy reloaded",
      });
    } else {
      await caddyManager.reloadCaddy();
      return NextResponse.json({
        success: true,
        message: "Caddy reloaded",
      });
    }
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/caddy/
git commit -m "feat: add Caddy reload API with sync-all support"
```

---

## Task 6: Agent 自动注册增强

**Files:**
- Modify: `src/app/api/deploy-notify/route.ts`

- [ ] **Step 1: 增强 deploy-notify，集成 Caddy 路由和 MCP**

```typescript
// src/app/api/deploy-notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, authenticateDeployNotify } from "@/lib/api-helpers";
import { caddyManager } from "@/lib/caddy-manager";

export const POST = apiHandler(async (req: NextRequest) => {
  if (!authenticateDeployNotify(req)) {
    return NextResponse.json({ error: "未授权的请求" }, { status: 401 });
  }

  const body = await req.json();
  const { agentSlug, image, commit, deployedBy, trigger, mcpTools } = body;

  if (!agentSlug || !image) {
    return NextResponse.json(
      { error: "缺少必要参数：agentSlug 和 image" },
      { status: 400 }
    );
  }

  const agent = await prisma.agent.findUnique({
    where: { slug: agentSlug },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  // 蓝绿交替
  const targetSlot = agent.environmentSlot === "blue" ? "green" : "blue";

  // 创建部署记录
  const deployment = await prisma.deployment.create({
    data: {
      agentId: agent.id,
      imageTag: image,
      gitCommit: commit,
      slot: targetSlot,
      status: "success",
      triggerSource: trigger || "deploy_notify",
      deployedBy: deployedBy || "github-actions",
      startedAt: new Date(),
      finishedAt: new Date(),
      resultLog: "部署成功（由 GitHub Actions 通知）",
    },
  });

  // 更新 Agent 状态
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      status: "online",
      registryImage: image,
      environmentSlot: targetSlot,
      updatedAt: new Date(),
    },
  });

  // 自动添加 Caddy 路由
  try {
    await caddyManager.addAgentRoute({
      slug: agent.slug,
      containerName: agent.containerName || agent.slug,
      port: agent.internalPort,
    });
  } catch (e: any) {
    console.error(`[deploy-notify] Caddy route failed: ${e.message}`);
  }

  // 如果提供了 MCP 工具，自动注册
  if (mcpTools && Array.isArray(mcpTools)) {
    try {
      const { mcpHub } = await import("@/lib/mcp-hub");
      await mcpHub.registerTools({
        agentSlug,
        tools: mcpTools,
        endpoint: agent.mcpToolsEndpoint || "/mcp/tools",
      });
    } catch (e: any) {
      console.error(`[deploy-notify] MCP registration failed: ${e.message}`);
    }
  }

  return NextResponse.json({
    success: true,
    deployment: {
      id: deployment.id,
      slot: targetSlot,
      status: "success",
    },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/deploy-notify/route.ts
git commit -m "feat: enhance deploy-notify with auto Caddy routing and MCP registration"
```

---

## Task 7: Docker Compose 更新

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 添加 caddy-agents 卷挂载**

```yaml
# docker-compose.yml 修改 caddy 服务
  caddy:
    image: caddy:2-alpine
    container_name: acp-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy-agents:/opt/app/caddy-agents:ro  # 新增：Agent 路由片段
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      app:
        condition: service_healthy
    networks:
      - caddy-net
    healthcheck:
      test: ["CMD", "caddy", "validate", "--config", "/etc/caddy/Caddyfile"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: mount caddy-agents directory for dynamic routing"
```

---

## 验证清单

部署完成后验证：

```bash
# 1. 检查 Caddy 路由同步
curl -X POST http://localhost:3000/api/caddy/reload \
  -H "Content-Type: application/json" \
  -d '{"syncAll":true}'

# 2. 检查 MCP 工具列表
curl http://localhost:3000/api/mcp/tools

# 3. 注册 MCP 工具
curl -X POST http://localhost:3000/api/mcp/register \
  -H "Content-Type: application/json" \
  -d '{
    "agentSlug": "test-agent",
    "endpoint": "/api/v1/tools",
    "tools": [
      {"name": "query_data", "description": "查询数据", "inputSchema": {"type": "object", "properties": {"q": {"type": "string"}}}}
    ]
  }'

# 4. 检查 Agent MCP 配置
curl http://localhost:3000/api/agents/{agent-id}/mcp

# 5. 检查 Caddyfile
docker exec acp-caddy cat /etc/caddy/Caddyfile
```

---

*Phase 3 计划结束*
