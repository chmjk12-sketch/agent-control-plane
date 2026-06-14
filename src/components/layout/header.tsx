"use client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 backdrop-blur-sm px-6">
      <div className="flex-1" />
      <div className="relative hidden md:block">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="搜索..." className="w-64 pl-8 h-9 bg-secondary/50 border-0 focus-visible:ring-1" />
      </div>
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
      </Button>
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-primary/20 text-primary text-xs font-medium">ZW</AvatarFallback>
      </Avatar>
    </header>
  );
}
