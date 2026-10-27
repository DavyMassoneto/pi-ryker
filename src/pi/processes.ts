import type { BashOperations } from "@earendil-works/pi-coding-agent";

export interface ShellTracker {
  operations: BashOperations;
  running(): number;
  abortAll(): void;
}

export function trackShell(base: BashOperations): ShellTracker {
  const active = new Set<AbortController>();
  return {
    operations: {
      exec: async (command, cwd, options) => {
        const controller = new AbortController();
        const forward = (): void => controller.abort();
        if (options.signal?.aborted) controller.abort();
        options.signal?.addEventListener("abort", forward, { once: true });
        active.add(controller);
        try {
          return await base.exec(command, cwd, { ...options, signal: controller.signal });
        } finally {
          active.delete(controller);
          options.signal?.removeEventListener("abort", forward);
        }
      },
    },
    running: () => active.size,
    abortAll: () => {
      for (const controller of [...active]) controller.abort();
    },
  };
}
