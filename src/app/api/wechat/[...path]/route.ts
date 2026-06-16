import { NextRequest, NextResponse } from "next/server";

/**
 * 微信公众号 API 反向代理
 *
 * 路由格式: /api/wechat/{path}?{query}
 * 目标: https://api.weixin.qq.com/{path}?{query}
 *
 * 用途：利用 ECS 公网 IP（已在微信 IP 白名单中）中转微信公众号 API 调用，
 * 解决本地 IP 不在白名单的问题。
 */

const WECHAT_API_BASE = "https://api.weixin.qq.com";

async function wechatProxyHandler(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await context.params;

  // 构造微信 API 目标 URL
  const subPath = pathSegments.length > 0 ? "/" + pathSegments.join("/") : "";
  const { searchParams } = new URL(req.url);
  const queryString = searchParams.toString();
  const targetUrl = `${WECHAT_API_BASE}${subPath}${queryString ? `?${queryString}` : ""}`;

  try {
    // 透传请求头（过滤 hop-by-hop 头和 host）
    const headersToForward = new Headers();
    for (const [key, value] of req.headers.entries()) {
      const lower = key.toLowerCase();
      if (
        ![
          "host",
          "connection",
          "transfer-encoding",
          "keep-alive",
          "proxy-authentication",
          "proxy-authorization",
          "te",
          "trailers",
          "upgrade",
        ].includes(lower)
      ) {
        headersToForward.set(key, value);
      }
    }

    // 读取请求体（GET/HEAD 无 body）
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody ? await req.arrayBuffer() : undefined;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headersToForward,
      body,
    });

    // 透传响应头
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      const lower = key.toLowerCase();
      if (
        ![
          "transfer-encoding",
          "connection",
          "keep-alive",
          "upgrade",
        ].includes(lower)
      ) {
        responseHeaders.set(key, value);
      }
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "微信 API 代理失败", detail: error.message },
      { status: 502 }
    );
  }
}

export const GET = wechatProxyHandler;
export const POST = wechatProxyHandler;
export const PUT = wechatProxyHandler;
export const DELETE = wechatProxyHandler;
export const PATCH = wechatProxyHandler;
