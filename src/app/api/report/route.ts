import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const {
    agentId,
    requestId,
    inputTokens,
    outputTokens,
    cost,
    latencyMs,
    status,
    errorMsg,
  } = body;

  // agentId 和 requestId 必填
  if (!agentId || !requestId) {
    return NextResponse.json(
      { error: "缺少必要参数：agentId 和 requestId" },
      { status: 400 }
    );
  }

  // 验证智能体是否存在
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
  }

  const input = typeof inputTokens === "number" ? inputTokens : 0;
  const output = typeof outputTokens === "number" ? outputTokens : 0;

  // 创建或更新执行记录
  const execution = await prisma.agentExecution.upsert({
    where: { requestId },
    update: {
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      cost: typeof cost === "number" ? cost : 0,
      latencyMs: typeof latencyMs === "number" ? latencyMs : 0,
      status: status || "success",
      errorMsg: errorMsg || null,
    },
    create: {
      agentId,
      requestId,
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      cost: typeof cost === "number" ? cost : 0,
      latencyMs: typeof latencyMs === "number" ? latencyMs : 0,
      status: status || "pending",
      errorMsg: errorMsg || null,
    },
  });

  return NextResponse.json({ success: true, execution });
});
