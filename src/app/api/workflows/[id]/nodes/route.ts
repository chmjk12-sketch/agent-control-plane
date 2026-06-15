import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

// GET: 获取工作流节点列表
export const GET = apiHandler(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const { id } = await context.params;

  const nodes = await prisma.workflowNode.findMany({
    where: { workflowId: id },
    orderBy: { createdAt: "asc" },
    include: {
      agent: { select: { name: true, slug: true, status: true } },
    },
  });

  return NextResponse.json({ data: nodes });
});

// POST: 添加节点到工作流
export const POST = apiHandler(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const { id } = await context.params;
  const body = await req.json();
  const { nodeId, type, label, config, agentId, positionX, positionY } = body;

  if (!nodeId || !type || !label) {
    return NextResponse.json(
      { error: "nodeId, type, label 为必填字段" },
      { status: 400 }
    );
  }

  const validTypes = ["start", "end", "agent", "condition", "delay", "webhook"];
  if (!validTypes.includes(type)) {
    return NextResponse.json(
      { error: `type 必须是: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  // 检查节点 ID 唯一性
  const existing = await prisma.workflowNode.findFirst({
    where: { workflowId: id, nodeId },
  });
  if (existing) {
    return NextResponse.json(
      { error: "nodeId 在该工作流中已存在" },
      { status: 409 }
    );
  }

  const node = await prisma.workflowNode.create({
    data: {
      workflowId: id,
      nodeId,
      type,
      label,
      config: config ? JSON.stringify(config) : "{}",
      agentId: agentId || null,
      positionX: positionX ?? 0,
      positionY: positionY ?? 0,
    },
  });

  return NextResponse.json({ data: node }, { status: 201 });
});
