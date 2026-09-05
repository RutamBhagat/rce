import ipaddr from "ipaddr.js";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export async function secureCimdFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const raw = input instanceof Request ? input.url : input.toString();
  const url = new URL(raw);
  const rawPath = raw.slice("https://".length).split(/[?#]/, 1)[0]?.replace(/^[^/]+/, "") ?? "";
  if (rawPath.split("/").some((segment) => {
    try {
      return [".", ".."].includes(decodeURIComponent(segment));
    } catch {
      return true;
    }
  })) throw new TypeError("CIMD client_id must not contain dot path segments.");

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true, order: "verbatim" });
  if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== "unicast")) {
    throw new TypeError("CIMD client_id must resolve only to public IP addresses.");
  }
  const pinned = addresses.find(({ family }) => family === 4) ?? addresses[0]!;

  return await new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "GET",
      agent: false,
      signal: init?.signal ?? AbortSignal.timeout(5_000),
      servername: hostname,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      },
    }, (response) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        else if (value !== undefined) headers.set(name, value);
      }
      const status = response.statusCode ?? 502;
      if (status !== 200) {
        response.resume();
        resolve(new Response(null, { status, statusText: response.statusMessage, headers }));
        return;
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
        status,
        statusText: response.statusMessage,
        headers,
      }));
    });
    req.on("error", reject);
    req.end();
  });
}
