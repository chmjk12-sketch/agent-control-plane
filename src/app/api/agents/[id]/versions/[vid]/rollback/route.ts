import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const { id, vid } = await params;
  const version = await prisma.agentVersion.findUnique({ where: { id: vid } });
  if (!version) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  // Create rollback deployment
  const deployment = await prisma.deployment.create({
    data: {
      agentId: id,
      versionId: vid,
      gitCommit: version.gitCommit,
      imageTag: version.imageTag,
      status: "success",
      resultLog: `Rollback to version ${version.versionTag} completed`,
      deployedAt: new Date(),
    },
  });

  return NextResponse.json(deployment, { status: 201 });
});
