import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const deployment = await prisma.deployment.findUnique({ where: { id } });
  if (!deployment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mark as rolled back
  const updated = await prisma.deployment.update({
    where: { id },
    data: { status: "rolled_back", resultLog: "Rollback executed" },
  });

  // Create new rollback deployment
  const rollback = await prisma.deployment.create({
    data: {
      agentId: deployment.agentId,
      versionId: deployment.versionId,
      gitCommit: deployment.gitCommit,
      imageTag: deployment.imageTag,
      status: "success",
      resultLog: "Rollback deployment completed",
      deployedAt: new Date(),
    },
  });

  return NextResponse.json({ original: updated, rollback });
});
