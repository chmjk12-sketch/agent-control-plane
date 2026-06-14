import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/api-helpers";
import { generateApiKey, hashApiKey, getApiKeyPrefix } from "@/lib/utils";

// GET: 列出 API Keys
export const GET = apiHandler(async (req: NextRequest, context) => {
  const { id } = await context.params;

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { agentId: id },
    select: {
      id: true,
      keyPrefix: true,
      name: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: keys });
});

// POST: 创建 API Key
export const POST = apiHandler(async (req: NextRequest, context) => {
  const { id } = await context.params;
  const { name, expiresInDays } = await req.json();

  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    return NextResponse.json({ error: "Agent 不存在" }, { status: 404 });
  }

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = getApiKeyPrefix(rawKey);

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await prisma.apiKey.create({
    data: {
      agentId: id,
      keyHash,
      keyPrefix,
      name: name || null,
      expiresAt,
    },
  });

  return NextResponse.json(
    {
      success: true,
      apiKey: rawKey, // 仅返回一次
      prefix: keyPrefix,
      expiresAt,
    },
    { status: 201 }
  );
});
