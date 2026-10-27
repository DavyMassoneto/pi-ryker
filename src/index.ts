import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerClosingTools } from "./pi/closingTools.ts";
import { registerCommand } from "./pi/command.ts";
import { registerEvents } from "./pi/events.ts";
import { registerProjectSession } from "./pi/projectSession.ts";
import { registerTools } from "./pi/tools.ts";

export default function ryker(pi: ExtensionAPI): void {
  registerTools(pi);
  registerClosingTools(pi);
  registerCommand(pi);
  registerEvents(pi);
  registerProjectSession(pi);
}
