import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, parsePaginationParams } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const { page, limit, skip } = parsePaginationParams(req);
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") || "";
  const type = url.searchParams.get("type") || "";
  const severity = url.searchParams.get("severity") || "";
  const unresolved = url.searchParams.get("unresolved") === "true";

  const where: any = {};
  if (agentId) where.agentId = agentId;
  if (type) where.type = type;
  if (severity) where.severity = severity;
  if (unresolved) where.resolved = false;

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        agent: { select: { name: true, slug: true } },
      },
    }),
    prisma.alert.count({ where }),
  ]);

  return NextResponse.json({
    data: alerts,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// PATCH: 解决告警
export const PATCH = apiHandler(async (req: NextRequest) => {
  const { alertIds } = await req.json();

  if (!Array.isArray(alertIds) || alertIds.length === 0) {
    return NextResponse.json(
      { error: "alertIds 必须是数组" },
      { status: 400 }
    );
  }

  await prisma.alert.updateMany({
    where: { id: { in: alertIds } },
    data: { resolved: true, resolvedAt: new Date() },
  });

  return NextResponse.json({ success: true, resolved: alertIds.length });
});
