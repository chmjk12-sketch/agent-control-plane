import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { listTemplates } from "@/lib/template-engine";

export const GET = async (req: NextRequest) => {
  try {
    const type = new URL(req.url).searchParams.get("type") || undefined;
    const templates = await listTemplates(type);
    return NextResponse.json({ data: templates });
  } catch (err) {
    console.error("GET /api/templates error:", err);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }
};

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { name, slug, description, type, icon, tags, githubRepo, githubBranch, variables, files } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "name and slug are required" },
        { status: 400 }
      );
    }

    // 检查 slug 唯一性
    const existing = await prisma.template.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: "Template with this slug already exists" },
        { status: 409 }
      );
    }

    const template = await prisma.template.create({
      data: {
        name,
        slug,
        description: description || null,
        type: type || "fastapi",
        icon: icon || "bot",
        tags: JSON.stringify(tags || []),
        githubRepo: githubRepo || "",
        githubBranch: githubBranch || "main",
        variables: JSON.stringify(variables || []),
        files: JSON.stringify(files || []),
      },
    });

    return NextResponse.json({ data: template }, { status: 201 });
  } catch (err) {
    console.error("POST /api/templates error:", err);
    return NextResponse.json(
      { error: "Failed to create template" },
      { status: 500 }
    );
  }
};
