import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";
import { Prisma } from "@prisma/client";

// GET: 指标概览，支持按天聚合
export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "7");
  const agentId = url.searchParams.get("agentId") || "";

  const now = new Date();
  const startOfPeriod = new Date(now);
  startOfPeriod.setDate(startOfPeriod.getDate() - days);
  startOfPeriod.setHours(0, 0, 0, 0);

  // 基础过滤条件
  const execWhere: any = {
    createdAt: { gte: startOfPeriod },
  };
  if (agentId) execWhere.agentId = agentId;

  // 按天聚合查询
  const dailyMetrics = await prisma.$queryRaw<
    Array<{
      date: string;
      total_requests: bigint;
      total_tokens: bigint;
      total_cost: number;
      avg_latency: number;
      success_count: bigint;
      error_count: bigint;
    }>
  >(Prisma.sql`
    SELECT
      DATE("created_at") as date,
      COUNT(*) as total_requests,
      COALESCE(SUM("total_tokens"), 0) as total_tokens,
      COALESCE(SUM("cost"), 0) as total_cost,
      COALESCE(AVG("latency_ms"), 0) as avg_latency,
      COUNT(*) FILTER (WHERE "status" = 'success') as success_count,
      COUNT(*) FILTER (WHERE "status" = 'error') as error_count
    FROM "AgentExecution"
    WHERE "created_at" >= ${startOfPeriod.toISOString()}
    ${agentId ? Prisma.sql`AND "agent_id" = ${agentId}` : Prisma.sql``}
    GROUP BY DATE("created_at")
    ORDER BY date DESC
  `);

  // 总体统计
  const [totalExecs, totalCost, totalTokens] = await Promise.all([
    prisma.agentExecution.count({ where: execWhere }),
    prisma.agentExecution.aggregate({
      where: execWhere,
      _sum: { cost: true },
    }),
    prisma.agentExecution.aggregate({
      where: execWhere,
      _sum: { totalTokens: true },
    }),
  ]);

  // Agent 级别统计（Top 10）
  const agentStats = await prisma.agentExecution.groupBy({
    by: ["agentId"],
    where: execWhere,
    _count: { id: true },
    _sum: { cost: true, totalTokens: true, latencyMs: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  // 关联 Agent 名称
  const agentIds = agentStats.map((s) => s.agentId);
  const agents = await prisma.agent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true, slug: true },
  });
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const agentBreakdown = agentStats.map((s) => ({
    agentId: s.agentId,
    agentName: agentMap.get(s.agentId)?.name || "Unknown",
    agentSlug: agentMap.get(s.agentId)?.slug || "",
    requests: s._count.id,
    cost: Math.round((s._sum.cost || 0) * 10000) / 10000,
    tokens: s._sum.totalTokens || 0,
    avgLatency: s._count.id > 0 ? Math.round((s._sum.latencyMs || 0) / s._count.id) : 0,
  }));

  return NextResponse.json({
    period: {
      start: startOfPeriod.toISOString(),
      end: now.toISOString(),
      days,
    },
    summary: {
      totalRequests: totalExecs,
      totalCost: Math.round((totalCost._sum.cost || 0) * 10000) / 10000,
      totalTokens: totalTokens._sum.totalTokens || 0,
    },
    daily: dailyMetrics.map((d) => ({
      date: d.date,
      requests: Number(d.total_requests),
      tokens: Number(d.total_tokens),
      cost: Math.round(d.total_cost * 10000) / 10000,
      avgLatency: Math.round(d.avg_latency),
      successCount: Number(d.success_count),
      errorCount: Number(d.error_count),
    })),
    agentBreakdown,
  });
});
