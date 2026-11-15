// 좌표 변환 (DEMO_SPEC.md 3.2). 칸 크기는 manifest에서 받아 온다.
let HW = 64, HH = 32;

export function setTileSize(tileWidth, tileHeight) {
  HW = tileWidth / 2;
  HH = tileHeight / 2;
}

// 칸 -> 월드 좌표(칸 중심). 소수 칸도 된다.
export function tileToWorld(col, row) {
  return { x: (col - row) * HW, y: (col + row) * HH };
}

// 월드 좌표 -> 칸
export function worldToTile(x, y) {
  return {
    col: Math.floor((x / HW + y / HH) / 2 + 0.5),
    row: Math.floor((y / HH - x / HW) / 2 + 0.5),
  };
}
