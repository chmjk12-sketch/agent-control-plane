import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { createdAt: "desc" }, take: 10 },
      deployments: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { version: { select: { versionTag: true } } },
      },
      health: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayExecs = await prisma.agentExecution.findMany({
    where: { agentId: id, createdAt: { gte: today } },
  });

  const recentExecutions = await prisma.agentExecution.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    ...agent,
    tags: JSON.parse(agent.tags),
    health: agent.health[0] || null,
    todayRequests: todayExecs.length,
    todayCost: Math.round(todayExecs.reduce((s, e) => s + e.cost, 0) * 10000) / 10000,
    recentExecutions,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const body = await req.json();

  const updateData: any = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.model !== undefined) updateData.model = body.model;
  if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags);
  if (body.icon !== undefined) updateData.icon = body.icon;
  if (body.endpoint !== undefined) updateData.endpoint = body.endpoint;

  const agent = await prisma.agent.update({ where: { id }, data: updateData });
  return NextResponse.json(agent);
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;
  await prisma.agent.delete({ where: { id } });
  return NextResponse.json({ success: true });
});
