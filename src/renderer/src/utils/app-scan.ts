// A partial scan can add/update entries, but cannot prove that a previously
// discovered application disappeared. User metadata survives both paths.
export function mergeScannedApps<T extends { id: string }>(previous: T[], incoming: T[], complete: boolean): T[] {
  const known = new Map(previous.map(app => [app.id, app]))
  const result = complete ? new Map<string, T>() : new Map(known)
  for (const app of incoming) result.set(app.id, { ...known.get(app.id), ...app })
  return [...result.values()]
}
