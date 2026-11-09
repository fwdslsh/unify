/** Execution status is separate from scored site quality. No transport or model code here. */
export function executionFailure(exit, agent) {
  const message = [agent.error, exit.exit !== 0 ? agent.logged : null].filter(Boolean).join(" ");
  if (/context (?:size|length|limit)|exceeds.*context|too many tokens/i.test(message)) return "context-limit";
  if (exit.error || exit.signal || exit.exit == null || [126, 127].includes(exit.exit) ||
      /^(APIError|ProviderAuthError|ModelNotFoundError)$/.test(agent.errorName ?? "") ||
      /insufficient.*fund|unauthori[sz]ed|authentication|rate.?limit|cannot connect|connection refused|fetch failed|service unavailable|HTTP (?:401|402|403|429|5\d\d)/i.test(message)) return "infrastructure";
  if (exit.timedOut) return "timeout";
  if (agent.error) return "agent-error";
  return exit.exit === 0 ? null : "agent-exit";
}

/** Stop on a broken connection, preserve the attempted sample, never burn the remaining queue. */
export async function runSerial(jobs, { launch, inspect, checkpoint }) {
  for (const job of jobs) {
    await checkpoint({ status: "running", active: job.label });
    const exit = await launch(job);
    const failure = executionFailure(exit, await inspect(job));
    await checkpoint({ status: failure === "infrastructure" ? "interrupted" : "running", active: null,
      lastCompleted: job.label, failure });
    if (failure === "infrastructure") return false;
  }
  await checkpoint({ status: "finished", active: null });
  return true;
}

export function scoreVerdict(briefs, models, expected) {
  const samples = briefs.flatMap(b => b.samples);
  const complete = samples.length === expected;
  const groups = briefs.flatMap(b => models.map(model => b.samples.filter(s => s.model === model)));
  const measured = complete && groups.length > 0 && groups.every(g => g.length >= 5);
  const barMet = measured ? groups.every(g => g.filter(s => s.pass).length / g.length >= 0.8) : null;
  return { complete, completed: samples.length, expected, passed: samples.filter(s => s.pass).length,
    barMet, exitCode: !complete ? 2 : measured ? (barMet ? 0 : 1) : (samples.every(s => s.pass) ? 0 : 1) };
}
