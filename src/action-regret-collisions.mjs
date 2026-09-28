import assert from 'node:assert/strict'

function finite(value) {
  return Number.isFinite(value)
}

export function auditActionFeatureCollisions(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0, 'preference rows are required')
  const groups = new Map()
  let totalWeight = 0
  for (const row of rows) {
    assert.ok(typeof row.rootId === 'string' && row.rootId, 'rootId is required')
    assert.ok(Array.isArray(row.difference) && row.difference.length > 0 &&
      row.difference.every(finite), 'difference values must be finite')
    assert.ok(row.target === 1 || row.target === -1, 'target must be +1 or -1')
    assert.ok(finite(row.weight) && row.weight > 0, 'weight must be positive and finite')
    const key = JSON.stringify(row.difference)
    const group = groups.get(key) ?? {
      difference: [...row.difference],
      positiveWeight: 0,
      negativeWeight: 0,
      rootIds: new Set(),
      rows: 0,
    }
    if (row.target === 1) group.positiveWeight += row.weight
    else group.negativeWeight += row.weight
    group.rootIds.add(row.rootId)
    group.rows += 1
    groups.set(key, group)
    totalWeight += row.weight
  }

  const conflicts = [...groups.values()]
    .filter((group) => group.positiveWeight > 0 && group.negativeWeight > 0)
    .sort((left, right) => JSON.stringify(left.difference).localeCompare(JSON.stringify(right.difference)))
  const irreducibleWeight = conflicts.reduce(
    (sum, group) => sum + Math.min(group.positiveWeight, group.negativeWeight),
    0,
  )
  return {
    rows: rows.length,
    totalWeight,
    uniqueDeltas: groups.size,
    conflictingDeltas: conflicts.length,
    conflictingRows: conflicts.reduce((sum, group) => sum + group.rows, 0),
    irreducibleWeight,
    contextFreeAccuracyCeiling: 1 - irreducibleWeight / totalWeight,
    conflicts: conflicts.map((group) => ({
      difference: group.difference,
      positiveWeight: group.positiveWeight,
      negativeWeight: group.negativeWeight,
      rootIds: [...group.rootIds].sort(),
    })),
  }
}
