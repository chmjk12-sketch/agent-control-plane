import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, calculateCost, checkBudget } from "@/lib/api-helpers";
import { generateRequestId } from "@/lib/utils";

export const POST = apiHandler(async (req: NextRequest, context) => {
  const { slug } = await context.params;
  const agent = await prisma.agent.findUnique({ where: { slug } });

  if (!agent) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  if (agent.status !== "online") {
    return NextResponse.json({ error: "Agent 已离线" }, { status: 503 });
  }

  // 预算检查
  if (!(await checkBudget(agent.id))) {
    return NextResponse.json(
      { error: "月度预算已超限，请联系管理员" },
      { status: 429 }
    );
  }

  const startTime = Date.now();
  const requestId = generateRequestId();

  // 目标地址：通过 Docker 内部 DNS 访问
  const targetUrl = agent.endpoint
    ? `${agent.endpoint}`
    : `http://${agent.containerName}_${agent.environmentSlot}:${agent.internalPort}`;

  try {
    // 读取请求体
    const bodyText = await req.text();

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...Object.fromEntries(
          Array.from(req.headers.entries()).filter(
            ([k]) => !["host", "connection", "transfer-encoding"].includes(k.toLowerCase())
          )
        ),
      },
      body: bodyText,
    });

    const data = await response.json();
    const latencyMs = Date.now() - startTime;

    // 自动提取 Token（OpenAI 兼容格式）
    const usage = data.usage || {};
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || inputTokens + outputTokens;
    const cost = calculateCost(agent.model, inputTokens, outputTokens);

    // 记录执行
    await prisma.agentExecution.create({
      data: {
        agentId: agent.id,
        requestId,
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        latencyMs,
        status: response.ok ? "success" : "failed",
      },
    });

    // 返回原始响应（透传）
    return NextResponse.json(data, { status: response.status });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    await prisma.agentExecution.create({
      data: {
        agentId: agent.id,
        requestId,
        latencyMs,
        status: "failed",
        errorMsg: error.message,
      },
    });

    return NextResponse.json(
      { error: "Agent 不可达", detail: error.message },
      { status: 502 }
    );
  }
});
