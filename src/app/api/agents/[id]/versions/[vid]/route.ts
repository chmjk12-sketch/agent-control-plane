import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { vid } = await params;
  const version = await prisma.agentVersion.findUnique({ where: { id: vid } });
  if (!version) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...version,
    toolConfig: version.toolConfig ? JSON.parse(version.toolConfig) : null,
    envVars: version.envVars ? JSON.parse(version.envVars) : null,
  });
});
