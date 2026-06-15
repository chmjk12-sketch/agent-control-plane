import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler, parsePaginationParams } from "@/lib/api-helpers";

// GET: 工作流列表
export const GET = apiHandler(async (req: NextRequest) => {
  const { page, limit, skip } = parsePaginationParams(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";

  const where: any = {};
  if (status) where.status = status;

  const [workflows, total] = await Promise.all([
    prisma.workflow.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.workflow.count({ where }),
  ]);

  return NextResponse.json({
    data: workflows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// POST: 创建工作流
export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const { name, slug, description, nodes, edges, variables, status } = body;

  if (!name || !slug) {
    return NextResponse.json(
      { error: "name 和 slug 为必填字段" },
      { status: 400 }
    );
  }

  // 检查 slug 唯一性
  const existing = await prisma.workflow.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { error: "slug 已存在" },
      { status: 409 }
    );
  }

  const workflow = await prisma.workflow.create({
    data: {
      name,
      slug,
      description: description || null,
      nodes: nodes ? JSON.stringify(nodes) : "[]",
      edges: edges ? JSON.stringify(edges) : "[]",
      variables: variables ? JSON.stringify(variables) : "{}",
      status: status || "draft",
    },
  });

  return NextResponse.json({ data: workflow }, { status: 201 });
});
