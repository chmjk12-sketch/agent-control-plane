import { prisma } from "./prisma";

export interface McpToolRegistration {
  agentSlug: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: string;
    endpoint: string;
    method?: string;
  }>;
}

/**
 * 注册 Agent 的 MCP 工具（先删除旧工具再注册新工具）
 */
export async function registerTools(reg: McpToolRegistration): Promise<number> {
  const agent = await prisma.agent.findUnique({
    where: { slug: reg.agentSlug },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${reg.agentSlug}`);
  }

  // 先删除该 Agent 的所有旧工具
  await prisma.mcpTool.deleteMany({
    where: { agentId: agent.id },
  });

  // 批量创建新工具
  const result = await prisma.mcpTool.createMany({
    data: reg.tools.map((tool) => ({
      agentId: agent.id,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      endpoint: tool.endpoint,
      method: tool.method || "POST",
      enabled: true,
    })),
  });

  return result.count;
}

/**
 * 获取所有已注册的工具
 */
export async function listAllTools() {
  return prisma.mcpTool.findMany({
    where: { enabled: true },
    include: {
      agent: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 获取指定 Agent 的工具
 */
export async function listAgentTools(agentSlug: string) {
  const agent = await prisma.agent.findUnique({
    where: { slug: agentSlug },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentSlug}`);
  }

  return prisma.mcpTool.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * 代理执行工具调用
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const tool = await prisma.mcpTool.findFirst({
    where: { name: toolName, enabled: true },
    include: {
      agent: {
        select: { slug: true, endpoint: true, status: true },
      },
    },
  });

  if (!tool) {
    return { success: false, error: `Tool not found or disabled: ${toolName}` };
  }

  if (tool.agent.status !== "online") {
    return { success: false, error: `Agent is offline: ${tool.agent.slug}` };
  }

  try {
    const response = await fetch(tool.endpoint || tool.agent.endpoint!, {
      method: tool.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: toolName,
        params,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const result = await response.json();
    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 注销 Agent 的所有工具
 */
export async function unregisterAgentTools(agentSlug: string): Promise<number> {
  const agent = await prisma.agent.findUnique({
    where: { slug: agentSlug },
  });

  if (!agent) {
    throw new Error(`Agent not found: ${agentSlug}`);
  }

  const result = await prisma.mcpTool.deleteMany({
    where: { agentId: agent.id },
  });

  return result.count;
}

export const mcpHub = {
  registerTools,
  listAllTools,
  listAgentTools,
  executeTool,
  unregisterAgentTools,
};
