// quorum.js：数节点与判过半（乘二后严格大于总数才算过半）
export function countOf(sides, side) {
  let count = 0;
  for (const row of sides || []) {
    if (row && row[1] === side) count += 1;
  }
  return count;
}

export function majorOf(count, total) {
  return Number(count) * 2 > Number(total);
}
