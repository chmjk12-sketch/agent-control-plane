import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const agents = await prisma.agent.findMany();
  const totalAgents = agents.length;
  const onlineAgents = agents.filter((a) => a.status === "online").length;
  const offlineAgents = agents.filter((a) => a.status === "offline").length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayExecutions = await prisma.agentExecution.findMany({
    where: { createdAt: { gte: today } },
  });

  const todayRequests = todayExecutions.length;
  const todayTokens = todayExecutions.reduce((sum, e) => sum + e.totalTokens, 0);
  const todayCost = todayExecutions.reduce((sum, e) => sum + e.cost, 0);
  const avgLatency = todayExecutions.length > 0
    ? Math.round(todayExecutions.reduce((sum, e) => sum + e.latencyMs, 0) / todayExecutions.length)
    : 0;

  const recentDeployments = await prisma.deployment.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    include: { agent: { select: { name: true, slug: true } }, version: { select: { versionTag: true } } },
  });

  const unhealthyAgents = await prisma.agentHealth.findMany({
    where: { status: { in: ["degraded", "offline"] } },
    include: { agent: { select: { name: true, slug: true, id: true } } },
    orderBy: { lastHeartbeat: "desc" },
    take: 5,
  });

  // Daily cost trend (last 7 days)
  const dailyCosts = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(today);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const execs = await prisma.agentExecution.findMany({
      where: { createdAt: { gte: dayStart, lt: dayEnd } },
    });
    dailyCosts.push({
      date: dayStart.toISOString().split("T")[0],
      cost: Math.round(execs.reduce((sum, e) => sum + e.cost, 0) * 10000) / 10000,
      requests: execs.length,
    });
  }

  // Agent cost breakdown (today)
  const agentCosts = [];
  for (const agent of agents) {
    const execs = todayExecutions.filter((e) => e.agentId === agent.id);
    agentCosts.push({
      name: agent.name,
      slug: agent.slug,
      cost: Math.round(execs.reduce((sum, e) => sum + e.cost, 0) * 10000) / 10000,
      requests: execs.length,
    });
  }

  return NextResponse.json({
    stats: {
      totalAgents,
      onlineAgents,
      offlineAgents,
      todayRequests,
      todayTokens,
      todayCost: Math.round(todayCost * 10000) / 10000,
      avgLatency,
    },
    recentDeployments,
    unhealthyAgents,
    dailyCosts,
    agentCosts,
  });
});
