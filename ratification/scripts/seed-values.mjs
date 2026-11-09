/** Read expectations from the committed fixture, never from an agent's mutable copy. */
export function privateSeedValues(node, fields = ["keeper_contact"]) {
  const values = new Set();
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (fields.includes(key) && typeof child === "string" && child) values.add(child);
        else visit(child);
      }
    }
  };
  visit(node);
  return [...values].sort();
}
