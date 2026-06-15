import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { executeWorkflow } from "@/lib/workflow-engine";

// POST: 执行工作流
export const POST = apiHandler(async (req: NextRequest, context: { params: Promise<Record<string, string>> }) => {
  const { id } = await context.params;
  const body = await req.json();
  const { input } = body;

  const result = await executeWorkflow(id, input);

  return NextResponse.json({ data: result });
});
