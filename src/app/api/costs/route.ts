import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // All executions
  const allExecutions = await prisma.agentExecution.findMany();
  const todayExecutions = allExecutions.filter((e) => e.createdAt >= todayStart);
  const monthExecutions = allExecutions.filter((e) => e.createdAt >= monthStart);

  // Total tokens
  const totalTokensAll = allExecutions.reduce((sum, e) => sum + e.totalTokens, 0);
  const totalTokensToday = todayExecutions.reduce((sum, e) => sum + e.totalTokens, 0);
  const totalTokensMonth = monthExecutions.reduce((sum, e) => sum + e.totalTokens, 0);

  // Total cost
  const totalCostAll = allExecutions.reduce((sum, e) => sum + e.cost, 0);
  const totalCostToday = todayExecutions.reduce((sum, e) => sum + e.cost, 0);
  const totalCostMonth = monthExecutions.reduce((sum, e) => sum + e.cost, 0);

  // Average cost per execution
  const avgCostPerExecution = allExecutions.length > 0
    ? totalCostAll / allExecutions.length
    : 0;

  // Active agents count (unique agentIds with executions)
  const activeAgentIds = new Set(allExecutions.map((e) => e.agentId));
  const activeAgentCount = activeAgentIds.size;

  // Daily trend (last 7 days)
  const dailyTrend = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayExecs = allExecutions.filter(
      (e) => e.createdAt >= dayStart && e.createdAt < dayEnd
    );
    dailyTrend.push({
      date: dayStart.toISOString().split("T")[0],
      inputTokens: dayExecs.reduce((sum, e) => sum + e.inputTokens, 0),
      outputTokens: dayExecs.reduce((sum, e) => sum + e.outputTokens, 0),
      totalTokens: dayExecs.reduce((sum, e) => sum + e.totalTokens, 0),
    });
  }

  // Agent ranking (group by agent)
  const agents = await prisma.agent.findMany();
  const agentRanking = agents
    .map((agent) => {
      const agentExecs = allExecutions.filter((e) => e.agentId === agent.id);
      const totalExecs = agentExecs.length;
      if (totalExecs === 0) return null;
      return {
        agentId: agent.id,
        agentName: agent.name,
        agentSlug: agent.slug,
        totalTokens: agentExecs.reduce((sum, e) => sum + e.totalTokens, 0),
        totalCost: Math.round(agentExecs.reduce((sum, e) => sum + e.cost, 0) * 10000) / 10000,
        avgLatency: Math.round(
          agentExecs.reduce((sum, e) => sum + e.latencyMs, 0) / totalExecs
        ),
        executionCount: totalExecs,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.totalTokens - a!.totalTokens);

  return NextResponse.json({
    stats: {
      totalTokensAll,
      totalTokensToday,
      totalTokensMonth,
      totalCostAll: Math.round(totalCostAll * 10000) / 10000,
      totalCostToday: Math.round(totalCostToday * 10000) / 10000,
      totalCostMonth: Math.round(totalCostMonth * 10000) / 10000,
      avgCostPerExecution: Math.round(avgCostPerExecution * 10000) / 10000,
      activeAgentCount,
      totalExecutions: allExecutions.length,
    },
    dailyTrend,
    agentRanking,
  });
});
