"""Agent Base - FastAPI 主入口"""

import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="{{agent_name}}",
    description="{{agent_name}} - AI Agent Service",
    version="1.0.0",
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "agent": "{{agent_name}}",
        "version": "1.0.0",
    }


@app.get("/")
async def root():
    """根路径"""
    return {
        "name": "{{agent_name}}",
        "message": "Agent is running",
    }


@app.post("/chat")
async def chat(request: dict):
    """聊天端点"""
    message = request.get("message", "")
    # TODO: 实现 Agent 聊天逻辑
    return {
        "response": f"Received: {message}",
    }


if __name__ == "__main__":
    port = int(os.getenv("AGENT_PORT", "{{agent_port}}"))
    uvicorn.run(app, host="0.0.0.0", port=port)
