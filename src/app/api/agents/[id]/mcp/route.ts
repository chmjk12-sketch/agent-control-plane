import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, context) => {
  const { id } = await context.params;

  const agent = await prisma.agent.findUnique({
    where: { id },
  });

  if (!agent) {
    return NextResponse.json(
      { error: "Agent 不存在" },
      { status: 404 }
    );
  }

  const tools = await prisma.mcpTool.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    agent: {
      id: agent.id,
      name: agent.name,
      slug: agent.slug,
    },
    tools,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, context) => {
  const { id } = await context.params;
  const body = await req.json();
  const { toolId, enabled } = body;

  if (!toolId || enabled === undefined) {
    return NextResponse.json(
      { error: "缺少必要参数：toolId 和 enabled" },
      { status: 400 }
    );
  }

  // 验证 tool 属于该 Agent
  const tool = await prisma.mcpTool.findFirst({
    where: { id: toolId, agentId: id },
  });

  if (!tool) {
    return NextResponse.json(
      { error: "工具不存在或不属于该 Agent" },
      { status: 404 }
    );
  }

  const updated = await prisma.mcpTool.update({
    where: { id: toolId },
    data: { enabled },
  });

  return NextResponse.json({
    success: true,
    tool: updated,
  });
});
