import {
  DefaultResourceLoader,
  getAgentDir,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type InstalledSkill = {
  skill: Skill;
  files: string[];
};

export class SkillService {
  readonly #skills: InstalledSkill[];

  private constructor(skills: InstalledSkill[]) {
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
    const skills = await Promise.all(loader.getSkills().skills.map(async (skill) => ({
      skill,
      files: await listBundledFiles(skill.baseDir, skill.filePath),
    })));
    return new SkillService(skills);
  }

  get toolDescription(): string {
    if (this.#skills.length === 0) return "No Agent Skills are installed.";

    const catalog = this.#skills.map(({ skill }) => {
      const mode = skill.disableModelInvocation ? " [manual: load when the user names this skill]" : "";
      return `- ${skill.name}${mode}: ${skill.description}`;
    }).join("\n");
    return `Load an installed Agent Skill by exact name when its description matches the task or the user names it. Available skills:\n${catalog}`;
  }

  list(): string {
    if (this.#skills.length === 0) return "No Agent Skills were discovered when RCE started.";

    return this.#skills.map(({ skill, files }) => {
      const mode = skill.disableModelInvocation ? " [manual]" : "";
      const bundled = files.length === 0 ? "" : `\n  Bundled files: ${summarizeFiles(files)}`;
      return `- ${skill.name}${mode}: ${skill.description}${bundled}`;
    }).join("\n");
  }

  async load(name: string): Promise<string> {
    const installed = this.#skills.find(({ skill }) => skill.name === name);
    if (!installed) throw new Error(`Unknown skill: ${name}`);

    const { skill, files } = installed;
    const content = await readFile(skill.filePath, "utf8");
    const manifest = files.length === 0
      ? "Bundled files: none"
      : ["Bundled files (paths relative to the skill directory):", ...files.map((file) => `- ${file}`)].join("\n");
    return [
      `<skill name="${escapeXml(skill.name)}" location="${escapeXml(skill.filePath)}">`,
      `Resolve every relative path in this skill against: ${skill.baseDir}`,
      "Use absolute paths when reading references/assets or executing helper scripts. Do not assume skill-relative paths are relative to the RCE project root.",
      manifest,
      "",
      content,
      "</skill>",
    ].join("\n");
  }
}

async function listBundledFiles(baseDir: string, skillFilePath: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && absolute !== skillFilePath) files.push(path.relative(baseDir, absolute));
    }
  };
  await visit(baseDir);
  return files.sort();
}

function summarizeFiles(files: string[]): string {
  const shown = files.slice(0, 8);
  const omitted = files.length - shown.length;
  return `${shown.join(", ")}${omitted > 0 ? `, … (+${omitted} more)` : ""}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
