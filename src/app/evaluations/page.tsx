import { Card, CardContent } from "@/components/ui/card";
import { TestTube, Construction } from "lucide-react";

export default function EvaluationsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Evaluations</h1><p className="text-sm text-muted-foreground mt-1">Agent quality evaluation and benchmarking</p></div>
      <Card className="border-dashed"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="font-medium mb-1">Evaluation Center</h3>
        <p className="text-sm text-muted-foreground max-w-md">This module is under development. It will provide agent quality evaluation, benchmarking, and performance scoring capabilities.</p>
      </CardContent></Card>
    </div>
  );
}
