// Agent Spec 解析器 - 使用 Zod 验证 agent.yaml 规范

import { z } from "zod";

// --- Zod Schemas ---

const AgentSpecToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  endpoint: z.string().url().optional(),
  method: z.string().default("POST"),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});

const AgentSpecVariableSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(["string", "number", "boolean", "select"]).default("string"),
  default: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  description: z.string().optional(),
});

const AgentSpecHealthCheckSchema = z.object({
  path: z.string().default("/health"),
  interval: z.number().default(30),
  timeout: z.number().default(5),
});

const AgentSpecDeploySchema = z.object({
  strategy: z.enum(["blue-green", "rolling", "canary"]).default("blue-green"),
  port: z.number().default(3000),
  replicas: z.number().default(1),
  healthCheck: AgentSpecHealthCheckSchema.optional(),
});

const AgentSpecMcpSchema = z.object({
  enabled: z.boolean().default(false),
  toolsEndpoint: z.string().optional(),
});

const AgentSpecSchema = z.object({
  apiVersion: z.string().default("v1"),
  kind: z.literal("Agent"),
  metadata: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().optional(),
    icon: z.string().default("bot"),
    tags: z.array(z.string()).default([]),
    version: z.string().default("1.0.0"),
  }),
  spec: z.object({
    model: z.string().default("deepseek-chat"),
    template: z.string().optional(),
    endpoint: z.string().optional(),
    variables: z.array(AgentSpecVariableSchema).default([]),
    tools: z.array(AgentSpecToolSchema).default([]),
    deploy: AgentSpecDeploySchema.optional(),
    mcp: AgentSpecMcpSchema.optional(),
  }),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type AgentSpecVariable = z.infer<typeof AgentSpecVariableSchema>;
export type AgentSpecTool = z.infer<typeof AgentSpecToolSchema>;
export type AgentSpecDeploy = z.infer<typeof AgentSpecDeploySchema>;

// --- 解析验证 ---

export function parseAgentSpec(yamlContent: string): {
  success: boolean;
  data?: AgentSpec;
  errors?: z.ZodError;
} {
  try {
    // 简单的 YAML 解析（不依赖 yaml 库，使用 JSON-like 解析）
    // 如果需要完整 YAML 支持，可以后续引入 js-yaml
    const parsed = parseSimpleYaml(yamlContent);
    const result = AgentSpecSchema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, errors: result.error };
  } catch (err) {
    return {
      success: false,
      errors: new z.ZodError([
        {
          code: "custom",
          path: [],
          message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]),
    };
  }
}

// --- 转换为 Agent 创建数据 ---

export interface AgentCreateData {
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  tags?: string[];
  model?: string;
  templateId?: string;
  endpoint?: string;
  mcpEnabled?: boolean;
  mcpToolsEndpoint?: string;
  healthCheckPath?: string;
  healthCheckInterval?: number;
  internalPort?: number;
}

export function specToAgentData(spec: AgentSpec): AgentCreateData {
  const { metadata, spec: agentSpec } = spec;
  return {
    name: metadata.name,
    slug: metadata.slug,
    description: metadata.description,
    icon: metadata.icon,
    tags: metadata.tags,
    model: agentSpec.model,
    templateId: agentSpec.template,
    endpoint: agentSpec.endpoint,
    mcpEnabled: agentSpec.mcp?.enabled ?? false,
    mcpToolsEndpoint: agentSpec.mcp?.toolsEndpoint,
    healthCheckPath: agentSpec.deploy?.healthCheck?.path ?? "/health",
    healthCheckInterval: agentSpec.deploy?.healthCheck?.interval ?? 30,
    internalPort: agentSpec.deploy?.port ?? 3000,
  };
}

// --- 生成默认 YAML ---

export function generateDefaultAgentYaml(name: string, slug: string): string {
  return `apiVersion: v1
kind: Agent
metadata:
  name: "${name}"
  slug: "${slug}"
  description: "A new AI agent"
  icon: "bot"
  tags: []
  version: "1.0.0"
spec:
  model: "deepseek-chat"
  variables: []
  tools: []
  deploy:
    strategy: "blue-green"
    port: 3000
    replicas: 1
    healthCheck:
      path: "/health"
      interval: 30
      timeout: 5
  mcp:
    enabled: false
`;
}

// --- 简单 YAML 解析器 ---
// 注意：这是一个简化版 YAML 解析器，适用于 agent.yaml 这种结构较简单的场景
// 生产环境建议使用 js-yaml 库

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const lines = yaml.split("\n");
  const result: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown>; key?: string }[] = [
    { indent: -1, obj: result },
  ];

  for (const rawLine of lines) {
    // 计算缩进
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const indent = line.length - trimmed.length;

    // 弹出栈直到找到父级
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // 解析 key: value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (value === "" || value === "|" || value === ">") {
      // 这是一个嵌套对象，推入栈
      const newObj: Record<string, unknown> = {};
      parent.obj[key] = newObj;
      stack.push({ indent, obj: newObj, key });
    } else {
      // 解析值
      parent.obj[key] = parseYamlValue(value);
    }
  }

  return result;
}

function parseYamlValue(value: string): unknown {
  // 字符串（引号包裹）
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // 布尔值
  if (value === "true") return true;
  if (value === "false") return false;

  // 数字
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);

  // 数组（简化版，只支持 [a, b, c] 格式）
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => parseYamlValue(item.trim()));
  }

  // 默认为字符串
  return value;
}
