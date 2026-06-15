import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-helpers";
import { promises as fs } from "fs";
import { join } from "path";

const RULES_DIR = join(process.cwd(), "templates");

/**
 * 获取 Agent 开发规则
 * 
 * 支持查询参数:
 * - type: 模板类型 (fastapi | nextjs | python-script)，默认 fastapi
 * - format: 返回格式 (markdown | json)，默认 markdown
 * 
 * 示例:
 * GET /api/agent-rules?type=fastapi&format=markdown
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "fastapi";
  const format = url.searchParams.get("format") || "markdown";

  // 读取规则文件
  const rulesPath = join(RULES_DIR, "agent-base", ".trae", "rules.md");
  let rulesContent: string;

  try {
    rulesContent = await fs.readFile(rulesPath, "utf-8");
  } catch (e) {
    return NextResponse.json(
      { error: "Rules file not found" },
      { status: 404 }
    );
  }

  if (format === "json") {
    // 解析 markdown 为结构化 JSON
    const sections = parseRulesToJson(rulesContent);
    return NextResponse.json({
      type,
      version: "3.0",
      generatedAt: new Date().toISOString(),
      controlPlaneUrl: process.env.SELF_URL || "https://administrator.chmjk67.top",
      sections,
    });
  }

  // 返回原始 markdown
  return new NextResponse(rulesContent, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
});

/**
 * 将规则 markdown 解析为结构化 JSON
 */
function parseRulesToJson(content: string): Array<{
  title: string;
  level: number;
  content: string;
}> {
  const sections: Array<{ title: string; level: number; content: string }> = [];
  const lines = content.split("\n");
  let currentSection: { title: string; level: number; content: string } | null = null;

  for (const line of lines) {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    if (match) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: match[2].trim(),
        level: match[1].length,
        content: "",
      };
    } else if (currentSection) {
      currentSection.content += line + "\n";
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}
