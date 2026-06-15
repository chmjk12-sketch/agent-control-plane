import { NextRequest, NextResponse } from "next/server";
import { forkTemplate } from "@/lib/template-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const POST = async (req: NextRequest, { params }: RouteParams) => {
  try {
    const { id } = await params;
    const body = await req.json();
    const { agentId, agentName, agentSlug, variables } = body;

    if (!agentId || !agentName || !agentSlug) {
      return NextResponse.json(
        { error: "agentId, agentName, and agentSlug are required" },
        { status: 400 }
      );
    }

    const result = await forkTemplate({
      templateId: id,
      agentId,
      agentName,
      agentSlug,
      variables: variables || {},
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    console.error("POST /api/templates/[id]/fork error:", err);
    return NextResponse.json(
      { error: "Failed to fork template" },
      { status: 500 }
    );
  }
};
