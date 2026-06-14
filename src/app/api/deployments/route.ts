import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, parsePaginationParams } from "@/lib/api-helpers";

export const GET = apiHandler(async (req: NextRequest) => {
  const { page, limit, status, agentId, skip } = parsePaginationParams(req);

  const where: any = {};
  if (status) where.status = status;
  if (agentId) where.agentId = agentId;

  const [deployments, total] = await Promise.all([
    prisma.deployment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        agent: { select: { name: true, slug: true } },
        version: { select: { versionTag: true } },
      },
    }),
    prisma.deployment.count({ where }),
  ]);

  return NextResponse.json({
    data: deployments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();

  // V2.0: 支持 deploy-notify 触发或手动创建
  const isDeployNotify = body.triggerSource === "deploy_notify";

  const deployment = await prisma.deployment.create({
    data: {
      agentId: body.agentId,
      versionId: body.versionId,
      gitCommit: body.gitCommit,
      imageTag: body.imageTag,
      slot: body.slot || "blue",
      trafficWeight: body.trafficWeight || 100,
      status: isDeployNotify ? "success" : "pending",
      triggerSource: body.triggerSource || "manual",
      deployedBy: body.deployedBy || null,
      resultLog: isDeployNotify
        ? "部署成功（由 GitHub Actions 通知）"
        : "Deployment initiated...",
      deployedAt: new Date(),
      startedAt: isDeployNotify ? new Date() : null,
      finishedAt: isDeployNotify ? new Date() : null,
    },
  });
  return NextResponse.json(deployment, { status: 201 });
});
