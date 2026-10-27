const REGISTRY_KEY = Symbol.for("@agegr/pi-web/session-liveness/v1");

interface LivenessRegistry {
  version: number;
  register(lease: {
    name: string;
    sessionId: string;
    sessionFile?: string;
    isActive: () => boolean;
  }): () => void;
}

export function registerLiveness(
  sessionId: string,
  sessionFile: string | undefined,
  isActive: () => boolean,
): () => void {
  const registry = (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] as
    | LivenessRegistry
    | undefined;
  if (registry?.version !== 1) return () => {};
  return registry.register({
    name: "pi-ryker",
    sessionId,
    ...(sessionFile ? { sessionFile } : {}),
    isActive,
  });
}
