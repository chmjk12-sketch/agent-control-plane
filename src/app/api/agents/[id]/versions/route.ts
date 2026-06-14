import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const versions = await prisma.agentVersion.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(versions.map(v => ({
    ...v,
    toolConfig: v.toolConfig ? JSON.parse(v.toolConfig) : null,
    envVars: v.envVars ? JSON.parse(v.envVars) : null,
  })));
});

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const body = await req.json();

  // Get latest version to increment
  const latest = await prisma.agentVersion.findFirst({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
  });

  let newTag = "v1.0.0";
  if (latest) {
    const parts = latest.versionTag.replace("v", "").split(".");
    newTag = `v${parseInt(parts[0]) + 1}.0.0`;
  }

  const version = await prisma.agentVersion.create({
    data: {
      agentId: id,
      versionTag: body.versionTag || newTag,
      codeRef: body.codeRef,
      promptRef: body.promptRef,
      modelRef: body.modelRef,
      toolConfig: body.toolConfig ? JSON.stringify(body.toolConfig) : undefined,
      envVars: body.envVars ? JSON.stringify(body.envVars) : undefined,
      imageTag: body.imageTag,
      gitCommit: body.gitCommit,
      changelog: body.changelog,
    },
  });

  return NextResponse.json(version, { status: 201 });
});
