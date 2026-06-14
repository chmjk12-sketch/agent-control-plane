import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const healthRecords = await prisma.agentHealth.findMany({
    include: { agent: { select: { name: true, slug: true, id: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Deduplicate - take latest per agent
  const agentMap = new Map();
  for (const record of healthRecords) {
    if (!agentMap.has(record.agentId)) {
      agentMap.set(record.agentId, record);
    }
  }

  return NextResponse.json(Array.from(agentMap.values()));
});
