import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const execution = await prisma.agentExecution.findUnique({
    where: { id },
    include: {
      agent: { select: { name: true, slug: true } },
      version: { select: { versionTag: true } },
      user: { select: { name: true, email: true } },
    },
  });
  if (!execution) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(execution);
});
