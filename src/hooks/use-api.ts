"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE = "/api";

async function fetchJson(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

export function useOverview() {
  return useQuery({ queryKey: ["overview"], queryFn: () => fetchJson(`${BASE}/overview`), refetchInterval: 30000 });
}

export function useAgents(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["agents", params], queryFn: () => fetchJson(`${BASE}/agents${qs}`) });
}

export function useAgent(id: string) {
  return useQuery({ queryKey: ["agent", id], queryFn: () => fetchJson(`${BASE}/agents/${id}`), enabled: !!id });
}

export function useAgentVersions(agentId: string) {
  return useQuery({ queryKey: ["agent-versions", agentId], queryFn: () => fetchJson(`${BASE}/agents/${agentId}/versions`), enabled: !!agentId });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => fetchJson(`${BASE}/agents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`${BASE}/agents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useExecutions(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["executions", params], queryFn: () => fetchJson(`${BASE}/executions${qs}`) });
}

export function useDeployments(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["deployments", params], queryFn: () => fetchJson(`${BASE}/deployments${qs}`) });
}

export function useCreateDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => fetchJson(`${BASE}/deployments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deployments"] }); qc.invalidateQueries({ queryKey: ["agents"] }); },
  });
}

export function useRollbackDeployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fetchJson(`${BASE}/deployments/${id}/rollback`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deployments"] }); qc.invalidateQueries({ queryKey: ["agents"] }); },
  });
}

export function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: () => fetchJson(`${BASE}/health`), refetchInterval: 15000 });
}

export function useAgentHealth(agentId: string) {
  return useQuery({ queryKey: ["agent-health", agentId], queryFn: () => fetchJson(`${BASE}/health/${agentId}`), enabled: !!agentId, refetchInterval: 15000 });
}
