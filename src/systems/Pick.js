import { CONFIG } from '../config.js';

// 누른 점 (x, y)가 그림 img 에 맞았는가 (사용자 요청: 아이패드와 PC 에서 한 번에 잘 눌리게).
//   2: 정확히 맞음(그림의 진한 곳. 작고 얇은 그림 input.boxPick 은 그림 사각형 안 어디든)
//   1: 가까움(진한 곳에서 input.pickPad px 안)
//   0: 아님
// minAlpha: 이 값보다 진한 곳만 그림으로 본다. near: 가까움도 볼 것인가
export function hitLevel(scene, img, x, y, minAlpha = CONFIG.input.pickAlpha, near = true) {
  const I = CONFIG.input, flip = img.flipX ? -1 : 1;
  const local = (px, py) => ({ lx: Math.floor((px - img.x) * flip + img.displayWidth * img.originX), ly: Math.floor(py - (img.y - img.displayHeight * img.originY)) });
  const inside = (p) => p.lx >= 0 && p.ly >= 0 && p.lx < img.width && p.ly < img.height;
  const solid = (px, py) => {
    const p = local(px, py);
    if (!inside(p)) return false;
    const a = scene.textures.getPixelAlpha(p.lx, p.ly, img.texture.key, img.frame.name);
    return a !== null && a > minAlpha;
  };
  if (I.boxPick.includes(img.texture.key) && inside(local(x, y))) return 2;
  if (solid(x, y)) return 2;
  if (!near) return 0;
  const R = I.pickPad;
  for (const r of [R / 2, R]) {
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      if (solid(x + Math.cos(a) * r, y + Math.sin(a) * r)) return 1;
    }
  }
  return 0;
}

// 눌린 것을 잠깐 통통 튀게 한다(눌렸다는 표시)
export function tapPop(scene, sprite) {
  const T = CONFIG.input.tapPop;
  if (!sprite || !sprite.active || sprite.tapPopping) return;
  const s0 = sprite.scaleX, s1 = sprite.scaleY;
  sprite.tapPopping = true;
  scene.effects.run(T.time, (k) => { const u = 1 + T.scale * Math.sin(k * Math.PI); if (sprite.active) sprite.setScale(s0 * u, s1 * u); },
    () => { sprite.tapPopping = false; if (sprite.active) sprite.setScale(s0, s1); });
}
