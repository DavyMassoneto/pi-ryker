export function planHeadings(planText: string): string[] {
  return planText
    .split(/\r?\n/)
    .map((line) => /^## (.+?)\s*(?:\(.*\))?$/.exec(line)?.[1]?.trim())
    .filter((heading): heading is string => heading !== undefined);
}
