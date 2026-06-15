import { NextRequest, NextResponse } from "next/server";
import { parseAgentSpec } from "@/lib/agent-spec";

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { yaml } = body;

    if (!yaml || typeof yaml !== "string") {
      return NextResponse.json(
        { error: "yaml content is required" },
        { status: 400 }
      );
    }

    const result = parseAgentSpec(yaml);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: result.errors?.issues.map((e: any) => ({
            path: e.path.join(".") || "(root)",
            message: e.message,
            code: e.code,
          })),
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      valid: true,
      data: result.data,
    });
  } catch (err) {
    console.error("POST /api/agent-spec/validate error:", err);
    return NextResponse.json(
      { error: "Failed to validate agent spec" },
      { status: 500 }
    );
  }
};
