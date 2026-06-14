"use client";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rocket, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { timeAgo } from "@/lib/utils";

const statusColors: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  success: "success", failed: "destructive", pending: "warning", deploying: "secondary", rolled_back: "destructive",
};

export default function DeploymentsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: "20" });
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/deployments?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [statusFilter, page]);

  const handleRollback = async (id: string) => {
    await fetch(`/api/deployments/${id}/rollback`, { method: "POST" });
    const params = new URLSearchParams({ page: page.toString(), limit: "20" });
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/deployments?${params}`).then((r) => r.json()).then(setData);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
        <p className="text-sm text-muted-foreground mt-1">Release history and rollback management</p>
      </div>

      <div className="flex items-center gap-4">
        <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rolled_back">Rolled Back</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[80px] rounded-xl bg-card border border-border animate-pulse" />)
        ) : (
          data?.data?.map((d: any) => (
            <Card key={d.id} className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-secondary/50"><Rocket className="h-4 w-4" /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{d.agent?.name || "Unknown"}</span>
                      <Badge variant="secondary" className="text-[10px]">{d.version?.versionTag || "N/A"}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{d.gitCommit?.slice(0, 7) || "N/A"}</span>
                      <span>{d.imageTag || "N/A"}</span>
                      {d.deployedAt && <span>{timeAgo(d.deployedAt)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={statusColors[d.status] || "secondary"}>{d.status}</Badge>
                  {d.status === "success" && (
                    <Button variant="outline" size="sm" onClick={() => handleRollback(d.id)}>
                      <RotateCcw className="h-3 w-3 mr-1" />Rollback
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
