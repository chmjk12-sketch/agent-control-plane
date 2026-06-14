"use client";
import { useState, useEffect } from "react";
import { use } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bot,
  ArrowLeft,
  GitBranch,
  Tag,
  Cpu,
  Wrench,
  Rocket,
  Play,
  Power,
  PowerOff,
  Shield,
  Key,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import {
  formatCost,
  formatTokens,
  formatLatency,
  timeAgo,
  formatUptime,
  formatMemory,
} from "@/lib/utils";

const statusConfig: Record<
  string,
  { color: "success" | "destructive" | "warning"; label: string }
> = {
  online: { color: "success", label: "在线" },
  offline: { color: "destructive", label: "离线" },
  degraded: { color: "warning", label: "降级" },
};

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [agent, setAgent] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialog states
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchAll = async () => {
    try {
      const [agentData, versionsData, statusData, keysData] = await Promise.all(
        [
          fetch(`/api/agents/${id}`).then((r) => r.json()),
          fetch(`/api/agents/${id}/versions`).then((r) => r.json()),
          fetch(`/api/agents/${id}/status`).then((r) => r.json()),
          fetch(`/api/agents/${id}/api-keys`).then((r) => r.json()),
        ]
      );
      setAgent(agentData);
      setVersions(versionsData);
      setStatus(statusData);
      setApiKeys(keysData.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAll().finally(() => setIsLoading(false));
  }, [id]);

  const handleOnline = async () => {
    setActionLoading("online");
    try {
      const res = await fetch(`/api/agents/${id}/online`, { method: "POST" });
      if (res.ok) {
        await fetchAll();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOffline = async () => {
    setActionLoading("offline");
    try {
      const res = await fetch(`/api/agents/${id}/offline`, { method: "POST" });
      if (res.ok) {
        await fetchAll();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCanary = async (weight: number) => {
    setActionLoading("canary");
    try {
      const res = await fetch(`/api/agents/${id}/canary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight }),
      });
      if (res.ok) {
        await fetchAll();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateApiKey = async () => {
    setActionLoading("apikey");
    try {
      const res = await fetch(`/api/agents/${id}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "生产环境" }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewApiKey(data.apiKey);
        await fetchAll();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading || !agent) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const agentStatus = statusConfig[agent.status] || statusConfig.offline;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/agents">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary/50">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {agent.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {agent.description}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={agentStatus.color}>{agentStatus.label}</Badge>
          {agent.status === "online" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleOffline}
              disabled={actionLoading === "offline"}
            >
              {actionLoading === "offline" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PowerOff className="h-4 w-4 mr-1" />
              )}
              下架
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleOnline}
              disabled={actionLoading === "online"}
            >
              {actionLoading === "online" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Power className="h-4 w-4 mr-1" />
              )}
              上架
            </Button>
          )}
        </div>
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">本月成本</p>
              <p className="text-lg font-bold">
                {formatCost(status.monthlyCost || 0)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">总请求数</p>
              <p className="text-lg font-bold">
                {status.totalExecutions || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">当前 Slot</p>
              <p className="text-lg font-bold uppercase">
                {agent.environmentSlot}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">流量权重</p>
              <p className="text-lg font-bold">{agent.trafficWeight}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">容器</p>
              <p className="text-lg font-bold text-xs font-mono">
                {agent.containerName || "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">未解决告警</p>
              <p className="text-lg font-bold">
                {status.unresolvedAlerts || 0}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Health Info */}
      {status?.health && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">运行时间</p>
              <p className="text-lg font-bold">
                {formatUptime(status.health.uptime)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">内存</p>
              <p className="text-lg font-bold">
                {formatMemory(status.health.memoryMb)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">CPU</p>
              <p className="text-lg font-bold">
                {status.health.cpuPercent?.toFixed(1) || 0}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">重启次数</p>
              <p className="text-lg font-bold">
                {status.health.restartCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">最后心跳</p>
              <p className="text-lg font-bold">
                {status.health.lastHeartbeat
                  ? timeAgo(status.health.lastHeartbeat)
                  : "N/A"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Canary Control */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="h-4 w-4" />
            灰度发布控制
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground w-16">
              Blue: {100 - agent.trafficWeight}%
            </span>
            <Slider
              value={[agent.trafficWeight]}
              onValueChange={(v) => handleCanary(v[0])}
              max={100}
              step={5}
              className="flex-1"
              disabled={actionLoading === "canary"}
            />
            <span className="text-sm text-muted-foreground w-16">
              Green: {agent.trafficWeight}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            拖动滑块调整 Green 环境的流量占比。0% = 全量 Blue，100% = 全量
            Green，50% = 各一半。
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">
            <Tag className="h-3.5 w-3.5 mr-1.5" />
            版本
          </TabsTrigger>
          <TabsTrigger value="deployments">
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            部署
          </TabsTrigger>
          <TabsTrigger value="executions">
            <Play className="h-3.5 w-3.5 mr-1.5" />
            执行记录
          </TabsTrigger>
          <TabsTrigger value="apikeys">
            <Key className="h-3.5 w-3.5 mr-1.5" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="config">
            <Wrench className="h-3.5 w-3.5 mr-1.5" />
            配置
          </TabsTrigger>
        </TabsList>

        <TabsContent value="versions" className="space-y-3 mt-4">
          {versions.map((v: any) => (
            <Card key={v.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <Tag className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{v.versionTag}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.changelog || "暂无变更日志"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    {v.gitCommit?.slice(0, 7) || "N/A"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    {v.modelRef || "N/A"}
                  </span>
                  <span>{v.imageTag?.split(":").pop() || "N/A"}</span>
                  <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
          {versions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无版本
            </p>
          )}
        </TabsContent>

        <TabsContent value="deployments" className="space-y-3 mt-4">
          {agent.deployments?.map((d: any) => (
            <Card key={d.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary/50">
                    <Rocket className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {d.version?.versionTag || "未知"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.gitCommit?.slice(0, 7)} · {d.imageTag || "N/A"} ·
                      Slot:{" "}
                      <span className="uppercase font-mono">{d.slot}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    variant={
                      d.status === "success"
                        ? "success"
                        : d.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {d.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {d.deployedAt ? timeAgo(d.deployedAt) : ""}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="executions" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="p-3 font-medium">请求 ID</th>
                      <th className="p-3 font-medium">Token</th>
                      <th className="p-3 font-medium">成本</th>
                      <th className="p-3 font-medium">延迟</th>
                      <th className="p-3 font-medium">状态</th>
                      <th className="p-3 font-medium">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agent.recentExecutions?.map((e: any) => (
                      <tr
                        key={e.id}
                        className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="p-3 font-mono text-xs">
                          {e.requestId.slice(0, 20)}...
                        </td>
                        <td className="p-3">{formatTokens(e.totalTokens)}</td>
                        <td className="p-3">{formatCost(e.cost)}</td>
                        <td className="p-3">
                          {formatLatency(e.latencyMs)}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              e.status === "success" ? "success" : "destructive"
                            }
                          >
                            {e.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {timeAgo(e.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apikeys" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              API Keys 用于 Agent 向控制平面上报 Token 消耗数据
            </p>
            <Button
              size="sm"
              onClick={() => {
                setNewApiKey(null);
                setApiKeyDialogOpen(true);
              }}
            >
              <Key className="h-4 w-4 mr-1" />
              创建 API Key
            </Button>
          </div>

          {apiKeys.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Key className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">暂无 API Key</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {apiKeys.map((key: any) => (
                <Card key={key.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-mono text-sm">{key.keyPrefix}</p>
                        <p className="text-xs text-muted-foreground">
                          {key.name || "未命名"} · 创建于{" "}
                          {new Date(key.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {key.lastUsedAt
                        ? `最后使用: ${timeAgo(key.lastUsedAt)}`
                        : "从未使用"}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">智能体信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">模型</span>
                  <span>{agent.model}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">端点</span>
                  <span className="font-mono text-xs">
                    {agent.endpoint || "N/A"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">容器名</span>
                  <span className="font-mono text-xs">
                    {agent.containerName || "N/A"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">内部端口</span>
                  <span className="font-mono text-xs">
                    {agent.internalPort}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">健康检查路径</span>
                  <span className="font-mono text-xs">
                    {agent.healthCheckPath}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">部署策略</span>
                  <Badge variant="secondary">{agent.deployStrategy}</Badge>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">月度预算</span>
                  <span>
                    {agent.maxCostBudget > 0
                      ? `$${agent.maxCostBudget}`
                      : "无限制"}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">状态</span>
                  <Badge variant={agentStatus.color}>
                    {agentStatus.label}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">最新版本配置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {versions[0] && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">代码引用</span>
                      <span className="font-mono text-xs">
                        {versions[0].codeRef || "N/A"}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">提示词引用</span>
                      <span className="font-mono text-xs">
                        {versions[0].promptRef?.slice(0, 16) || "N/A"}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">镜像</span>
                      <span className="font-mono text-xs">
                        {versions[0].imageTag || "N/A"}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Git 提交</span>
                      <span className="font-mono text-xs">
                        {versions[0].gitCommit || "N/A"}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* API Key Creation Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建 API Key</DialogTitle>
            <DialogDescription>
              创建后请立即复制，密钥仅显示一次。
            </DialogDescription>
          </DialogHeader>

          {newApiKey ? (
            <div className="space-y-4">
              <div className="p-3 bg-secondary/50 rounded-lg">
                <code className="text-sm break-all">{newApiKey}</code>
              </div>
              <Button
                className="w-full"
                onClick={() => copyToClipboard(newApiKey)}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-1" />
                    复制密钥
                  </>
                )}
              </Button>
            </div>
          ) : (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setApiKeyDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                onClick={handleCreateApiKey}
                disabled={actionLoading === "apikey"}
              >
                {actionLoading === "apikey" ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                确认创建
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
