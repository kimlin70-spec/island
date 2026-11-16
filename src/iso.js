// 좌표 변환 (DEMO_SPEC.md 3.2). 한 칸은 가로 80, 세로 40 픽셀의 마름모다.
// 칸 크기는 BootScene이 manifest에서 읽어 넣는다.
let HW = 40, HH = 20;

export function setTileSize(tileWidth, tileHeight) {
  HW = tileWidth / 2;
  HH = tileHeight / 2;
}

// 칸 -> 월드 좌표(칸 중심). 소수 칸도 된다.
export function tileToWorld(col, row) {
  return { x: (col - row) * HW, y: (col + row) * HH };
}

// 월드 좌표 -> 칸  (누른 곳은 pointer.worldX, pointer.worldY 를 넣는다)
export function worldToTile(x, y) {
  return {
    col: Math.floor((x / HW + y / HH) / 2 + 0.5),
    row: Math.floor((y / HH - x / HW) / 2 + 0.5),
  };
}

// 월드 좌표 -> 소수 칸 좌표(칸 중심이 정수). 2×2칸인 텐트의 자리를 잡을 때 쓴다.
export function worldToTileFloat(x, y) {
  return { col: (x / HW + y / HH) / 2, row: (y / HH - x / HW) / 2 };
}
