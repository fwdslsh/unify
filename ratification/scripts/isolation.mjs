import { resolve } from "node:path";

/** Use the round's recorded masks for every process, including later rejudging. */
export function isolationEnvironment(masks = [], env = process.env) {
  return { ...env, RATIFY_MASK: masks.map((path) => resolve(path)).join(":") };
}
