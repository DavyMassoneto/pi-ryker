export interface UiHandle {
  hasUI: boolean;
  ui: {
    setStatus(key: string, text: string | undefined): void;
    setWidget(key: string, content: string[] | undefined): void;
    notify(message: string, level?: "info" | "warning" | "error"): void;
    select?(title: string, options: string[]): Promise<string | undefined>;
    confirm?(title: string, message: string): Promise<boolean>;
  };
}

export interface LiveUi {
  current(): UiHandle["ui"] | undefined;
  retire(): void;
}

export function createLiveUi(source: UiHandle): LiveUi {
  let retired = false;
  return {
    current: () => {
      if (retired) return undefined;
      try {
        return source.hasUI ? source.ui : undefined;
      } catch {
        retired = true;
        return undefined;
      }
    },
    retire: () => {
      retired = true;
    },
  };
}
