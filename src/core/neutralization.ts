export const NEUTRALIZED_PACKAGES = ["pi-superpowers"] as const;

export interface SkillOrigin {
  filePath: string;
  sourceInfo: { source: string };
}

const fromPackage = (skill: SkillOrigin, name: string): boolean => {
  const segment = new RegExp(`(^|[\\\\/:])${name}([\\\\/@]|$)`);
  return segment.test(skill.filePath) || segment.test(skill.sourceInfo.source);
};

export function withoutNeutralizedSkills<T extends SkillOrigin>(skills: readonly T[]): T[] {
  return skills.filter((skill) => !NEUTRALIZED_PACKAGES.some((name) => fromPackage(skill, name)));
}
