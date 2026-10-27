export interface SessionRegistry<T> {
  get(sessionId: string): T | undefined;
  set(sessionId: string, value: T): void;
  delete(sessionId: string): void;
  has(sessionId: string): boolean;
  ids(): string[];
}

export function createSessionRegistry<T>(): SessionRegistry<T> {
  const entries = new Map<string, T>();
  return {
    get: (sessionId) => entries.get(sessionId),
    set: (sessionId, value) => {
      entries.set(sessionId, value);
    },
    delete: (sessionId) => {
      entries.delete(sessionId);
    },
    has: (sessionId) => entries.has(sessionId),
    ids: () => [...entries.keys()],
  };
}
