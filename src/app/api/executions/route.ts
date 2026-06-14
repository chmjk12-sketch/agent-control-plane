import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, parsePaginationParams } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const { page, limit, search, status, agentId, skip } = parsePaginationParams(req);

  const where: any = {};
  if (status) where.status = status;
  if (agentId) where.agentId = agentId;
  if (search) {
    where.OR = [
      { requestId: { contains: search } },
      { agent: { name: { contains: search } } },
    ];
  }

  const [executions, total] = await Promise.all([
    prisma.agentExecution.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        agent: { select: { name: true, slug: true } },
        version: { select: { versionTag: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.agentExecution.count({ where }),
  ]);

  return NextResponse.json({
    data: executions,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
