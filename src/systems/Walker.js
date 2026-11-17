import { findPath } from './Pathfinder.js';

// 칸 위를 걸어 다니는 것(주인공, 좀비)의 공통 부분: 위치, 길, 한 걸음씩 걷기, 몸이 걸친 칸.
//   col, row: 지금 위치(소수 칸)
//   tile:     지금 서 있는(또는 막 떠난) 칸
//   path:     앞으로 지나갈 칸들. path[0]은 지금 들어서는 칸이다.
// 어디로 갈 수 있는지는 costAt(그 칸에 들어가는 비용, 0이면 못 감)과
// sideOk(비스듬히 갈 때 양옆 칸이 비어 있는가)로 정한다. 기본은 주인공의 규칙(시설이 있는 칸은 못 감)이다.
export class Walker {
  constructor(map, col, row) {
    this.map = map;
    this.col = col;
    this.row = row;
    this.tile = { col, row };
    this.path = [];
  }

  get moving() { return this.path.length > 0; }

  costAt(col, row) { return this.map.isWalkable(col, row) ? 1 : 0; }
  sideOk(col, row) { return this.costAt(col, row) > 0; }

  // 몸의 한가운데가 있는 칸
  here() { return { col: Math.round(this.col), row: Math.round(this.row) }; }

  // goals(칸 목록) 중 가장 적은 비용으로 갈 수 있는 곳까지의 길. from(기본: this.tile)에서 출발한다. 없으면 null.
  findRoute(goals, from = this.tile) {
    const m = this.map;
    return findPath(m.cols, m.rows, from, goals, (c, r) => this.costAt(c, r), (c, r) => this.sideOk(c, r));
  }

  // goals 중 가장 가까운 곳까지의 길로 바꾼다. 갈 수 없으면 false.
  routeTo(goals) {
    const best = this.findRoute(goals);
    if (!best) return false;
    this.follow(best);
    return true;
  }

  // routeTo 와 같지만, 한 걸음 내딛는 중이면 그 칸까지는 그대로 가고 거기서부터 길을 찾는다(되돌아가지 않는다).
  // 길을 자주 다시 찾는 좀비와, 적을 쫓아가는 주인공이 쓴다. 갈 수 없으면 false.
  routeOn(goals) {
    const next = this.path[0];
    const midStep = next && (this.col !== this.tile.col || this.row !== this.tile.row);
    if (!midStep) return this.routeTo(goals);
    const best = this.findRoute(goals, next);
    if (!best) return false;
    this.path = best;                                // best[0] 이 지금 들어서는 칸이다
    return true;
  }

  // 새 길(this.tile 부터 시작하는 칸 목록)을 따라가게 한다.
  // 걷던 중이면 떠나온 칸과 가던 칸 사이에 있다. 새 길이 가던 칸을 바로 지나가면 되돌아가지 않고 그대로 이어 간다.
  follow(best) {
    const next = this.path[0];
    if (next && best.length >= 2 && best[1].col === next.col && best[1].row === next.row) best.shift();
    this.path = (!next && best.length === 1) ? [] : best;   // 이미 그 칸에 서 있으면 갈 곳이 없다
  }

  // 지금 몸이 걸쳐 있는 칸들. 여기에는 시설을 지을 수 없다.
  // 서 있으면 그 칸. 걷는 중이면 막 떠난 칸, 지금 자리, 막 들어서는 칸을 모두 덮는 칸들(비스듬히 가는 중이면 양옆 칸까지 네 칸).
  // 막 떠난 칸도 따로 넣는다. 소수 계산의 오차로, 들어서는 칸에 딱 닿았지만 아직 도착하지 않은 프레임이 있다.
  occupiedTiles() {
    const pts = [this.tile, this, this.path[0] || this];
    const cs = pts.map((p) => p.col), rs = pts.map((p) => p.row);
    const out = [];
    for (let c = Math.floor(Math.min(...cs)); c <= Math.ceil(Math.max(...cs)); c++) {
      for (let r = Math.floor(Math.min(...rs)); r <= Math.ceil(Math.max(...rs)); r++) out.push({ col: c, row: r });
    }
    return out;
  }

  // a 에서 이웃 칸 b 로 한 걸음 갈 수 있는가. 비스듬히 갈 때는 양옆 칸도 비어 있어야 한다(길찾기와 같은 규칙).
  canStep(a, b) {
    if (!this.costAt(b.col, b.row)) return false;
    return a.col === b.col || a.row === b.row || (this.sideOk(b.col, a.row) && this.sideOk(a.col, b.row));
  }

  // 시설이 새로 생겨 가던 길이 막혔으면 그 앞에서 멈춘다.
  // 칸이 막힌 것뿐 아니라, 양옆 칸이 막혀 비스듬히 지나갈 수 없게 된 걸음도 막힌 것이다.
  onMapChanged() {
    let from = this.tile;
    for (let i = 0; i < this.path.length; i++) {
      if (!this.canStep(from, this.path[i])) { this.path.length = i; return; }
      from = this.path[i];
    }
  }

  // 칸 한가운데에 서서 다음 칸으로 걸음을 시작해도 되는가. 좀비는 시설 앞에서 멈춘다.
  mayEnter() { return true; }
  // 한 칸에 도착했을 때(좀비는 목표 옆에 오면 멈춘다)
  onArrive() {}
  // 걷는 쪽을 본다. dx: 화면 x 방향
  face() {}

  // 길을 따라 dt 초 동안 speed(칸/초)로 걷는다
  walk(dt, speed) {
    let left = speed * dt;   // 이번 프레임에 갈 수 있는 거리(칸)
    while (left > 0 && this.path.length) {
      const t = this.path[0];
      const atCentre = this.col === this.tile.col && this.row === this.tile.row;
      if (atCentre && (t.col !== this.tile.col || t.row !== this.tile.row) && !this.mayEnter(t)) break;
      const dc = t.col - this.col, dr = t.row - this.row;
      const dist = Math.hypot(dc, dr);
      this.face(dc - dr);
      if (dist <= left) {
        this.col = t.col; this.row = t.row;
        this.tile = { col: t.col, row: t.row };
        this.path.shift();
        left -= dist;
        this.onArrive();
      } else {
        this.col += dc / dist * left;
        this.row += dr / dist * left;
        left = 0;
      }
    }
  }
}
