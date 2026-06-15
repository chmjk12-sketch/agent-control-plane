import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, parsePaginationParams } from "@/lib/api-helpers";

// GET: 获取告警规则列表
export const GET = apiHandler(async (req: NextRequest) => {
  const { page, limit, skip } = parsePaginationParams(req);
  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId") || "";
  const severity = url.searchParams.get("severity") || "";
  const enabled = url.searchParams.get("enabled") || "";
  const global = url.searchParams.get("global") || "";

  const where: any = {};
  if (agentId) where.agentId = agentId;
  if (severity) where.severity = severity;
  if (enabled !== "") where.enabled = enabled === "true";
  if (global !== "") where.global = global === "true";

  const [rules, total] = await Promise.all([
    prisma.alertRule.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        agent: { select: { name: true, slug: true } },
      },
    }),
    prisma.alertRule.count({ where }),
  ]);

  return NextResponse.json({
    data: rules,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// POST: 创建告警规则
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { name, description, metric, operator, threshold, duration, agentId, global, severity, channels } = body;

  if (!name || !metric || !operator || threshold === undefined) {
    return NextResponse.json(
      { error: "name, metric, operator, threshold 为必填字段" },
      { status: 400 }
    );
  }

  const validOperators = ["gt", "gte", "lt", "lte", "eq", "neq"];
  if (!validOperators.includes(operator)) {
    return NextResponse.json(
      { error: `operator 必须是: ${validOperators.join(", ")}` },
      { status: 400 }
    );
  }

  const rule = await prisma.alertRule.create({
    data: {
      name,
      description: description || null,
      metric,
      operator,
      threshold: Number(threshold),
      duration: duration ? Number(duration) : 5,
      agentId: agentId || null,
      global: global || false,
      severity: severity || "warning",
      channels: channels ? JSON.stringify(channels) : "[]",
    },
  });

  return NextResponse.json({ data: rule }, { status: 201 });
});
