"use client";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCost, formatTokens, formatLatency, timeAgo } from "@/lib/utils";

export default function ExecutionsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: "20" });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/executions?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [search, statusFilter, page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Executions</h1>
        <p className="text-sm text-muted-foreground mt-1">Track all agent execution records</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by request ID or agent name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Request ID</th>
                  <th className="p-3 font-medium">Agent</th>
                  <th className="p-3 font-medium">Version</th>
                  <th className="p-3 font-medium">Input</th>
                  <th className="p-3 font-medium">Output</th>
                  <th className="p-3 font-medium">Total</th>
                  <th className="p-3 font-medium">Cost</th>
                  <th className="p-3 font-medium">Latency</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-border"><td colSpan={10} className="p-3"><div className="h-4 bg-secondary rounded animate-pulse" /></td></tr>
                  ))
                ) : (
                  data?.data?.map((e: any) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                      <td className="p-3 font-mono text-xs max-w-[180px] truncate">{e.requestId}</td>
                      <td className="p-3">{e.agent?.name || "N/A"}</td>
                      <td className="p-3"><Badge variant="secondary" className="text-[10px]">{e.version?.versionTag || "N/A"}</Badge></td>
                      <td className="p-3 text-muted-foreground">{formatTokens(e.inputTokens)}</td>
                      <td className="p-3 text-muted-foreground">{formatTokens(e.outputTokens)}</td>
                      <td className="p-3 font-medium">{formatTokens(e.totalTokens)}</td>
                      <td className="p-3">{formatCost(e.cost)}</td>
                      <td className="p-3">{formatLatency(e.latencyMs)}</td>
                      <td className="p-3"><Badge variant={e.status === "success" ? "success" : e.status === "failed" ? "destructive" : "warning"}>{e.status}</Badge></td>
                      <td className="p-3 text-muted-foreground">{timeAgo(e.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {data.pagination.page} of {data.pagination.totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
