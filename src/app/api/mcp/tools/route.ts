import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const agentSlug = url.searchParams.get("agentSlug");

  if (agentSlug) {
    // 获取指定 Agent 的工具
    const agent = await prisma.agent.findUnique({
      where: { slug: agentSlug },
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

    return NextResponse.json({ tools });
  }

  // 获取所有工具
  const tools = await prisma.mcpTool.findMany({
    where: { enabled: true },
    include: {
      agent: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tools });
});
