import {
  DefaultResourceLoader,
  getAgentDir,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";

export class SkillService {
  readonly #skills: Skill[];

  private constructor(skills: Skill[]) {
    this.#skills = skills;
  }

  static async create(root: string): Promise<SkillService> {
    const loader = new DefaultResourceLoader({
      cwd: root,
      agentDir: getAgentDir(),
      noExtensions: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    return new SkillService(loader.getSkills().skills);
  }

  get toolDescription(): string {
    const visible = this.#skills.filter((skill) => !skill.disableModelInvocation);
    if (visible.length === 0) {
      return "Load the full instructions for an installed Agent Skill. No model-invokable skills were discovered when RCE started.";
    }

    return [
      "Load the full instructions for an installed Agent Skill when the task matches its description. Skills are discovered by Pi when RCE starts and loaded only on demand.",
      "Available skills:",
      ...visible.map((skill) => `- ${skill.name}: ${skill.description}`),
    ].join("\n");
  }

  list(): string {
    const visible = this.#skills.filter((skill) => !skill.disableModelInvocation);
    if (visible.length === 0) return "No model-invokable Agent Skills were discovered when RCE started.";

    return visible.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  }

  async load(name: string): Promise<string> {
    const skill = this.#skills.find((candidate) => candidate.name === name);
    if (!skill) throw new Error(`Unknown skill: ${name}`);

    const content = await readFile(skill.filePath, "utf8");
    return [
      `<skill name="${escapeXml(skill.name)}" location="${escapeXml(skill.filePath)}">`,
      `Resolve every relative path in this skill against: ${skill.baseDir}`,
      "Use absolute paths when reading references/assets or executing helper scripts. Do not assume skill-relative paths are relative to the RCE project root.",
      "",
      content,
      "</skill>",
    ].join("\n");
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
