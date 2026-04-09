import type {
  Scenario,
  ScenarioConstraints,
  Run,
  RunEvent,
  ScenarioTemplate,
  SimulationMode,
  ApiResponse,
  DecisionGate,
} from "@/types/entities";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    return { data: null as unknown as T, error: body.detail ?? res.statusText };
  }
  const data = await res.json();
  return { data, error: null };
}

// ─── Scenarios ───

export async function createScenario(
  prompt: string,
  constraints: Partial<ScenarioConstraints> = {}
): Promise<ApiResponse<Scenario>> {
  return request<Scenario>("/api/scenarios", {
    method: "POST",
    body: JSON.stringify({ prompt, constraints }),
  });
}

// ─── Runs ───

export async function startRun(
  scenarioId: string,
  mode: SimulationMode = "play"
): Promise<ApiResponse<Run>> {
  return request<Run>("/api/runs", {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId, mode }),
  });
}

export async function getRun(runId: string): Promise<ApiResponse<Run>> {
  return request<Run>(`/api/runs/${runId}`);
}

export function streamRunEvents(
  runId: string,
  onEvent: (event: RunEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const eventSource = new EventSource(`${API_BASE}/api/runs/${runId}/events`);

  eventSource.onmessage = (msg) => {
    try {
      const event: RunEvent = JSON.parse(msg.data);
      onEvent(event);
    } catch (err) {
      onError?.(err as Error);
    }
  };

  eventSource.onerror = () => {
    onError?.(new Error("SSE connection lost"));
    eventSource.close();
  };

  return () => eventSource.close();
}

// ─── Approvals ───

export async function resolveGate(
  runId: string,
  gateId: string,
  action: "approve" | "reject" | "reroute"
): Promise<ApiResponse<DecisionGate>> {
  return request<DecisionGate>(`/api/runs/${runId}/approve`, {
    method: "POST",
    body: JSON.stringify({ gate_id: gateId, action }),
  });
}

// ─── Remix ───

export async function remixRun(
  runId: string,
  newConstraints: Partial<ScenarioConstraints>
): Promise<ApiResponse<Run>> {
  return request<Run>(`/api/runs/${runId}/remix`, {
    method: "POST",
    body: JSON.stringify({ constraints: newConstraints }),
  });
}

// ─── Templates ───

export async function getTemplates(): Promise<ApiResponse<ScenarioTemplate[]>> {
  return request<ScenarioTemplate[]>("/api/templates");
}

// ─── Feedback ───

export async function submitFeedback(
  runId: string,
  rating: number,
  comment?: string
): Promise<ApiResponse<{ id: string }>> {
  return request<{ id: string }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify({ run_id: runId, rating, comment }),
  });
}
