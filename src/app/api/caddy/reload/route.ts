import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { syncAllAgentRoutes, reloadCaddy } from "@/lib/caddy-manager";

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const { syncAll } = body;

  if (syncAll) {
    // 同步所有在线 Agent 的路由
    const result = await syncAllAgentRoutes();
    return NextResponse.json({
      success: true,
      message: "同步完成",
      synced: result.synced,
      removed: result.removed,
    });
  }

  // 仅 reload Caddy
  await reloadCaddy();
  return NextResponse.json({
    success: true,
    message: "Caddy reloaded",
  });
});
