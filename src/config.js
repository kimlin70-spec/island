// 바꿀 수 있는 숫자는 전부 여기에 둔다.
// 위쪽은 DEMO_SPEC.md 6장의 값 그대로이고, 아래쪽은 화면과 조작에 쓰는 숫자다.
export const CONFIG = {
  view: { width: 1920, height: 1200, zoom: 1.0, cameraLerp: 0.12 },
  time: { dayLength: 240, duskLength: 40, nightLength: 150, dawnFade: 3 },
  colors: { day: 0xffffff, dusk: 0xffd2a6, night: 0x6670b8 },
  player: {
    speed: 3.5,              // 초당 칸
    maxHearts: 5,
    actionInterval: 0.55,    // 도구를 한 번 쓰는 간격(초)
    morningHeal: 2,
    light: { radius: 150, color: 0xebf0ff, alpha: 0.6 },
  },
  tools: {
    dagger:  { name: '단검',        power: { tree: 1, enemy: 1 } },
    axe:     { name: '나무 도끼',   cost: { wood: 3 }, power: { tree: 3 } },
    pickaxe: { name: '나무 곡괭이', cost: { wood: 3 }, power: { rock: 3 } },
  },
  nodes: {
    tree: { hp: 9, give: 'wood', amount: 4 },
    pine: { hp: 9, give: 'wood', amount: 4 },
    palm: { hp: 9, give: 'wood', amount: 3 },
    rock: { hp: 9, give: 'stone', amountBySprite: { obj_rock_s: 1, obj_rock_m: 2, obj_rock_l: 3 } },
  },
  build: {
    reach: 7, refundRate: 0.5,
    fence:    { name: '울타리', cost: { wood: 1 }, hp: 6 },
    campfire: { name: '모닥불', cost: { wood: 3, stone: 3 }, hp: 10, slowRange: 3, slow: 0.5,
                light: { radius: 300, color: 0xffedc7, alpha: 1 } },
    tent:     { name: '텐트', cost: { wood: 8, stone: 2 }, hp: 24, max: 1,
                healInterval: 8, sleepTimeScale: 4, wakeRange: 6,
                light: { radius: 110, color: 0xffedc7, alpha: 0.8 } },
  },
  zombie: { hp: 3, speed: 1.2, hitInterval: 2.0, firstHitDelay: 1.5,
            structureDamage: 1, structureInterval: 1.5, breakCost: 8, spawnMinDistance: 12 },
  wave:   { base: 4, perNight: 2, max: 14, spawnWindow: 0.6 },
  pirate: { enabled: false, count: 2, hp: 4, speed: 1.8, hitInterval: 1.6, firstHitDelay: 1.0,
            structureDamage: 1, structureInterval: 1.0, breakCost: 8, shipAt: 0.35, landAt: 0.45,
            lampLight: { radius: 130, color: 0xffedc7, alpha: 0.9 } },
  todo:   { fenceCount: 8 },

  // ── 아래는 6장에 없는, 화면과 조작에 쓰는 숫자 ──
  screen: {
    background: '#5fa9c8',   // 게임 배경색(바다색)
    font: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif',
    textColor: '#4a3d38',
    maxFrameTime: 0.1,       // 한 프레임에 흐를 수 있는 가장 긴 시간(초). 화면이 잠깐 멈췄을 때 캐릭터가 튀지 않게.
  },
  anim: { walkFps: 6 },      // 걷는 그림을 초당 몇 장 바꾸는가
  input: { cursorTime: 0.4 },   // 누른 칸 표시가 보이는 시간(초)
  // 캐릭터가 키 큰 사물 뒤에 가려지면 그 사물을 반투명하게 한다
  occlude: {
    kinds: ['tree', 'pine', 'palm'],   // 키 큰 사물
    alpha: 0.5,
    fadeTime: 0.15,          // 반투명해지는 데 걸리는 시간(초)
    bodyWidth: 36,           // 캐릭터 몸통의 폭(px)
    inset: 0.15,             // 사물 그림 가장자리의 빈 곳(그림 폭에 대한 비율)
  },
  depth: { ground: 0, floor: 3, objectBase: 10, charBias: 0.5, fx: 50000 },
};
