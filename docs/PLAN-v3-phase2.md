# Agent Control Plane V3.0 Phase 2 实施计划 — Agent 规范与模板引擎

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立 Agent 模板引擎、标准化 TRAE 规则、agent.yaml 规范解析、Mock 测试强制要求，实现 Agent 生产的标准化和可复制性。

**Architecture:** 在控制平面中新增 Template 模块，管理 Agent 模板仓库；新增 AgentSpec 解析器处理 agent.yaml；通过 GitHub API 实现模板 fork 和仓库创建。Agent 项目遵循标准化结构，TRAE 通过 `.trae/rules.md` 读取规范。

**Tech Stack:** Next.js 15, Prisma, GitHub API (REST), Docker, Python/FastAPI (模板示例), pytest

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改 | 新增 Template、AgentTemplate 表 |
| `src/lib/template-engine.ts` | 新增 | 模板引擎核心：fork、渲染、变量替换 |
| `src/lib/github-client.ts` | 新增 | GitHub API 封装（创建 repo、fork、文件操作） |
| `src/lib/agent-spec.ts` | 新增 | agent.yaml 解析与验证 |
| `src/app/api/templates/route.ts` | 新增 | 模板列表/创建 API |
| `src/app/api/templates/[id]/fork/route.ts` | 新增 | Fork 模板创建 Agent 项目 API |
| `src/app/api/agent-spec/validate/route.ts` | 新增 | agent.yaml 验证 API |
| `templates/agent-base/` | 新增 | 基础 Agent 模板文件（作为内置模板） |
| `.env.example` | 修改 | 新增 GITHUB_TOKEN、GITHUB_ORG 配置 |

---

## Task 1: Prisma Schema 扩展（Template 表）

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: 新增 Template 和 AgentTemplate 模型**

在 schema.prisma 中 Agent 模型之后添加：

```prisma
model Template {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String?
  type        String   @default("fastapi") // fastapi | nextjs | python-script
  icon        String   @default("bot")
  tags        String   @default("[]")
  
  // GitHub 模板仓库信息
  githubRepo  String   @map("github_repo") // 如: chmjk67-sketch/agent-template-fastapi
  githubBranch String  @default("main") @map("github_branch")
  
  // 模板元数据
  variables   String   @default("[]") // JSON: [{"name":"projectName","description":"项目名称"}]
  files       String   @default("[]") // JSON: 模板包含的关键文件列表
  
  // 统计
  forkCount   Int      @default(0) @map("fork_count")
  usageCount  Int      @default(0) @map("usage_count")
  
  // 自我迭代
  iterationVersion Int @default(1) @map("iteration_version")
  iterationNotes   String? @map("iteration_notes")
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  agents      Agent[]
}

// Agent 与 Template 的关联（可选，记录从哪个模板创建）
model AgentTemplate {
  id         String   @id @default(cuid())
  agentId    String   @map("agent_id")
  agent      Agent    @relation(fields: [agentId], references: [id], onDelete: Cascade)
  templateId String   @map("template_id")
  template   Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  variables  String   @default("{}") // 实际使用的变量值
  createdAt  DateTime @default(now()) @map("created_at")
  
  @@unique([agentId, templateId])
}
```

同时在 Agent 模型中添加 template 关联字段：

```prisma
model Agent {
  // ... 现有字段 ...
  
  // V3.0 新增：模板关联
  templateId   String?   @map("template_id")
  template     Template? @relation(fields: [templateId], references: [id])
  
  agentTemplates AgentTemplate[]
  
  // ... 现有关系 ...
}
```

- [ ] **Step 2: 生成迁移文件**

```bash
npx prisma migrate dev --name add_template_tables
```

- [ ] **Step 3: 重新生成 Prisma Client**

```bash
npx prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Template and AgentTemplate models for agent template engine"
```

---

## Task 2: GitHub API 客户端

**Files:**
- Create: `src/lib/github-client.ts`

- [ ] **Step 1: 创建 GitHub API 封装**

```typescript
// src/lib/github-client.ts

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_ORG = process.env.GITHUB_ORG || "";

interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  templateOwner?: string;
  templateRepo?: string;
}

interface RepoFile {
  path: string;
  content: string;
}

export class GitHubClient {
  private headers: Record<string, string>;

  constructor(token = GITHUB_TOKEN) {
    this.headers = {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    };
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${GITHUB_API_BASE}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options.headers },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${res.status}: ${text}`);
    }

    // 204 No Content
    if (res.status === 204) return null;
    return res.json();
  }

  /**
   * 从模板创建仓库（使用 GitHub 模板仓库功能）
   */
  async createRepoFromTemplate(options: CreateRepoOptions): Promise<{ html_url: string; clone_url: string; name: string }> {
    const { name, description, private: isPrivate = true, templateOwner, templateRepo } = options;

    if (!templateOwner || !templateRepo) {
      // 无模板，创建空仓库
      const body = {
        name,
        description: description || `Agent project: ${name}`,
        private: isPrivate,
        auto_init: true,
      };
      return this.request(`/orgs/${GITHUB_ORG}/repos`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    // 从模板创建
    const body = {
      name,
      description: description || `Agent project from template: ${templateRepo}`,
      private: isPrivate,
    };
    return this.request(`/repos/${templateOwner}/${templateRepo}/generate`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * 创建/更新文件
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch = "main"
  ): Promise<void> {
    // 先获取现有文件 SHA（如果存在）
    let sha: string | undefined;
    try {
      const existing = await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
      sha = existing.sha;
    } catch (e) {
      // 文件不存在，忽略
    }

    const body: any = {
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
    };
    if (sha) body.sha = sha;

    await this.request(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  /**
   * 批量创建文件
   */
  async createFiles(
    owner: string,
    repo: string,
    files: RepoFile[],
    message: string,
    branch = "main"
  ): Promise<void> {
    // GitHub 没有原生批量创建 API，逐个创建
    for (const file of files) {
      await this.createOrUpdateFile(owner, repo, file.path, file.content, `${message}: ${file.path}`, branch);
    }
  }

  /**
   * 获取模板仓库的文件列表
   */
  async getRepoContents(owner: string, repo: string, path = "", branch = "main"): Promise<any[]> {
    return this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  }

  /**
   * 获取文件内容
   */
  async getFileContent(owner: string, repo: string, path: string, branch = "main"): Promise<string> {
    const res = await this.request(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
    if (res.content) {
      return Buffer.from(res.content, "base64").toString("utf-8");
    }
    throw new Error("File content not available");
  }
}

export const githubClient = new GitHubClient();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/github-client.ts
git commit -m "feat: add GitHub API client for template fork and repo management"
```

---

## Task 3: Agent Spec 解析器（agent.yaml）

**Files:**
- Create: `src/lib/agent-spec.ts`

- [ ] **Step 1: 创建 agent.yaml 解析与验证模块**

```typescript
// src/lib/agent-spec.ts

import { z } from "zod";

// agent.yaml Zod Schema
export const AgentSpecSchema = z.object({
  apiVersion: z.literal("v1"),
  kind: z.literal("Agent"),
  metadata: z.object({
    name: z.string().min(1).max(64),
    slug: z.string().regex(/^[a-z0-9-]+$/).max(32),
    description: z.string().optional(),
    icon: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
  spec: z.object({
    runtime: z.object({
      type: z.enum(["docker", "python", "node"]).default("docker"),
      image: z.string().optional(),
      port: z.number().int().min(1).max(65535).default(80),
      resources: z.object({
        cpu: z.number().min(0.1).max(2).default(0.5),
        memory: z.string().regex(/^\d+(M|G)$/).default("512M"),
      }).default({ cpu: 0.5, memory: "512M" }),
    }).default({ type: "docker", port: 80 }),
    api: z.object({
      basePath: z.string().default("/api/v1"),
      healthCheck: z.string().default("/health"),
      endpoints: z.array(z.object({
        path: z.string(),
        method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
        description: z.string().optional(),
        input: z.record(z.any()).optional(),
        output: z.record(z.any()).optional(),
      })).default([]),
    }).default({ basePath: "/api/v1", healthCheck: "/health" }),
    ai: z.object({
      model: z.string().default("deepseek-chat"),
      temperature: z.number().min(0).max(2).default(0.7),
      maxTokens: z.number().int().positive().default(4096),
    }).default({ model: "deepseek-chat", temperature: 0.7 }),
    deploy: z.object({
      strategy: z.enum(["blue-green", "rolling", "recreate"]).default("blue-green"),
      replicas: z.number().int().positive().default(1),
    }).default({ strategy: "blue-green", replicas: 1 }),
    cost: z.object({
      budget: z.number().nonnegative().default(0),
      alertThreshold: z.number().int().min(1).max(100).default(80),
    }).default({ budget: 0, alertThreshold: 80 }),
    mcp: z.object({
      enabled: z.boolean().default(false),
      mode: z.enum(["embedded", "standalone"]).default("embedded"),
      toolsEndpoint: z.string().default("/mcp/tools"),
      exposedTools: z.array(z.object({
        name: z.string(),
        description: z.string(),
        inputSchema: z.record(z.any()),
      })).default([]),
    }).default({ enabled: false, mode: "embedded" }),
  }),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;

/**
 * 解析并验证 agent.yaml 内容
 */
export function parseAgentSpec(yamlContent: string): { success: true; spec: AgentSpec } | { success: false; errors: string[] } {
  try {
    // 简单 YAML 解析（控制平面不需要完整 YAML 库，用 JSON 近似）
    // 实际使用时可以引入 js-yaml
    const parsed = JSON.parse(yamlContent); // 临时：假设传入的是 JSON
    const result = AgentSpecSchema.safeParse(parsed);

    if (result.success) {
      return { success: true, spec: result.data };
    } else {
      return {
        success: false,
        errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
      };
    }
  } catch (e: any) {
    return { success: false, errors: [`YAML 解析失败: ${e.message}`] };
  }
}

/**
 * 将 AgentSpec 转换为控制平面的 Agent 创建数据
 */
export function specToAgentData(spec: AgentSpec): {
  name: string;
  slug: string;
  description?: string;
  model: string;
  tags: string;
  icon: string;
  internalPort: number;
  deployStrategy: string;
  healthCheckPath: string;
  maxCostBudget: number;
  mcpEnabled: boolean;
  mcpToolsEndpoint?: string;
} {
  return {
    name: spec.metadata.name,
    slug: spec.metadata.slug,
    description: spec.metadata.description,
    model: spec.spec.ai.model,
    tags: JSON.stringify(spec.metadata.tags),
    icon: spec.metadata.icon || "bot",
    internalPort: spec.spec.runtime.port,
    deployStrategy: spec.spec.deploy.strategy,
    healthCheckPath: spec.spec.api.healthCheck,
    maxCostBudget: spec.spec.cost.budget,
    mcpEnabled: spec.spec.mcp.enabled,
    mcpToolsEndpoint: spec.spec.mcp.enabled ? spec.spec.mcp.toolsEndpoint : undefined,
  };
}

/**
 * 生成默认 agent.yaml 内容
 */
export function generateDefaultAgentYaml(name: string, slug: string): string {
  return `apiVersion: v1
kind: Agent
metadata:
  name: ${name}
  slug: ${slug}
  description: "${name} Agent"
  tags: []
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
    endpoints: []
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
    mode: embedded
    toolsEndpoint: /mcp/tools
    exposedTools: []
`;
}
```

- [ ] **Step 2: 安装 zod 依赖**

```bash
npm install zod
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent-spec.ts package.json package-lock.json
git commit -m "feat: add agent.yaml spec parser and validator with zod schema"
```

---

## Task 4: 模板引擎核心

**Files:**
- Create: `src/lib/template-engine.ts`

- [ ] **Step 1: 创建模板引擎**

```typescript
// src/lib/template-engine.ts
import { GitHubClient } from "./github-client";
import { prisma } from "./prisma";

interface TemplateVariables {
  [key: string]: string;
}

interface ForkResult {
  repoUrl: string;
  cloneUrl: string;
  repoName: string;
  agentId: string;
}

export class TemplateEngine {
  private github: GitHubClient;

  constructor(github = new GitHubClient()) {
    this.github = github;
  }

  /**
   * Fork 模板创建新 Agent 项目
   */
  async forkTemplate(options: {
    templateId: string;
    agentName: string;
    agentSlug: string;
    variables?: TemplateVariables;
    userId?: string;
  }): Promise<ForkResult> {
    const { templateId, agentName, agentSlug, variables = {}, userId } = options;

    // 1. 获取模板信息
    const template = await prisma.template.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new Error("Template not found");

    // 2. 解析 GitHub 仓库信息
    const [templateOwner, templateRepo] = template.githubRepo.split("/");
    if (!templateOwner || !templateRepo) {
      throw new Error(`Invalid template repo: ${template.githubRepo}`);
    }

    // 3. 创建新仓库（从模板）
    const repoName = `${agentSlug}-agent`;
    const repo = await this.github.createRepoFromTemplate({
      name: repoName,
      description: `Agent: ${agentName}`,
      private: true,
      templateOwner,
      templateRepo,
    });

    // 4. 替换模板变量
    await this.applyVariables(templateOwner, repoName, variables, template.githubBranch);

    // 5. 在控制平面创建 Agent 记录
    const agent = await prisma.agent.create({
      data: {
        name: agentName,
        slug: agentSlug,
        description: variables.description || `Agent created from template: ${template.name}`,
        status: "offline",
        containerName: agentSlug,
        internalPort: 80,
        templateId: template.id,
      },
    });

    // 6. 记录 Agent-Template 关联
    await prisma.agentTemplate.create({
      data: {
        agentId: agent.id,
        templateId: template.id,
        variables: JSON.stringify(variables),
      },
    });

    // 7. 更新模板使用统计
    await prisma.template.update({
      where: { id: template.id },
      data: { forkCount: { increment: 1 }, usageCount: { increment: 1 } },
    });

    return {
      repoUrl: repo.html_url,
      cloneUrl: repo.clone_url,
      repoName,
      agentId: agent.id,
    };
  }

  /**
   * 应用模板变量替换
   */
  private async applyVariables(
    owner: string,
    repo: string,
    variables: TemplateVariables,
    branch = "main"
  ): Promise<void> {
    // 获取需要替换的文件列表
    const filesToProcess = [
      "agent.yaml",
      "README.md",
      "src/config.py",
      "src/main.py",
      "package.json",
    ];

    for (const filePath of filesToProcess) {
      try {
        const content = await this.github.getFileContent(owner, repo, filePath, branch);
        let newContent = content;

        // 简单变量替换: {{variableName}} → value
        for (const [key, value] of Object.entries(variables)) {
          newContent = newContent.replace(
            new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
            value
          );
        }

        if (newContent !== content) {
          await this.github.createOrUpdateFile(
            owner,
            repo,
            filePath,
            newContent,
            `chore: apply template variables`,
            branch
          );
        }
      } catch (e) {
        // 文件不存在，跳过
        console.log(`Skip ${filePath}: not found in template`);
      }
    }
  }

  /**
   * 获取模板列表
   */
  async listTemplates(type?: string) {
    const where = type ? { type } : {};
    return prisma.template.findMany({
      where,
      orderBy: { usageCount: "desc" },
    });
  }

  /**
   * 创建内置模板记录
   */
  async seedBuiltinTemplates(): Promise<void> {
    const builtins = [
      {
        name: "FastAPI Agent 模板",
        slug: "fastapi-agent",
        description: "基于 Python + FastAPI 的标准 Agent 模板",
        type: "fastapi",
        icon: "🐍",
        tags: JSON.stringify(["python", "fastapi", "backend"]),
        githubRepo: "chmjk67-sketch/agent-template-fastapi",
        variables: JSON.stringify([
          { name: "projectName", description: "项目名称", required: true },
          { name: "agentSlug", description: "Agent 标识", required: true },
          { name: "description", description: "项目描述", required: false },
          { name: "port", description: "服务端口", default: "80" },
        ]),
      },
      {
        name: "Next.js Agent 模板",
        slug: "nextjs-agent",
        description: "基于 Next.js 的全栈 Agent 模板",
        type: "nextjs",
        icon: "⚡",
        tags: JSON.stringify(["nextjs", "react", "fullstack"]),
        githubRepo: "chmjk67-sketch/agent-template-nextjs",
        variables: JSON.stringify([
          { name: "projectName", description: "项目名称", required: true },
          { name: "agentSlug", description: "Agent 标识", required: true },
        ]),
      },
    ];

    for (const tmpl of builtins) {
      await prisma.template.upsert({
        where: { slug: tmpl.slug },
        update: tmpl,
        create: tmpl,
      });
    }
  }
}

export const templateEngine = new TemplateEngine();
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/template-engine.ts
git commit -m "feat: add template engine for forking and variable substitution"
```

---

## Task 5: 模板管理 API

**Files:**
- Create: `src/app/api/templates/route.ts`
- Create: `src/app/api/templates/[id]/fork/route.ts`

- [ ] **Step 1: 创建模板列表/创建 API**

```typescript
// src/app/api/templates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";
import { templateEngine } from "@/lib/template-engine";

export const GET = apiHandler(async (req: NextRequest) => {
  const type = new URL(req.url).searchParams.get("type") || undefined;
  const templates = await templateEngine.listTemplates(type);
  return NextResponse.json({
    data: templates.map((t) => ({
      ...t,
      tags: JSON.parse(t.tags),
      variables: JSON.parse(t.variables),
    })),
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const template = await prisma.template.create({
    data: {
      name: body.name,
      slug: body.slug,
      description: body.description,
      type: body.type || "fastapi",
      icon: body.icon || "bot",
      tags: JSON.stringify(body.tags || []),
      githubRepo: body.githubRepo,
      githubBranch: body.githubBranch || "main",
      variables: JSON.stringify(body.variables || []),
      files: JSON.stringify(body.files || []),
    },
  });
  return NextResponse.json(template, { status: 201 });
});
```

- [ ] **Step 2: 创建 Fork 模板 API**

```typescript
// src/app/api/templates/[id]/fork/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { templateEngine } from "@/lib/template-engine";

export const POST = apiHandler(async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  const { id } = await context.params;
  const body = await req.json();

  if (!body.agentName || !body.agentSlug) {
    return NextResponse.json(
      { error: "缺少必要参数: agentName, agentSlug" },
      { status: 400 }
    );
  }

  const result = await templateEngine.forkTemplate({
    templateId: id,
    agentName: body.agentName,
    agentSlug: body.agentSlug,
    variables: body.variables || {},
    userId: body.userId,
  });

  return NextResponse.json({
    success: true,
    repoUrl: result.repoUrl,
    cloneUrl: result.cloneUrl,
    repoName: result.repoName,
    agentId: result.agentId,
    message: `Agent 项目已创建: ${result.repoUrl}`,
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/templates/
git commit -m "feat: add template management APIs - list, create, fork"
```

---

## Task 6: agent.yaml 验证 API

**Files:**
- Create: `src/app/api/agent-spec/validate/route.ts`

- [ ] **Step 1: 创建验证 API**

```typescript
// src/app/api/agent-spec/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { parseAgentSpec, specToAgentData } from "@/lib/agent-spec";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { yamlContent } = body;

  if (!yamlContent) {
    return NextResponse.json(
      { error: "缺少 yamlContent 参数" },
      { status: 400 }
    );
  }

  const result = parseAgentSpec(yamlContent);

  if (!result.success) {
    return NextResponse.json(
      { valid: false, errors: result.errors },
      { status: 400 }
    );
  }

  const agentData = specToAgentData(result.spec);

  return NextResponse.json({
    valid: true,
    spec: result.spec,
    agentData,
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/agent-spec/
git commit -m "feat: add agent.yaml validation API"
```

---

## Task 7: 内置基础模板文件

**Files:**
- Create: `templates/agent-base/agent.yaml`
- Create: `templates/agent-base/Dockerfile`
- Create: `templates/agent-base/.trae/rules.md`
- Create: `templates/agent-base/src/main.py`
- Create: `templates/agent-base/tests/test_health.py`

- [ ] **Step 1: 创建基础模板文件**

```yaml
# templates/agent-base/agent.yaml
apiVersion: v1
kind: Agent
metadata:
  name: "{{projectName}}"
  slug: "{{agentSlug}}"
  description: "{{description}}"
  tags: []
spec:
  runtime:
    type: docker
    port: {{port}}
    resources:
      cpu: 0.5
      memory: 512M
  api:
    basePath: /api/v1
    healthCheck: /health
    endpoints: []
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
    mode: embedded
    toolsEndpoint: /mcp/tools
    exposedTools: []
```

```dockerfile
# templates/agent-base/Dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE {{port}}

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:{{port}}/health')"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "{{port}}"]
```

```markdown
# templates/agent-base/.trae/rules.md
# Agent 生成规则

## 1. 技术栈
- 后端: Python 3.11 + FastAPI + Pydantic v2
- AI: OpenAI SDK (兼容 DeepSeek/Claude)
- 部署: Docker + Docker Compose

## 2. 强制端点
- GET /health → {"status": "ok"}
- GET /metrics → Prometheus 格式
- POST /api/v1/{action} → 业务 API

## 3. 代码规范
1. API 返回标准格式: `{"code": 0, "data": {}, "message": "success"}`
2. 使用结构化 JSON 日志
3. 所有外部调用必须可配置超时

## 4. 控制平面集成
- 读取环境变量: `CP_API_KEY`, `CP_BASE_URL`, `AGENT_SLUG`
- 启动时向控制平面注册
- 每次请求上报执行记录（异步）

## 5. 测试要求（强制）
- tests/ 目录下基于 pytest 编写
- 所有外部 HTTP 调用必须 Mock
- CI/CD 中不配置真实 API Key
```

```python
# templates/agent-base/src/main.py
from fastapi import FastAPI
from fastapi.responses import JSONResponse
import os

app = FastAPI(title="{{projectName}}", version="1.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "agent": "{{agentSlug}}"}

@app.get("/metrics")
def metrics():
    # TODO: 返回 Prometheus 格式指标
    return "# metrics"

@app.get("/api/v1/hello")
def hello():
    return {"code": 0, "data": {"message": "Hello from {{agentSlug}}"}, "message": "success"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "{{port}}"))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

```python
# templates/agent-base/tests/test_health.py
import pytest
from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_hello():
    response = client.get("/api/v1/hello")
    assert response.status_code == 200
    assert response.json()["code"] == 0
```

- [ ] **Step 2: Commit**

```bash
git add templates/
git commit -m "feat: add built-in agent base template files"
```

---

## Task 8: 环境变量配置更新

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 添加 GitHub 相关配置**

```bash
# .env.example 追加
# GitHub 配置（模板引擎使用）
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=chmjk67-sketch

# 控制平面通知密钥
CP_NOTIFY_SECRET=your-secret-key-here
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: add GITHUB_TOKEN and GITHUB_ORG to env example"
```

---

## 验证清单

部署完成后验证：

```bash
# 1. 检查模板列表 API
curl http://localhost:3000/api/templates

# 2. 验证 agent.yaml
curl -X POST http://localhost:3000/api/agent-spec/validate \
  -H "Content-Type: application/json" \
  -d '{"yamlContent":"{\"apiVersion\":\"v1\",\"kind\":\"Agent\",\"metadata\":{\"name\":\"test\",\"slug\":\"test-agent\"},\"spec\":{}}"}'

# 3. Fork 模板（需要配置 GITHUB_TOKEN）
curl -X POST http://localhost:3000/api/templates/{template-id}/fork \
  -H "Content-Type: application/json" \
  -d '{"agentName":"测试Agent","agentSlug":"test-agent","variables":{"projectName":"测试Agent","port":"8080"}}'

# 4. 检查数据库
npx prisma studio
```

---

*Phase 2 计划结束*
