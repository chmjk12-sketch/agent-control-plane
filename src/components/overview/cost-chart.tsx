"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface DailyCost { date: string; cost: number; requests: number; }

export function CostChart({ data }: { data: DailyCost[] }) {
  const maxCost = Math.max(...data.map((d) => d.cost), 0.01);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">Daily Cost Trend</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="h-[160px] flex items-end gap-2">
          {data.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <span className="text-[10px] text-muted-foreground">${d.cost.toFixed(2)}</span>
              <div className="w-full rounded-t-sm bg-primary/60 hover:bg-primary/80 transition-colors min-h-[4px]" style={{ height: `${(d.cost / maxCost) * 120}px` }} />
              <span className="text-[10px] text-muted-foreground">{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
