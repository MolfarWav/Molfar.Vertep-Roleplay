/**
 * React keys for a list whose natural key can repeat (two worn "boots", two events with the same id and weight,
 * two edges between the same pair). The first of a kind keeps its plain key, so it stays put when the list
 * changes; a repeat gets `~2`, `~3`... in list order. Never the bare index: a row that only moves keeps its key.
 */
export function uniqueKeys<T>(items: readonly T[], keyOf: (item: T) => string): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const base = keyOf(item)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}~${n}`
  })
}

/** The same, as pairs to map over: `withKeys(list, keyOf).map(({ item, key }) => <Row key={key} … />)`. */
export function withKeys<T>(items: readonly T[], keyOf: (item: T) => string): { item: T; key: string }[] {
  const keys = uniqueKeys(items, keyOf)
  return items.map((item, i) => ({ item, key: keys[i] as string }))
}
