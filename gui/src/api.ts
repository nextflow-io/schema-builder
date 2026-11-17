/** Client for the JSON API of the Python backend (see nf_schema_builder/server.py). */

import type { Schema } from "./model/schema";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`api/${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? `The server answered with status ${response.status}`);
  return payload as T;
}

export const fetchSchema = () => call<{ schema: Schema; name: string | null }>("schema");
export const saveSchema = (schema: Schema) => call<{ status: string }>("schema", "PUT", schema);
/** End the session, saving `schema` first if one is given. */
export const finishEditing = (schema?: Schema) => call<{ status: string }>("finish", "POST", schema);
