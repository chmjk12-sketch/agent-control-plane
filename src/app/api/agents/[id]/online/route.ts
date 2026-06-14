import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const POST = apiHandler(async (req: NextRequest, context) => {
  const { id } = await context.params;

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  // 更新状态为在线
  await prisma.agent.update({
    where: { id },
    data: {
      status: "online",
      updatedAt: new Date(),
    },
  });

  // 记录告警恢复
  await prisma.alert.create({
    data: {
      agentId: id,
      type: "deployment",
      severity: "info",
      message: `Agent ${agent.name} 已上架`,
    },
  });

  return NextResponse.json({ success: true, status: "online" });
});
