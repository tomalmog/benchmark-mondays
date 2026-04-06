export const ENGINE_URL =
  process.env.ENGINE_URL || "http://34.145.187.178:3001";

export async function fetchEngine(path: string, init?: RequestInit) {
  return fetch(`${ENGINE_URL}${path}`, init);
}
