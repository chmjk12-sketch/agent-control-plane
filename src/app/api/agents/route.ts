import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, parsePaginationParams } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const { page, limit, search, status, skip } = parsePaginationParams(req);
  const tag = new URL(req.url).searchParams.get("tag") || "";

  const where: any = {};
  if (search) where.name = { contains: search };
  if (status) where.status = status;
  if (tag) where.tags = { contains: tag };

  const [agents, total] = await Promise.all([
    prisma.agent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { executions: true } },
      },
    }),
    prisma.agent.count({ where }),
  ]);

  // Get today's stats for each agent
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const agentsWithStats = await Promise.all(
    agents.map(async (agent) => {
      const todayExecs = await prisma.agentExecution.findMany({
        where: { agentId: agent.id, createdAt: { gte: today } },
      });
      const latestDeployment = await prisma.deployment.findFirst({
        where: { agentId: agent.id },
        orderBy: { createdAt: "desc" },
        include: { version: { select: { versionTag: true } } },
      });
      const health = await prisma.agentHealth.findFirst({
        where: { agentId: agent.id },
        orderBy: { createdAt: "desc" },
      });

      return {
        ...agent,
        tags: JSON.parse(agent.tags),
        todayRequests: todayExecs.length,
        todayCost: Math.round(todayExecs.reduce((s, e) => s + e.cost, 0) * 10000) / 10000,
        currentVersion: latestDeployment?.version?.versionTag || "N/A",
        lastDeployedAt: latestDeployment?.deployedAt || null,
        health,
        executionCount: agent._count.executions,
      };
    })
  );

  return NextResponse.json({
    data: agentsWithStats,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const agent = await prisma.agent.create({
    data: {
      name: body.name,
      slug: body.slug || body.name.toLowerCase().replace(/\s+/g, "-"),
      description: body.description,
      model: body.model || "gpt-4",
      tags: JSON.stringify(body.tags || []),
      icon: body.icon || "bot",
      endpoint: body.endpoint,
      status: "offline",
    },
  });
  return NextResponse.json(agent, { status: 201 });
});
