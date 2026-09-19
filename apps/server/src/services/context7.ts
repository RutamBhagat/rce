import { resolvePiEnvironment } from "./pi-integrations.ts";

const BASE_URL = "https://context7.com/api";

type SearchResult = {
  id: string;
  title: string;
  description?: string;
  totalSnippets?: number;
  trustScore?: number;
  benchmarkScore?: number;
  versions?: string[];
  source?: string;
};

type SearchResponse = {
  results?: SearchResult[];
  error?: string;
  searchFilterApplied?: boolean;
};

function authHeaders(root: string): Record<string, string> {
  const apiKey = resolvePiEnvironment(root, "CONTEXT7_API_KEY");
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

async function parseErrorResponse(root: string, response: Response): Promise<string> {
  try {
    const json = await response.clone().json() as { message?: string };
    if (json.message) return json.message;
  } catch {
    // Fall back to status-specific messages.
  }

  const hasKey = Boolean(resolvePiEnvironment(root, "CONTEXT7_API_KEY"));
  if (response.status === 429) {
    return hasKey
      ? "Rate limited or quota exceeded. Upgrade your plan at https://context7.com/plans for higher limits."
      : "Rate limited or quota exceeded. Create a free API key at https://context7.com/dashboard for higher limits.";
  }
  if (response.status === 404) {
    return "The library you are trying to access does not exist. Please try with a different library ID.";
  }
  if (response.status === 401) {
    return "Invalid API key. Please check your API key. API keys should start with 'ctx7sk' prefix.";
  }
  return `Request failed with status ${response.status}. Please try again later.`;
}

function reputation(score?: number): "High" | "Medium" | "Low" | "Unknown" {
  if (score === undefined || score < 0) return "Unknown";
  if (score >= 7) return "High";
  if (score >= 4) return "Medium";
  return "Low";
}

function formatSearchResult(result: SearchResult): string {
  const lines = [
    `- Title: ${result.title}`,
    `- Context7-compatible library ID: ${result.id}`,
    `- Description: ${result.description ?? ""}`,
  ];
  if (result.totalSnippets !== undefined && result.totalSnippets !== -1) {
    lines.push(`- Code Snippets: ${result.totalSnippets}`);
  }
  lines.push(`- Source Reputation: ${reputation(result.trustScore)}`);
  if (result.benchmarkScore !== undefined && result.benchmarkScore > 0) {
    lines.push(`- Benchmark Score: ${result.benchmarkScore}`);
  }
  if (result.versions?.length) lines.push(`- Versions: ${result.versions.join(", ")}`);
  if (result.source) lines.push(`- Source: ${result.source}`);
  return lines.join("\n");
}

export async function resolveContext7Library(
  root: string,
  query: string,
  libraryName: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = new URL(`${BASE_URL}/v2/libs/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("libraryName", libraryName);
  const response = await fetch(url, { headers: authHeaders(root), signal });
  if (!response.ok) return parseErrorResponse(root, response);

  const payload = await response.json() as SearchResponse;
  if (!payload.results?.length) {
    return payload.error ?? "No libraries found matching the provided name.";
  }

  const parts: string[] = ["Available Libraries:", ""];
  if (payload.searchFilterApplied) {
    parts.push("**Note:** Your results only include libraries matching your teamspace's library filters. To adjust quality thresholds or blocked libraries, update your filters at https://context7.com/dashboard?tab=policies", "");
  }
  parts.push(payload.results.map(formatSearchResult).join("\n----------\n"));
  return parts.join("\n");
}

export async function queryContext7Docs(
  root: string,
  query: string,
  libraryId: string,
  signal?: AbortSignal,
): Promise<string> {
  const url = new URL(`${BASE_URL}/v2/context`);
  url.searchParams.set("query", query);
  url.searchParams.set("libraryId", libraryId);
  const response = await fetch(url, { headers: authHeaders(root), signal });
  if (!response.ok) return parseErrorResponse(root, response);
  const text = await response.text();
  return text || "Documentation not found or not finalized for this library. Use resolve-library-id to get a valid Context7-compatible library ID.";
}
