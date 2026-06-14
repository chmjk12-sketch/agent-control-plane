import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";
import { generateRequestId } from "@/lib/utils";
import OpenAI from "openai";

const MODEL_PRICING: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4": { input: 0.03, output: 0.06 },
  "gpt-4-turbo": { input: 0.01, output: 0.03 },
  "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
};

function getPricing(model: string) {
  // 尝试精确匹配
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }
  // 尝试前缀匹配，如 gpt-4-0613 匹配 gpt-4
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key)) {
      return MODEL_PRICING[key];
    }
  }
  // 默认使用 gpt-3.5-turbo 定价
  return MODEL_PRICING["gpt-3.5-turbo"];
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getPricing(model);
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1000000) / 1000000;
}

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { agentId, prompt } = body;

  if (!agentId || typeof prompt !== "string" || prompt.trim().length === 0) {
    return NextResponse.json(
      { error: "缺少必要参数：agentId 和 prompt" },
      { status: 400 }
    );
  }

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return NextResponse.json({ error: "智能体不存在" }, { status: 404 });
  }

  const requestId = generateRequestId();
  const startTime = Date.now();

  // 先创建执行记录（pending 状态）
  const execution = await prisma.agentExecution.create({
    data: {
      agentId: agent.id,
      requestId,
      status: "pending",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      latencyMs: 0,
    },
  });

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });

    const model = agent.model || "gpt-3.5-turbo";

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
    });

    const latencyMs = Date.now() - startTime;
    const choice = completion.choices[0];
    const content = choice?.message?.content || "";

    const inputTokens = completion.usage?.prompt_tokens || 0;
    const outputTokens = completion.usage?.completion_tokens || 0;
    const totalTokens = completion.usage?.total_tokens || inputTokens + outputTokens;
    const cost = calculateCost(model, inputTokens, outputTokens);

    // 更新执行记录为成功
    await prisma.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: "success",
        inputTokens,
        outputTokens,
        totalTokens,
        cost,
        latencyMs,
      },
    });

    return NextResponse.json({
      success: true,
      requestId,
      content,
      model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
      cost,
      latencyMs,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = error.message || "调用 LLM API 失败";

    // 更新执行记录为失败
    await prisma.agentExecution.update({
      where: { id: execution.id },
      data: {
        status: "failed",
        latencyMs,
        errorMsg,
      },
    });

    return NextResponse.json(
      {
        success: false,
        requestId,
        error: errorMsg,
        latencyMs,
      },
      { status: 500 }
    );
  }
});
