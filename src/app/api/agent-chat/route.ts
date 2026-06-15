import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { messageBus } from "@/lib/message-bus";

// 消息历史存储（内存）
const chatHistories = new Map<string, Array<{
  role: "user" | "agent";
  content: string;
  timestamp: number;
  agentId?: string;
}>>();

// POST: 发送消息到 Agent
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { agentId, message, conversationId } = body;

  if (!agentId || !message) {
    return NextResponse.json(
      { error: "agentId 和 message 为必填字段" },
      { status: 400 }
    );
  }

  const convId = conversationId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 初始化会话历史
  if (!chatHistories.has(convId)) {
    chatHistories.set(convId, []);
  }
  const history = chatHistories.get(convId)!;

  // 记录用户消息
  const userMsg = {
    role: "user" as const,
    content: message,
    timestamp: Date.now(),
  };
  history.push(userMsg);

  // 通过消息总线发送到 Agent
  const response = await messageBus.request(`agent.${agentId}.chat`, {
    message,
    conversationId: convId,
    history: history.slice(-20), // 最近 20 条消息
  }, 30000);

  // 记录 Agent 回复
  const agentMsg = {
    role: "agent" as const,
    content: response?.content || response?.message || "Agent 无响应",
    timestamp: Date.now(),
    agentId,
  };
  history.push(agentMsg);

  return NextResponse.json({
    data: {
      conversationId: convId,
      message: agentMsg,
    },
  });
});

// GET: 获取消息历史
export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId") || "";
  const limit = parseInt(url.searchParams.get("limit") || "50");

  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId 为必填参数" },
      { status: 400 }
    );
  }

  const history = chatHistories.get(conversationId) || [];

  return NextResponse.json({
    data: {
      conversationId,
      messages: history.slice(-limit),
      total: history.length,
    },
  });
});
