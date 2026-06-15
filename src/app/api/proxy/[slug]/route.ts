import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateCost, checkBudget } from "@/lib/api-helpers";
import { generateRequestId } from "@/lib/utils";

// 通用代理处理器：支持所有 HTTP 方法，透传任意请求/响应
async function proxyHandler(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
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

  // 构造目标 URL：保留原始路径和查询参数
  const { searchParams, pathname } = new URL(req.url);
  // pathname 格式: /api/proxy/{slug}/rest/of/path
  const proxyPrefix = `/api/proxy/${slug}`;
  const subPath = pathname.startsWith(proxyPrefix)
    ? pathname.slice(proxyPrefix.length) || "/"
    : "/";
  const queryString = searchParams.toString();
  const targetBase = agent.endpoint
    ? agent.endpoint.replace(/\/+$/, "")
    : `http://${agent.containerName}_${agent.environmentSlot}:${agent.internalPort}`;
  const targetUrl = `${targetBase}${subPath}${queryString ? `?${queryString}` : ""}`;

  try {
    // 透传请求头（过滤 hop-by-hop 头）
    const headersToForward = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const lower = key.toLowerCase();
      if (!["host", "connection", "transfer-encoding", "keep-alive", "proxy-authentication", "proxy-authorization", "te", "trailers", "upgrade"].includes(lower)) {
        headersToForward.set(key, value);
      }
    }

    // 读取请求体（如果有）
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headersToForward,
      body,
    });

    const latencyMs = Date.now() - startTime;

    // 透传响应头（过滤 hop-by-hop 头）
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (!["transfer-encoding", "connection", "keep-alive", "upgrade"].includes(lower)) {
        responseHeaders.set(key, value);
      }
    }

    // 尝试提取 Token（OpenAI 兼容格式）
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    let cost = 0;

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        const usage = data.usage || {};
        inputTokens = usage.prompt_tokens || 0;
        outputTokens = usage.completion_tokens || 0;
        totalTokens = usage.total_tokens || inputTokens + outputTokens;
        cost = calculateCost(agent.model, inputTokens, outputTokens);
      } catch {
        // JSON 解析失败，不记录 token
      }
    }

    // 异步记录执行（不阻塞响应）
    prisma.agentExecution.create({
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
    }).catch(() => {
      // 记录失败不影响响应
    });

    // 透传原始响应
    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;

    prisma.agentExecution.create({
      data: {
        agentId: agent.id,
        requestId,
        latencyMs,
        status: "failed",
        errorMsg: error.message,
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: "Agent 不可达", detail: error.message },
      { status: 502 }
    );
  }
}

export const GET = proxyHandler;
export const POST = proxyHandler;
export const PUT = proxyHandler;
export const DELETE = proxyHandler;
export const PATCH = proxyHandler;
export const OPTIONS = proxyHandler;
