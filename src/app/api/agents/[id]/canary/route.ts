import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const POST = apiHandler(async (req: NextRequest, context) => {
  const { id } = await context.params;
  const { weight } = await req.json();

  if (typeof weight !== "number" || weight < 0 || weight > 100) {
    return NextResponse.json(
      { error: "weight 必须是 0-100 之间的数字" },
      { status: 400 }
    );
  }

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  // 更新权重
  await prisma.agent.update({
    where: { id },
    data: {
      trafficWeight: weight,
      updatedAt: new Date(),
    },
  });

  // 记录部署事件
  await prisma.alert.create({
    data: {
      agentId: id,
      type: "deployment",
      severity: "info",
      message: `灰度权重调整为 ${weight}%`,
    },
  });

  return NextResponse.json({
    success: true,
    weight,
    message: `灰度权重已设置为 ${weight}%`,
  });
});
