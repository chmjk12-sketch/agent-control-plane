import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Settings, User, Bell, Key, Database } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Settings</h1><p className="text-sm text-muted-foreground mt-1">System configuration and preferences</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />Profile</CardTitle><CardDescription>Your account information</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Name</label><Input defaultValue="Zhang Wei" className="mt-1" /></div>
            <div><label className="text-xs text-muted-foreground">Email</label><Input defaultValue="zhangwei@example.com" className="mt-1" /></div>
            <Button size="sm">Save Changes</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" />Notifications</CardTitle><CardDescription>Configure notification preferences</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm">Email notifications</span><Badge variant="success">Enabled</Badge></div>
            <div className="flex items-center justify-between"><span className="text-sm">Slack integration</span><Badge variant="secondary">Not configured</Badge></div>
            <div className="flex items-center justify-between"><span className="text-sm">Webhook alerts</span><Badge variant="secondary">Not configured</Badge></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" />System</CardTitle><CardDescription>System information</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span>1.0.0</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Environment</span><Badge variant="secondary">Development</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Database</span><span>SQLite (Dev)</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Key className="h-4 w-4" />API Keys</CardTitle><CardDescription>Manage API keys and tokens</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm font-mono text-xs">sk-***...***abc</span><Button variant="outline" size="sm">Revoke</Button></div>
            <Button variant="outline" size="sm">Generate New Key</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
