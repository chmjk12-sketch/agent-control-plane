import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, context) => {
  const { id } = await context.params;

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      health: { orderBy: { createdAt: "desc" }, take: 1 },
      deployments: { orderBy: { createdAt: "desc" }, take: 1 },
      healthCheckLogs: { orderBy: { checkedAt: "desc" }, take: 5 },
      _count: {
        select: {
          executions: true,
          alerts: { where: { resolved: false } },
        },
      },
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  // 本月成本
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyCost = await prisma.agentExecution.aggregate({
    where: {
      agentId: id,
      createdAt: { gte: startOfMonth },
      status: "success",
    },
    _sum: { cost: true },
  });

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    slug: agent.slug,
    status: agent.status,
    model: agent.model,
    environmentSlot: agent.environmentSlot,
    trafficWeight: agent.trafficWeight,
    containerName: agent.containerName,
    internalPort: agent.internalPort,
    registryImage: agent.registryImage,
    maxCostBudget: agent.maxCostBudget,
    monthlyCost: monthlyCost._sum.cost || 0,
    health: agent.health[0] || null,
    latestDeployment: agent.deployments[0] || null,
    recentHealthChecks: agent.healthCheckLogs,
    totalExecutions: agent._count.executions,
    unresolvedAlerts: agent._count.alerts,
  });
});
