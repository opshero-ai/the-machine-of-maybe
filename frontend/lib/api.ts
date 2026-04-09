import type {
  Scenario,
  Run,
  RunEvent,
  ScenarioTemplate,
  SimulationMode,
  ApiResponse,
  DecisionGate,
} from "@/types/entities";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ─── Backend Mapping ───
// Frontend and backend use different enum values — map at API boundary

const MODE_TO_BACKEND: Record<SimulationMode, string> = {
  play: "full_auto",
  explore: "guided",
  prove: "step_by_step",
};

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
    // FastAPI 422 returns detail as array of objects — stringify for display
    const detail = body.detail;
    const errorMsg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((e: Record<string, unknown>) => e.msg ?? JSON.stringify(e)).join("; ")
          : JSON.stringify(detail ?? res.statusText);
    return { data: null as unknown as T, error: errorMsg };
  }
  const data = await res.json();
  return { data, error: null };
}

// ─── Scenarios ───

/** Map frontend constraints to backend ScenarioConstraints shape. */
function mapConstraints(c: {
  urgency?: string;
  risk_tolerance?: string;
  autonomy?: string;
}): Record<string, unknown> {
  const riskMap: Record<string, string> = {
    conservative: "low",
    balanced: "medium",
    aggressive: "high",
  };
  const urgencyMap: Record<string, string> = {
    low: "weeks",
    medium: "days",
    high: "hours",
    critical: "urgent",
  };
  return {
    risk_tolerance: riskMap[c.risk_tolerance ?? ""] ?? "medium",
    time_pressure: urgencyMap[c.urgency ?? ""] ?? undefined,
  };
}

export async function createScenario(
  prompt: string,
  constraints: { urgency?: string; risk_tolerance?: string; autonomy?: string } = {}
): Promise<ApiResponse<Scenario>> {
  return request<Scenario>("/api/scenarios", {
    method: "POST",
    body: JSON.stringify({ prompt, constraints: mapConstraints(constraints) }),
  });
}

// ─── Runs ───

export async function startRun(
  scenarioId: string,
  mode: SimulationMode = "play"
): Promise<ApiResponse<Run>> {
  return request<Run>("/api/runs", {
    method: "POST",
    body: JSON.stringify({
      scenario_id: scenarioId,
      mode: MODE_TO_BACKEND[mode] ?? "guided",
    }),
  });
}

/** Backend GET /runs/{id} returns { run, agents, tasks, gates }. */
export interface FullRunResponse {
  run: Record<string, unknown>;
  agents: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  gates: Record<string, unknown>[];
}

export async function getRunFull(runId: string): Promise<ApiResponse<FullRunResponse>> {
  return request<FullRunResponse>(`/api/runs/${runId}`);
}

export async function getRun(runId: string): Promise<ApiResponse<Run>> {
  const res = await request<FullRunResponse>(`/api/runs/${runId}`);
  if (res.error) return { data: null as unknown as Run, error: res.error };
  // Extract the run object from the nested response
  return { data: res.data.run as unknown as Run, error: null };
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
  newConstraints: Record<string, unknown>
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
