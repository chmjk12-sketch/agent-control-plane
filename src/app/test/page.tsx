"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Bot, Loader2, AlertCircle, CheckCircle, Clock, DollarSign, Hash } from "lucide-react";
import { formatCost, formatTokens, formatLatency } from "@/lib/utils";

interface Agent {
  id: string;
  name: string;
  model: string;
  status: string;
  description?: string;
}

interface ExecuteResult {
  success: boolean;
  requestId: string;
  content?: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost?: number;
  latencyMs?: number;
  error?: string;
}

export default function TestPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoadingAgents(true);
    fetch("/api/agents?limit=100")
      .then((r) => r.json())
      .then((data) => {
        const list = data?.data || [];
        setAgents(list);
        if (list.length > 0) {
          setSelectedAgentId(list[0].id);
        }
      })
      .catch(() => setError("加载智能体列表失败"))
      .finally(() => setLoadingAgents(false));
  }, []);

  const handleExecute = async () => {
    if (!selectedAgentId || !prompt.trim()) return;
    setExecuting(true);
    setResult(null);
    setError("");

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: selectedAgentId, prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "执行失败");
      }
      setResult(data);
    } catch (e: any) {
      setError(e.message || "网络错误");
    } finally {
      setExecuting(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">智能体测试</h1>
        <p className="text-sm text-muted-foreground mt-1">
          选择已注册的智能体，输入提示词进行真实 API 调用测试
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-muted-foreground" />
            执行配置
          </CardTitle>
          <CardDescription>选择智能体并输入提示词</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">选择智能体</label>
            {loadingAgents ? (
              <div className="h-9 rounded-md border border-input bg-secondary/50 animate-pulse" />
            ) : agents.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                暂无已注册的智能体，请先前往「智能体」页面创建
              </div>
            ) : (
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="请选择智能体" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <span>{agent.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {agent.model}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedAgent && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>当前模型：</span>
              <Badge variant="outline" className="text-[10px]">
                {selectedAgent.model}
              </Badge>
              <span>状态：</span>
              <Badge
                variant={selectedAgent.status === "online" ? "success" : "secondary"}
                className="text-[10px]"
              >
                {selectedAgent.status === "online" ? "在线" : "离线"}
              </Badge>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">提示词</label>
            <Input
              placeholder="请输入要发送给智能体的提示词..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleExecute();
                }
              }}
              disabled={executing || agents.length === 0}
            />
          </div>

          <Button
            onClick={handleExecute}
            disabled={executing || !selectedAgentId || !prompt.trim() || agents.length === 0}
            className="w-full"
          >
            {executing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                调用中...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                发送请求
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {error && !result && (
        <Card className="border-destructive/50">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-emerald-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              {result.success ? "执行成功" : "执行失败"}
            </CardTitle>
            <CardDescription>
              请求 ID：
              <span className="font-mono text-xs">{result.requestId}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.success && result.content && (
              <div className="space-y-2">
                <label className="text-sm font-medium">响应内容</label>
                <div className="rounded-lg border bg-secondary/30 p-4 text-sm whitespace-pre-wrap leading-relaxed">
                  {result.content}
                </div>
              </div>
            )}

            {!result.success && result.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {result.error}
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Hash className="h-3.5 w-3.5" />
                  输入 Token
                </div>
                <div className="text-lg font-semibold">
                  {formatTokens(result.usage?.inputTokens || 0)}
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Hash className="h-3.5 w-3.5" />
                  输出 Token
                </div>
                <div className="text-lg font-semibold">
                  {formatTokens(result.usage?.outputTokens || 0)}
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  成本
                </div>
                <div className="text-lg font-semibold">
                  {formatCost(result.cost || 0)}
                </div>
              </div>
              <div className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  延迟
                </div>
                <div className="text-lg font-semibold">
                  {formatLatency(result.latencyMs || 0)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
