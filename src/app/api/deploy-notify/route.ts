import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, authenticateDeployNotify } from "@/lib/api-helpers";

export const POST = apiHandler(async (req: NextRequest) => {
  // 鉴权
  if (!authenticateDeployNotify(req)) {
    return NextResponse.json(
      { error: "未授权的请求" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { agentSlug, image, commit, deployedBy, trigger } = body;

  if (!agentSlug || !image) {
    return NextResponse.json(
      { error: "缺少必要参数：agentSlug 和 image" },
      { status: 400 }
    );
  }

  const agent = await prisma.agent.findUnique({
    where: { slug: agentSlug },
  });

  if (!agent) {
    return NextResponse.json(
      { error: "Agent 不存在" },
      { status: 404 }
    );
  }

  // 蓝绿交替：当前 blue → 下次 green，反之亦然
  const targetSlot = agent.environmentSlot === "blue" ? "green" : "blue";

  // 创建部署记录
  const deployment = await prisma.deployment.create({
    data: {
      agentId: agent.id,
      imageTag: image,
      gitCommit: commit,
      slot: targetSlot,
      status: "success",
      triggerSource: trigger || "deploy_notify",
      deployedBy: deployedBy || "github-actions",
      startedAt: new Date(),
      finishedAt: new Date(),
      resultLog: "部署成功（由 GitHub Actions 通知）",
    },
  });

  // 更新 Agent 状态
  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      status: "online",
      registryImage: image,
      environmentSlot: targetSlot,
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    deployment: {
      id: deployment.id,
      slot: targetSlot,
      status: "success",
    },
  });
});
