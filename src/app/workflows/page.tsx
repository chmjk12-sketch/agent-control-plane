import { Card, CardContent } from "@/components/ui/card";
import { GitBranch, Construction } from "lucide-react";

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Workflows</h1><p className="text-sm text-muted-foreground mt-1">Multi-agent workflow orchestration</p></div>
      <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium mb-1">Workflow Center</h3>
        <p className="text-sm text-muted-foreground max-w-md">This module is under development. It will provide multi-agent workflow orchestration, DAG-based pipelines, and agent collaboration capabilities.</p>
      </CardContent></Card>
    </div>
  );
}
