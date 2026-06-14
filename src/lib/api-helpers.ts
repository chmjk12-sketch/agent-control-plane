import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

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
