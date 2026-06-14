import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  // V2.0: 从定时健康检查结果读取，优先取 HealthCheckLog 的最新数据
  const agents = await prisma.agent.findMany({
    include: {
      healthCheckLogs: {
        orderBy: { checkedAt: "desc" },
        take: 1,
      },
      health: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const result = agents.map((agent) => {
    const latestLog = agent.healthCheckLogs[0];
    const latestHealth = agent.health[0];

    return {
      id: latestHealth?.id || agent.id,
      agentId: agent.id,
      agent: {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
      },
      status: agent.status,
      uptime: latestHealth?.uptime || 0,
      memoryMb: latestHealth?.memoryMb || 0,
      cpuPercent: latestHealth?.cpuPercent || 0,
      restartCount: latestHealth?.restartCount || 0,
      lastHeartbeat: latestLog?.checkedAt || latestHealth?.lastHeartbeat || null,
      responseTimeMs: latestLog?.responseTimeMs || null,
      healthCheckStatus: latestLog?.status || null,
      createdAt: latestHealth?.createdAt || agent.createdAt,
    };
  });

  return NextResponse.json(result);
});
