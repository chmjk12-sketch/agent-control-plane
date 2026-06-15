"""CrewAI Service - Agent 协同编排服务"""

import os
import time
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CrewAI Service",
    description="Agent 协同编排服务",
    version="0.1.0",
)

# 环境变量
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEFAULT_LLM = os.getenv("DEFAULT_LLM", "deepseek-chat")


# --- 请求/响应模型 ---

class AgentConfig(BaseModel):
    name: str
    role: str
    goal: Optional[str] = ""
    backstory: Optional[str] = ""
    llm: Optional[str] = None


class ExecuteRequest(BaseModel):
    task: str
    agents: Optional[list[AgentConfig]] = None
    inputs: Optional[dict] = None
    crew_config: Optional[dict] = None


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime: float


class ExecuteResponse(BaseModel):
    success: bool
    result: Optional[dict] = None
    error: Optional[str] = None
    duration_ms: int


# --- 启动时间 ---

_start_time = time.time()


# --- 路由 ---

@app.get("/health", response_model=HealthResponse)
async def health():
    """健康检查"""
    return HealthResponse(
        status="healthy",
        version="0.1.0",
        uptime=round(time.time() - _start_time, 2),
    )


@app.post("/execute", response_model=ExecuteResponse)
async def execute(req: ExecuteRequest):
    """执行 CrewAI 任务"""
    start = time.time()

    try:
        # 如果提供了 crew_config，直接使用
        if req.crew_config:
            result = await _execute_with_config(req.crew_config, req.task, req.inputs)
        elif req.agents:
            result = await _execute_with_agents(req.agents, req.task, req.inputs)
        else:
            # 简单任务执行（单 Agent）
            result = await _execute_simple(req.task, req.inputs)

        duration_ms = int((time.time() - start) * 1000)
        return ExecuteResponse(
            success=True,
            result=result,
            duration_ms=duration_ms,
        )
    except Exception as e:
        logger.error(f"执行失败: {e}", exc_info=True)
        duration_ms = int((time.time() - start) * 1000)
        return ExecuteResponse(
            success=False,
            error=str(e),
            duration_ms=duration_ms,
        )


async def _execute_simple(task: str, inputs: Optional[dict]) -> dict:
    """简单任务执行（不依赖 CrewAI 库，直接调用 LLM）"""
    try:
        import httpx

        api_key = DEEPSEEK_API_KEY or OPENAI_API_KEY
        base_url = DEEPSEEK_BASE_URL or OPENAI_BASE_URL or "https://api.deepseek.com/v1"

        if not api_key:
            raise ValueError("未配置 API Key（DEEPSEEK_API_KEY 或 OPENAI_API_KEY）")

        messages = [{"role": "user", "content": task}]
        if inputs:
            messages.insert(0, {
                "role": "system",
                "content": f"上下文信息:\n{inputs}",
            })

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": DEFAULT_LLM,
                    "messages": messages,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "content": data["choices"][0]["message"]["content"],
                "model": DEFAULT_LLM,
                "usage": data.get("usage", {}),
            }
    except ImportError:
        raise RuntimeError("需要安装 httpx: pip install httpx")


async def _execute_with_agents(agents: list[AgentConfig], task: str, inputs: Optional[dict]) -> dict:
    """使用 Agent 配置执行任务"""
    try:
        from crewai import Agent, Task, Crew, Process
    except ImportError:
        logger.warning("CrewAI 未安装，回退到简单执行模式")
        return await _execute_simple(task, inputs)

    crew_agents = []
    for agent_conf in agents:
        agent = Agent(
            role=agent_conf.role,
            goal=agent_conf.goal or f"完成 {agent_conf.role} 的职责",
            backstory=agent_conf.backstory or "",
            verbose=True,
            allow_delegation=False,
            llm=agent_conf.llm or DEFAULT_LLM,
        )
        crew_agents.append(agent)

    crew_task = Task(
        description=task,
        expected_output="完成任务并返回结果",
        agent=crew_agents[0],
    )

    crew = Crew(
        agents=crew_agents,
        tasks=[crew_task],
        process=Process.sequential,
        verbose=True,
    )

    result = crew.kickoff(inputs=inputs or {})

    return {
        "content": str(result),
        "agents_used": [a.role for a in crew_agents],
    }


async def _execute_with_config(config: dict, task: str, inputs: Optional[dict]) -> dict:
    """使用自定义 Crew 配置执行"""
    try:
        from crewai import Crew
    except ImportError:
        logger.warning("CrewAI 未安装，回退到简单执行模式")
        return await _execute_simple(task, inputs)

    crew = Crew(**config)
    result = crew.kickoff(inputs=inputs or {})

    return {
        "content": str(result),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
