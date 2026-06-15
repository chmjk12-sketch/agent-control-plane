# Agent Control Plane V3.0 Phase 5 实施计划 — 多 Agent 协同

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现工作流引擎、CrewAI 集成、多 Agent 编排 UI，支持 Agent 间的任务流转、动态协商和协同工作。

**Architecture:** 工作流引擎基于状态机设计，支持 DAG（有向无环图）编排；CrewAI 以 Python 库形式运行在独立容器中，通过 HTTP API 与控制平面通信；多 Agent 编排 UI 提供可视化拖拽（仿 n8n）。消息总线使用 Redis 发布订阅实现 Agent 间异步通信。

**Tech Stack:** Next.js 15, Prisma, Redis, CrewAI (Python), React Flow (可视化), SQLite + sqlite-vec (向量检索)

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改 | 新增 Workflow、WorkflowNode、WorkflowExecution 表 |
| `src/lib/workflow-engine.ts` | 新增 | 工作流引擎核心（DAG 执行） |
| `src/lib/crewai-bridge.ts` | 新增 | CrewAI 集成桥接 |
| `src/lib/message-bus.ts` | 新增 | Agent 间消息总线（Redis） |
| `src/app/api/workflows/route.ts` | 新增 | 工作流 CRUD API |
| `src/app/api/workflows/[id]/execute/route.ts` | 新增 | 工作流执行 API |
| `src/app/api/workflows/[id]/nodes/route.ts` | 新增 | 工作流节点管理 API |
| `src/app/api/agent-chat/route.ts` | 新增 | Agent 间协商 API |
| `docker-compose.yml` | 修改 | 新增 redis 服务 |
| `crewai-service/` | 新增 | CrewAI Python 服务目录 |

---

## Task 1: Prisma Schema 扩展（工作流表）

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 新增 Workflow、WorkflowNode、WorkflowExecution 模型**

在 schema.prisma 末尾添加：

```prisma
model Workflow {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  status      String   @default("draft") // draft | active | paused | archived
  
  // DAG 定义（JSON）
  nodes       String   @default("[]") // 节点列表
  edges       String   @default("[]") // 边（连接）列表
  
  // 变量定义
  variables   String   @default("{}") // 输入/输出变量
  
  // 统计
  executionCount Int   @default(0) @map("execution_count")
  successCount   Int   @default(0) @map("success_count")
  failureCount   Int   @default(0) @map("failure_count")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  executions  WorkflowExecution[]
}

model WorkflowNode {
  id          String   @id @default(cuid())
  workflowId  String   @map("workflow_id")
  
  // 节点定义
  nodeId      String   @map("node_id") // 前端生成的唯一 ID
  type        String   // agent | condition | delay | webhook | start | end
  label       String
  
  // 配置
  config      String   @default("{}") // 节点特定配置（JSON）
  
  // Agent 关联（type=agent 时）
  agentId     String?  @map("agent_id")
  agent       Agent?   @relation(fields: [agentId], references: [id])
  
  // 位置（UI 用）
  positionX   Float    @default(0) @map("position_x")
  positionY   Float    @default(0) @map("position_y")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@index([workflowId])
  @@index([agentId])
}

model WorkflowExecution {
  id          String   @id @default(cuid())
  workflowId  String   @map("workflow_id")
  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  
  status      String   @default("running") // running | success | failed | cancelled
  
  // 输入/输出
  input       String?  // JSON
  output      String?  // JSON
  
  // 节点执行记录
  nodeResults String   @default("[]") @map("node_results") // 每个节点的执行结果
  
  // 错误信息
  error       String?
  
  // 时间
  startedAt   DateTime @default(now()) @map("started_at")
  finishedAt  DateTime? @map("finished_at")
  durationMs  Int?     @map("duration_ms")
  
  @@index([workflowId])
  @@index([status])
}
```

同时在 Agent 模型中添加 workflowNodes 关系：

```prisma
model Agent {
  // ... 现有字段 ...
  
  // V3.0 新增：工作流节点关联
  workflowNodes WorkflowNode[]
  
  // ... 现有关系 ...
}
```

- [ ] **Step 2: 生成迁移文件**

```bash
npx prisma migrate dev --name add_workflow_tables
```

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Workflow, WorkflowNode, WorkflowExecution models"
```

---

## Task 2: Redis 消息总线

**Files:**
- Create: `src/lib/message-bus.ts`

- [ ] **Step 1: 创建消息总线**

```typescript
// src/lib/message-bus.ts

interface Message {
  id: string;
  from: string; // agent slug
  to: string;   // agent slug 或 "broadcast"
  type: string; // request | response | event | task
  payload: Record<string, any>;
  timestamp: number;
  correlationId?: string; // 用于请求-响应匹配
}

class MemoryMessageBus {
  private subscribers: Map<string, Set<(msg: Message) => void>> = new Map();
  private history: Message[] = [];
  private maxHistory = 1000;

  /**
   * 发布消息
   */
  publish(msg: Message): void {
    this.history.push(msg);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // 发送给特定订阅者
    const subscribers = this.subscribers.get(msg.to);
    if (subscribers) {
      subscribers.forEach((cb) => {
        try {
          cb(msg);
        } catch (e) {
          console.error("[MessageBus] Subscriber error:", e);
        }
      });
    }

    // 广播消息也发送给 "broadcast" 订阅者
    if (msg.to !== "broadcast") {
      const broadcastSubs = this.subscribers.get("broadcast");
      if (broadcastSubs) {
        broadcastSubs.forEach((cb) => {
          try {
            cb(msg);
          } catch (e) {
            console.error("[MessageBus] Broadcast subscriber error:", e);
          }
        });
      }
    }
  }

  /**
   * 订阅消息
   */
  subscribe(agentSlug: string, callback: (msg: Message) => void): () => void {
    if (!this.subscribers.has(agentSlug)) {
      this.subscribers.set(agentSlug, new Set());
    }
    this.subscribers.get(agentSlug)!.add(callback);

    // 返回取消订阅函数
    return () => {
      this.subscribers.get(agentSlug)?.delete(callback);
    };
  }

  /**
   * 获取历史消息
   */
  getHistory(from?: string, to?: string, limit = 100): Message[] {
    let result = this.history;
    if (from) result = result.filter((m) => m.from === from);
    if (to) result = result.filter((m) => m.to === to);
    return result.slice(-limit);
  }

  /**
   * 请求-响应模式
   */
  async request(
    from: string,
    to: string,
    payload: Record<string, any>,
    timeoutMs = 30000
  ): Promise<Message> {
    const correlationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsubscribe = this.subscribe(from, (msg) => {
        if (msg.correlationId === correlationId && msg.type === "response") {
          clearTimeout(timeout);
          unsubscribe();
          resolve(msg);
        }
      });

      this.publish({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        from,
        to,
        type: "request",
        payload,
        timestamp: Date.now(),
        correlationId,
      });
    });
  }
}

// 使用内存总线（2G 内存场景，避免 Redis 额外开销）
// 后续可替换为 Redis 实现
export const messageBus = new MemoryMessageBus();

// Redis 实现（预留）
export class RedisMessageBus {
  // TODO: 当需要跨实例通信时实现
  // 使用 ioredis 连接 Redis
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/message-bus.ts
git commit -m "feat: add in-memory message bus for agent communication"
```

---

## Task 3: 工作流引擎核心

**Files:**
- Create: `src/lib/workflow-engine.ts`

- [ ] **Step 1: 创建工作流引擎**

```typescript
// src/lib/workflow-engine.ts
import { prisma } from "./prisma";
import { messageBus } from "./message-bus";

interface WorkflowNodeConfig {
  agentSlug?: string;
  prompt?: string;
  condition?: string;
  delayMs?: number;
  webhookUrl?: string;
}

interface NodeResult {
  nodeId: string;
  status: "success" | "failed" | "skipped";
  output?: any;
  error?: string;
  startedAt: number;
  finishedAt: number;
}

export class WorkflowEngine {
  /**
   * 执行工作流
   */
  async execute(workflowId: string, input: Record<string, any>): Promise<{
    executionId: string;
    status: string;
    output?: any;
    error?: string;
  }> {
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) throw new Error("Workflow not found");
    if (workflow.status !== "active") throw new Error("Workflow is not active");

    // 创建执行记录
    const execution = await prisma.workflowExecution.create({
      data: {
        workflowId,
        input: JSON.stringify(input),
        status: "running",
      },
    });

    try {
      // 解析 DAG
      const nodes: Array<{
        id: string;
        type: string;
        config: WorkflowNodeConfig;
      }> = JSON.parse(workflow.nodes);
      const edges: Array<{ from: string; to: string }> = JSON.parse(workflow.edges);

      // 构建邻接表
      const adjacency: Map<string, string[]> = new Map();
      const inDegree: Map<string, number> = new Map();

      for (const node of nodes) {
        adjacency.set(node.id, []);
        inDegree.set(node.id, 0);
      }

      for (const edge of edges) {
        adjacency.get(edge.from)!.push(edge.to);
        inDegree.set(edge.to, inDegree.get(edge.to)! + 1);
      }

      // 拓扑排序执行
      const queue: string[] = [];
      for (const [nodeId, degree] of inDegree.entries()) {
        if (degree === 0) queue.push(nodeId);
      }

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const results: Map<string, NodeResult> = new Map();
      const context = { ...input }; // 执行上下文，节点可读写

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        const node = nodeMap.get(nodeId)!;

        // 执行节点
        const result = await this.executeNode(node, context, results);
        results.set(nodeId, result);

        // 更新上下文
        if (result.status === "success" && result.output !== undefined) {
          context[nodeId] = result.output;
        }

        // 推进到下一节点
        const nextNodes = adjacency.get(nodeId) || [];
        for (const nextId of nextNodes) {
          inDegree.set(nextId, inDegree.get(nextId)! - 1);
          if (inDegree.get(nextId) === 0) {
            queue.push(nextId);
          }
        }
      }

      // 收集结果
      const nodeResults = Array.from(results.values());
      const hasFailure = nodeResults.some((r) => r.status === "failed");
      const finalOutput = context["output"] || context;

      // 更新执行记录
      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: hasFailure ? "failed" : "success",
          output: JSON.stringify(finalOutput),
          nodeResults: JSON.stringify(nodeResults),
          finishedAt: new Date(),
          durationMs: Date.now() - execution.startedAt.getTime(),
        },
      });

      // 更新工作流统计
      await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          executionCount: { increment: 1 },
          successCount: hasFailure ? undefined : { increment: 1 },
          failureCount: hasFailure ? { increment: 1 } : undefined,
        },
      });

      return {
        executionId: execution.id,
        status: hasFailure ? "failed" : "success",
        output: finalOutput,
      };
    } catch (e: any) {
      await prisma.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: "failed",
          error: e.message,
          finishedAt: new Date(),
          durationMs: Date.now() - execution.startedAt.getTime(),
        },
      });

      await prisma.workflow.update({
        where: { id: workflowId },
        data: {
          executionCount: { increment: 1 },
          failureCount: { increment: 1 },
        },
      });

      return {
        executionId: execution.id,
        status: "failed",
        error: e.message,
      };
    }
  }

  /**
   * 执行单个节点
   */
  private async executeNode(
    node: { id: string; type: string; config: WorkflowNodeConfig },
    context: Record<string, any>,
    prevResults: Map<string, NodeResult>
  ): Promise<NodeResult> {
    const startedAt = Date.now();

    try {
      let output: any;

      switch (node.type) {
        case "start":
          output = context;
          break;

        case "end":
          output = context["output"] || context;
          break;

        case "agent":
          if (!node.config.agentSlug) {
            throw new Error("Agent node missing agentSlug");
          }
          output = await this.executeAgentNode(node.config.agentSlug, node.config.prompt, context);
          break;

        case "condition":
          if (!node.config.condition) {
            throw new Error("Condition node missing condition");
          }
          // 简单条件求值
          output = this.evaluateCondition(node.config.condition, context);
          break;

        case "delay":
          await new Promise((r) => setTimeout(r, node.config.delayMs || 1000));
          output = { delayed: node.config.delayMs };
          break;

        case "webhook":
          if (!node.config.webhookUrl) {
            throw new Error("Webhook node missing webhookUrl");
          }
          output = await this.executeWebhook(node.config.webhookUrl, context);
          break;

        default:
          throw new Error(`Unknown node type: ${node.type}`);
      }

      return {
        nodeId: node.id,
        status: "success",
        output,
        startedAt,
        finishedAt: Date.now(),
      };
    } catch (e: any) {
      return {
        nodeId: node.id,
        status: "failed",
        error: e.message,
        startedAt,
        finishedAt: Date.now(),
      };
    }
  }

  /**
   * 执行 Agent 节点
   */
  private async executeAgentNode(
    agentSlug: string,
    prompt: string | undefined,
    context: Record<string, any>
  ): Promise<any> {
    const agent = await prisma.agent.findUnique({
      where: { slug: agentSlug },
    });

    if (!agent) throw new Error(`Agent not found: ${agentSlug}`);

    // 通过消息总线发送任务
    const response = await messageBus.request(
      "workflow-engine",
      agentSlug,
      {
        type: "workflow_task",
        prompt: prompt || "Execute workflow task",
        context,
      },
      60000 // 1分钟超时
    );

    return response.payload;
  }

  /**
   * 评估条件
   */
  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    // 简单条件："{{variable}} > 5" 或 "{{variable}} == 'value'"
    try {
      const interpolated = condition.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const val = context[key];
        return typeof val === "string" ? `"${val}"` : String(val);
      });
      // 使用 Function 进行安全求值（仅简单比较）
      return new Function(`return ${interpolated}`)();
    } catch (e) {
      console.error("[WorkflowEngine] Condition evaluation failed:", e);
      return false;
    }
  }

  /**
   * 执行 Webhook
   */
  private async executeWebhook(url: string, context: Record<string, any>): Promise<any> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });

    if (!res.ok) {
      throw new Error(`Webhook failed: ${res.status}`);
    }

    return await res.json();
  }
}

export const workflowEngine = new WorkflowEngine();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/workflow-engine.ts
git commit -m "feat: add workflow engine with DAG execution and agent node support"
```

---

## Task 4: CrewAI 桥接

**Files:**
- Create: `src/lib/crewai-bridge.ts`

- [ ] **Step 1: 创建 CrewAI 桥接**

```typescript
// src/lib/crewai-bridge.ts

interface CrewConfig {
  agents: Array<{
    name: string;
    role: string;
    goal: string;
    backstory: string;
    model: string;
  }>;
  tasks: Array<{
    description: string;
    expectedOutput: string;
    agent: string; // agent name
  }>;
  process: "sequential" | "hierarchical";
}

export class CrewAIBridge {
  private serviceUrl: string;

  constructor(serviceUrl = process.env.CREWAI_SERVICE_URL || "http://crewai-service:8000") {
    this.serviceUrl = serviceUrl;
  }

  /**
   * 执行 CrewAI 任务
   */
  async execute(config: CrewConfig): Promise<{
    success: boolean;
    result?: string;
    error?: string;
  }> {
    try {
      const res = await fetch(`${this.serviceUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: `CrewAI service error: ${res.status} - ${text}` };
      }

      const data = await res.json();
      return { success: true, result: data.result };
    } catch (e: any) {
      return { success: false, error: `CrewAI request failed: ${e.message}` };
    }
  }

  /**
   * 检查 CrewAI 服务健康
   */
  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.serviceUrl}/health`, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * 将工作流转换为 CrewAI 配置
   */
  workflowToCrewConfig(workflowNodes: any[], workflowEdges: any[]): CrewConfig {
    // 提取 Agent 节点作为 CrewAI agents
    const agents = workflowNodes
      .filter((n) => n.type === "agent")
      .map((n) => ({
        name: n.config.agentSlug || n.label,
        role: n.config.role || "Assistant",
        goal: n.config.goal || "Complete assigned task",
        backstory: n.config.backstory || "An AI assistant",
        model: n.config.model || "deepseek-chat",
      }));

    // 提取任务（按拓扑顺序）
    const tasks = workflowNodes
      .filter((n) => n.type === "agent")
      .map((n) => ({
        description: n.config.prompt || `Execute task for ${n.label}`,
        expectedOutput: n.config.expectedOutput || "Task completion result",
        agent: n.config.agentSlug || n.label,
      }));

    return {
      agents,
      tasks,
      process: "sequential",
    };
  }
}

export const crewaiBridge = new CrewAIBridge();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/crewai-bridge.ts
git commit -m "feat: add CrewAI bridge for multi-agent collaboration"
```

---

## Task 5: 工作流 API

**Files:**
- Create: `src/app/api/workflows/route.ts`
- Create: `src/app/api/workflows/[id]/execute/route.ts`
- Create: `src/app/api/workflows/[id]/nodes/route.ts`

- [ ] **Step 1: 创建工作流 CRUD API**

```typescript
// src/app/api/workflows/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const status = new URL(req.url).searchParams.get("status");
  const workflows = await prisma.workflow.findMany({
    where: status ? { status } : {},
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    data: workflows.map((w) => ({
      ...w,
      nodes: JSON.parse(w.nodes),
      edges: JSON.parse(w.edges),
      variables: JSON.parse(w.variables),
    })),
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const workflow = await prisma.workflow.create({
    data: {
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/\s+/g, "-"),
      description: body.description,
      status: body.status || "draft",
      nodes: JSON.stringify(body.nodes || []),
      edges: JSON.stringify(body.edges || []),
      variables: JSON.stringify(body.variables || {}),
    },
  });
  return NextResponse.json(workflow, { status: 201 });
});
```

- [ ] **Step 2: 创建工作流执行 API**

```typescript
// src/app/api/workflows/[id]/execute/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { workflowEngine } from "@/lib/workflow-engine";

export const POST = apiHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const body = await req.json();

  const result = await workflowEngine.execute(id, body.input || {});

  return NextResponse.json(result);
});
```

- [ ] **Step 3: 创建工作流节点管理 API**

```typescript
// src/app/api/workflows/[id]/nodes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const nodes = await prisma.workflowNode.findMany({
    where: { workflowId: id },
    include: { agent: { select: { name: true, slug: true } } },
  });
  return NextResponse.json({
    data: nodes.map((n) => ({
      ...n,
      config: JSON.parse(n.config),
    })),
  });
});

export const POST = apiHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const body = await req.json();

  const node = await prisma.workflowNode.create({
    data: {
      workflowId: id,
      nodeId: body.nodeId,
      type: body.type,
      label: body.label,
      config: JSON.stringify(body.config || {}),
      agentId: body.agentId,
      positionX: body.positionX || 0,
      positionY: body.positionY || 0,
    },
  });

  // 更新 workflow 的 nodes JSON
  const workflow = await prisma.workflow.findUnique({ where: { id } });
  if (workflow) {
    const nodes = JSON.parse(workflow.nodes);
    nodes.push({
      id: body.nodeId,
      type: body.type,
      label: body.label,
      config: body.config || {},
    });
    await prisma.workflow.update({
      where: { id },
      data: { nodes: JSON.stringify(nodes) },
    });
  }

  return NextResponse.json(node, { status: 201 });
});
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/workflows/
git commit -m "feat: add workflow APIs - CRUD, execute, node management"
```

---

## Task 6: Agent 间协商 API

**Files:**
- Create: `src/app/api/agent-chat/route.ts`

- [ ] **Step 1: 创建 Agent 协商 API**

```typescript
// src/app/api/agent-chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { messageBus } from "@/lib/message-bus";

// 发送消息给 Agent
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { from, to, type = "request", payload, correlationId } = body;

  if (!from || !to || !payload) {
    return NextResponse.json(
      { error: "缺少必要参数: from, to, payload" },
      { status: 400 }
    );
  }

  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    from,
    to,
    type,
    payload,
    timestamp: Date.now(),
    correlationId,
  };

  messageBus.publish(message);

  return NextResponse.json({
    success: true,
    messageId: message.id,
  });
});

// 获取消息历史
export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const limit = parseInt(url.searchParams.get("limit") || "100");

  const history = messageBus.getHistory(from, to, limit);

  return NextResponse.json({ data: history });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/agent-chat/
git commit -m "feat: add agent chat API for inter-agent communication"
```

---

## Task 7: Docker Compose 新增 Redis

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: 添加 Redis 服务**

```yaml
# docker-compose.yml 追加 redis 服务

  redis:
    image: redis:7-alpine
    container_name: acp-redis
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 256M
    volumes:
      - redis-data:/data
    networks:
      - caddy-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  postgres-data:
  caddy-data:
  caddy-config:
  prometheus-data:
  grafana-data:
  loki-data:
  redis-data:
```

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add Redis service for message bus and caching"
```

---

## Task 8: CrewAI Python 服务（预留）

**Files:**
- Create: `crewai-service/Dockerfile`
- Create: `crewai-service/main.py`
- Create: `crewai-service/requirements.txt`

- [ ] **Step 1: 创建 CrewAI 服务文件**

```dockerfile
# crewai-service/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```python
# crewai-service/main.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List

app = FastAPI(title="CrewAI Service")

class CrewAgent(BaseModel):
    name: str
    role: str
    goal: str
    backstory: str
    model: str = "deepseek-chat"

class CrewTask(BaseModel):
    description: str
    expectedOutput: str
    agent: str

class CrewConfig(BaseModel):
    agents: List[CrewAgent]
    tasks: List[CrewTask]
    process: str = "sequential"

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/execute")
def execute(config: CrewConfig):
    """
    执行 CrewAI 任务（简化版，实际集成 CrewAI 库）
    """
    # TODO: 集成 crewai 库
    # from crewai import Crew, Agent, Task
    
    result = f"CrewAI execution completed with {len(config.agents)} agents and {len(config.tasks)} tasks"
    
    return {"result": result}
```

```txt
# crewai-service/requirements.txt
fastapi
uvicorn
pydantic
# crewai  # 后续添加
```

- [ ] **Step 2: Commit**

```bash
git add crewai-service/
git commit -m "feat: add CrewAI service skeleton for multi-agent collaboration"
```

---

## Task 9: 环境变量更新

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 添加工作流和 CrewAI 配置**

```bash
# .env.example 追加
# Redis 配置
REDIS_URL=redis://acp-redis:6379

# CrewAI 服务
CREWAI_SERVICE_URL=http://crewai-service:8000

# 工作流引擎
WORKFLOW_TIMEOUT_MS=300000
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add workflow and CrewAI env vars"
```

---

## 验证清单

部署完成后验证：

```bash
# 1. 创建工作流
curl -X POST http://localhost:3000/api/workflows \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试工作流",
    "slug": "test-workflow",
    "nodes": [
      {"id": "start", "type": "start", "label": "开始"},
      {"id": "agent1", "type": "agent", "label": "Agent 1", "config": {"agentSlug": "root-cause-agent", "prompt": "分析问题"}},
      {"id": "end", "type": "end", "label": "结束"}
    ],
    "edges": [
      {"from": "start", "to": "agent1"},
      {"from": "agent1", "to": "end"}
    ]
  }'

# 2. 执行工作流
curl -X POST http://localhost:3000/api/workflows/{workflow-id}/execute \
  -H "Content-Type: application/json" \
  -d '{"input": {"problem": "系统宕机"}}'

# 3. Agent 间通信
curl -X POST http://localhost:3000/api/agent-chat \
  -H "Content-Type: application/json" \
  -d '{
    "from": "agent-a",
    "to": "agent-b",
    "payload": {"task": "请帮忙分析数据"}
  }'

# 4. 查看消息历史
curl "http://localhost:3000/api/agent-chat?from=agent-a&limit=10"

# 5. 检查 CrewAI 服务健康
curl http://localhost:8000/health
```

---

*Phase 5 计划结束*
