import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const deployment = await prisma.deployment.findUnique({
    where: { id },
    include: {
      agent: { select: { name: true, slug: true } },
      version: { select: { versionTag: true } },
    },
  });
  if (!deployment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(deployment);
});
