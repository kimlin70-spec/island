// A* 길찾기. 8방향, 모서리를 비스듬히 끊고 지나가지 않는다.
// costAt(col, row): 지나갈 수 없으면 0, 지나갈 수 있으면 그 칸에 들어가는 비용(보통 1).
// goal: 도착 칸 하나, 또는 칸 목록(그중 가장 적은 비용으로 갈 수 있는 곳까지의 길).
// sideOk(col, row): 비스듬히 갈 때 양옆 칸이 비어 있는가. 주지 않으면 costAt 이 0이 아닌 칸.
//   (좀비는 시설을 부수고 지나갈 수 있지만, 시설 두 개 사이를 비스듬히 빠져나가지는 못한다)
// 돌려주는 값: 시작 칸부터 도착 칸까지의 칸 목록(.cost 에 전체 비용). 길이 없으면 null.

const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
const DIAG = Math.SQRT2;

export function findPath(cols, rows, start, goal, costAt, sideOk = (c, r) => costAt(c, r) > 0) {
  const goals = (Array.isArray(goal) ? goal : [goal]).filter((t) =>
    t.col >= 0 && t.row >= 0 && t.col < cols && t.row < rows && (costAt(t.col, t.row) || (t.col === start.col && t.row === start.row)));
  if (goals.some((t) => t.col === start.col && t.row === start.row)) {
    const same = [{ col: start.col, row: start.row }];
    same.cost = 0;
    return same;
  }
  if (!goals.length) return null;

  const n = cols * rows;
  const g = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const isGoal = new Uint8Array(n);
  for (const t of goals) isGoal[t.row * cols + t.col] = 1;
  const startI = start.row * cols + start.col;
  let goalI = -1;

  // 가장 가까운 도착 칸까지의 거리(8방향)
  const h = (c, r) => {
    let best = Infinity;
    for (const t of goals) {
      const dx = Math.abs(c - t.col), dy = Math.abs(r - t.row);
      best = Math.min(best, Math.max(dx, dy) + (DIAG - 1) * Math.min(dx, dy));
    }
    return best;
  };

  // 작은 값이 먼저 나오는 더미
  const heap = [];
  const push = (i, f) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };

  g[startI] = 0;
  push(startI, h(start.col, start.row));

  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (isGoal[cur]) { goalI = cur; break; }
    const cc = cur % cols, cr = (cur - cc) / cols;

    for (const [dc, dr] of DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (closed[ni]) continue;
      const cost = costAt(nc, nr);
      if (!cost) continue;
      const diagonal = dc !== 0 && dr !== 0;
      // 비스듬히 갈 때는 양옆 칸이 모두 비어 있어야 한다
      if (diagonal && (!sideOk(cc + dc, cr) || !sideOk(cc, cr + dr))) continue;
      const ng = g[cur] + cost * (diagonal ? DIAG : 1);
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = cur;
        push(ni, ng + h(nc, nr));
      }
    }
  }

  if (goalI === -1) return null;
  const path = [];
  for (let i = goalI; i !== -1; i = from[i]) path.push({ col: i % cols, row: Math.floor(i / cols) });
  path.reverse();
  path.cost = g[goalI];
  return path;
}
