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
    return "Load the full instructions for a named installed Agent Skill. Manual-only: invoke this tool only when the user explicitly asks to load or use that skill; do not select skills automatically based on relevance. Use list_skills first only if the user explicitly asks to discover available skills.";
  }

  list(): string {
    if (this.#skills.length === 0) return "No Agent Skills were discovered when RCE started.";

    return this.#skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
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
