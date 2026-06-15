import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { mcpHub } from "@/lib/mcp-hub";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { agentSlug, tools } = body;

  if (!agentSlug || !tools || !Array.isArray(tools)) {
    return NextResponse.json(
      { error: "缺少必要参数：agentSlug 和 tools" },
      { status: 400 }
    );
  }

  // 验证 tools 格式
  for (const tool of tools) {
    if (!tool.name || !tool.description || !tool.inputSchema || !tool.endpoint) {
      return NextResponse.json(
        { error: "每个工具必须包含 name, description, inputSchema, endpoint" },
        { status: 400 }
      );
    }
  }

  const count = await mcpHub.registerTools({ agentSlug, tools });

  return NextResponse.json({
    success: true,
    registeredCount: count,
  });
});
