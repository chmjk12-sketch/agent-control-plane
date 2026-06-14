"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/overview/stat-card";
import {
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import {
  DollarSign,
  Coins,
  TrendingUp,
  Bot,
  Search,
  BarChart3,
  Activity,
} from "lucide-react";
import { formatTokens, formatCost } from "@/lib/utils";

interface DailyTrendItem {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface AgentRankingItem {
  agentId: string;
  agentName: string;
  agentSlug: string;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  executionCount: number;
}

interface Stats {
  totalTokensAll: number;
  totalTokensToday: number;
  totalTokensMonth: number;
  totalCostAll: number;
  totalCostToday: number;
  totalCostMonth: number;
  avgCostPerExecution: number;
  activeAgentCount: number;
  totalExecutions: number;
}

interface ApiResponse {
  stats: Stats;
  dailyTrend: DailyTrendItem[];
  agentRanking: AgentRankingItem[];
}

export default function CostsPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/costs")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const stats = data?.stats;
  const dailyTrend = data?.dailyTrend ?? [];
  const agentRanking = data?.agentRanking ?? [];

  const filteredRanking = agentRanking.filter((item) =>
    item.agentName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Custom tooltip for the chart
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <p className="text-xs text-muted-foreground mb-2">{label}</p>
        {payload.map((entry: any, idx: number) => (
          <p key={idx} className="text-xs flex items-center gap-2" style={{ color: entry.color }}>
            <span className="font-medium">{entry.name}:</span>
            <span>{formatTokens(entry.value)}</span>
          </p>
        ))}
      </div>
    );
  };

  const hasData = stats && stats.totalExecutions > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Token 用量监控</h1>
        <p className="text-sm text-muted-foreground mt-1">
          实时追踪所有智能体的 Token 消耗与成本
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="总 Token 消耗"
          value={hasData ? formatTokens(stats!.totalTokensAll) : "0"}
          subtitle={
            hasData
              ? `今日 ${formatTokens(stats!.totalTokensToday)} | 本月 ${formatTokens(stats!.totalTokensMonth)}`
              : "暂无数据"
          }
          icon={Coins}
        />
        <StatCard
          title="总成本"
          value={hasData ? `$${stats!.totalCostAll.toFixed(2)}` : "$0.00"}
          subtitle={
            hasData
              ? `今日 $${stats!.totalCostToday.toFixed(2)} | 本月 $${stats!.totalCostMonth.toFixed(2)}`
              : "暂无数据"
          }
          icon={DollarSign}
        />
        <StatCard
          title="平均每次执行成本"
          value={
            hasData
              ? formatCost(stats!.avgCostPerExecution)
              : "$0.0000"
          }
          subtitle={
            hasData
              ? `共 ${stats!.totalExecutions} 次执行`
              : "暂无数据"
          }
          icon={TrendingUp}
        />
        <StatCard
          title="活跃智能体数"
          value={hasData ? stats!.activeAgentCount : "0"}
          subtitle={hasData ? "已有执行记录的智能体" : "暂无数据"}
          icon={Bot}
        />
      </div>

      {/* Token Trend Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-medium">Token 消耗趋势</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              过去 7 天每日 Token 消耗
            </p>
          </div>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[280px] flex items-center justify-center">
              <div className="h-4 bg-secondary rounded animate-pulse w-1/2" />
            </div>
          ) : dailyTrend.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
              暂无趋势数据
            </div>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyTrend} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(val) => val.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(val) => formatTokens(val)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="inputTokens"
                    name="Input Token"
                    fill="#3b82f6"
                    radius={[2, 2, 0, 0]}
                    stackId="a"
                  />
                  <Bar
                    dataKey="outputTokens"
                    name="Output Token"
                    fill="#22c55e"
                    radius={[2, 2, 0, 0]}
                    stackId="a"
                  />
                  <Line
                    type="monotone"
                    dataKey="totalTokens"
                    name="总计"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#a855f7" }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Token Ranking Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-medium">智能体 Token 排名</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              按 Token 消耗降序排列
            </p>
          </div>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="relative max-w-sm mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索智能体名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-secondary rounded animate-pulse" />
              ))}
            </div>
          ) : filteredRanking.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? "未找到匹配的智能体" : "暂无智能体执行数据"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-3 pr-3 font-medium">排名</th>
                    <th className="pb-3 pr-3 font-medium">智能体名称</th>
                    <th className="pb-3 pr-3 font-medium text-right">总 Token</th>
                    <th className="pb-3 pr-3 font-medium text-right">总成本</th>
                    <th className="pb-3 pr-3 font-medium text-right">平均延迟</th>
                    <th className="pb-3 pr-3 font-medium text-right">执行次数</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRanking.map((item, index) => (
                    <tr
                      key={item.agentId}
                      className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors"
                    >
                      <td className="py-3 pr-3">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            index === 0
                              ? "bg-amber-500/20 text-amber-400"
                              : index === 1
                                ? "bg-gray-400/20 text-gray-400"
                                : index === 2
                                  ? "bg-orange-600/20 text-orange-500"
                                  : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{item.agentName}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {item.agentSlug}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-sm">
                        {formatTokens(item.totalTokens)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-sm">
                        {formatCost(item.totalCost)}
                      </td>
                      <td className="py-3 pr-3 text-right text-muted-foreground">
                        {item.avgLatency >= 1000
                          ? `${(item.avgLatency / 1000).toFixed(2)}s`
                          : `${item.avgLatency}ms`}
                      </td>
                      <td className="py-3 pr-3 text-right">
                        <Badge variant="secondary">{item.executionCount}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
