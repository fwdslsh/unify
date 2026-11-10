/**
 * retrospective.mjs — reading the turn run-round.mjs adds after a sample's run: the same
 * agent, in the same session, asked to look back on using unify (briefs/RETROSPECTIVE.md).
 * The asking is run-round.mjs's; these are the pure parts, so they can be tested.
 */

/** The events of an `opencode run --format json` stream: one JSON object with a `type` per line. */
const events = (text) => text.split("\n").flatMap((line) => {
  try {
    const e = JSON.parse(line);
    return e && typeof e.type === "string" ? [e] : [];
  } catch { return []; }
});

/** The OpenCode session a run's event stream belongs to, or null: the follow-up continues it. */
export function sessionOf(stream) {
  return events(stream).find((e) => typeof e.sessionID === "string" && e.sessionID)?.sessionID ?? null;
}

/**
 * What the agent answered. From an event stream, its text parts in order; from an agent
 * that is not OpenCode (`--agent`), whose output is not an event stream, the output itself.
 */
export function replyOf(output) {
  const stream = events(output);
  if (!stream.length) return output.trim();
  return stream.filter((e) => e.type === "text" && typeof e.part?.text === "string").map((e) => e.part.text.trim()).filter(Boolean).join("\n\n");
}

/**
 * The follow-up is asked of every run that ended on its own without an error — exit 0 and
 * no error event — whether or not what it built would pass: a sample that failed its
 * brief is the one whose account is most worth having.
 */
export function finishedCleanly(exit, agentError) {
  return exit?.exit === 0 && !agentError;
}
