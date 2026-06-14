import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { agentId } = await params;
  const health = await prisma.agentHealth.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { agent: { select: { name: true, slug: true } } },
  });
  return NextResponse.json(health);
});
