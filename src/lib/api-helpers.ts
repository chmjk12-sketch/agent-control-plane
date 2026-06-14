import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { hashApiKey } from "./utils";

export type ApiHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse>;

export function apiHandler(handler: ApiHandler): ApiHandler {
  return async (req, context) => {
    try {
      return await handler(req, context);
    } catch (error: any) {
      console.error("API Error:", error);
      return NextResponse.json(
        { error: error.message || "Internal Server Error" },
        { status: 500 }
      );
    }
  };
}

export function parsePaginationParams(req: NextRequest) {
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
  const search = url.searchParams.get("search") || "";
  const status = url.searchParams.get("status") || "";
  const agentId = url.searchParams.get("agentId") || "";
  return { page, limit, search, status, agentId, skip: (page - 1) * limit };
}

// V2.0: API Key 鉴权中间件
export async function authenticateApiKey(
  req: NextRequest
): Promise<{ agentId: string; apiKeyId: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const key = authHeader.slice(7);
  const keyHash = hashApiKey(key);

  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash },
    include: { agent: true },
  });

  if (!apiKey) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  // 更新最后使用时间
  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return { agentId: apiKey.agentId, apiKeyId: apiKey.id };
}

// V2.0: deploy-notify 鉴权
export function authenticateDeployNotify(req: NextRequest): boolean {
  const secret = req.headers.get("x-cp-notify-secret");
  return secret === process.env.CP_NOTIFY_SECRET;
}

// V2.0: Token 成本计算
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    "deepseek-chat": { input: 0.0015, output: 0.006 },
    "deepseek-reasoner": { input: 0.004, output: 0.016 },
    "gpt-4": { input: 0.03, output: 0.06 },
    "gpt-4-turbo": { input: 0.01, output: 0.03 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "claude-3-opus": { input: 0.015, output: 0.075 },
    "claude-3-sonnet": { input: 0.003, output: 0.015 },
  };

  const pricing = MODEL_PRICING[model] || MODEL_PRICING["gpt-3.5-turbo"];
  const inputCost = (inputTokens / 1000) * pricing.input;
  const outputCost = (outputTokens / 1000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1000000) / 1000000;
}

// V2.0: 预算检查
export async function checkBudget(agentId: string): Promise<boolean> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { maxCostBudget: true },
  });

  if (!agent || agent.maxCostBudget <= 0) return true;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await prisma.agentExecution.aggregate({
    where: {
      agentId,
      createdAt: { gte: startOfMonth },
      status: "success",
    },
    _sum: { cost: true },
  });

  const monthlyCost = result._sum.cost || 0;
  return monthlyCost < agent.maxCostBudget;
}
