// quorum.js：数节点与判过半（2*count 严格大于 total 才算过半）
export function countOf(sides, side) {
  let count = 0;
  for (const row of sides || []) {
    if (row && row[1] === side) count += 1;
  }
  return count;
}

export function majorOf(count, total) {
  return count * 2 > total;
}
