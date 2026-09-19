import crypto from "node:crypto";
import Parallel from "parallel-web";
import { resolvePiApiKey } from "./pi-integrations.ts";

const sessionId = crypto.randomUUID();

export type ParallelSearchInput = {
  objective: string;
  search_queries: string[];
};

export type ParallelFetchInput = {
  urls: string[];
  objective?: string;
  search_queries?: string[];
};

async function client(root: string): Promise<Parallel> {
  const apiKey = await resolvePiApiKey(root, "parallel", "PARALLEL_API_KEY");
  if (!apiKey) {
    throw new Error("Parallel authentication required. Configure Pi provider 'parallel' or set PARALLEL_API_KEY.");
  }
  return new Parallel({ apiKey });
}

export async function parallelSearch(
  root: string,
  input: ParallelSearchInput,
  signal?: AbortSignal,
): Promise<unknown> {
  return (await client(root)).search({
    objective: input.objective,
    search_queries: input.search_queries,
    mode: "advanced",
    session_id: sessionId,
  }, signal ? { signal } : undefined);
}

export async function parallelFetch(
  root: string,
  input: ParallelFetchInput,
  signal?: AbortSignal,
): Promise<unknown> {
  return (await client(root)).extract({
    urls: input.urls,
    objective: input.objective,
    search_queries: input.search_queries,
    session_id: sessionId,
  }, signal ? { signal } : undefined);
}
