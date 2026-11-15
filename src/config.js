// 바꿀 수 있는 숫자는 전부 여기에 있다. (DEMO_SPEC.md 6장)
export const CONFIG = {
  view: { width: 2048, height: 1536, dayZoom: 1.6, nightZoom: 1.0 },
  time: { dayLength: 180, eveningLength: 30, nightLength: 120 },
  player: {
    speed: 3.5,            // 초당 칸
    maxHearts: 5, maxHunger: 5,
    hungerInterval: 60, starveInterval: 30, morningHeal: 2,
    actionInterval: 0.5,   // 캐기, 때리기 간격(초)
    attackDamage: 1,
    startRevealRadius: 4.5, revealRadius: 3.5,
  },
  food: { berry: { hunger: 1, heart: 0 }, meat: { hunger: 2, heart: 1 } },
  nodes: {
    tree: { hits: 3, give: 'wood', amount: 1, regrowMornings: 2 },   // pine, palm 도 같음
    rock: { hits: 3, give: 'stone', amount: 1, regrowMornings: 3 },
    bush: { hits: 1, give: 'berry', amount: 2, regrowMornings: 1 },
  },
  build: {
    refundRate: 0.5,
    fence:      { cost: { wood: 2 }, hp: 8 },
    stoneTower: { cost: { wood: 2, stone: 4 }, hp: 10, range: 4, interval: 1.2, damage: 1, projectileSpeed: 10 },
    campfire:   { cost: { wood: 3, stone: 2 }, hp: 6, range: 2.5, slow: 0.5 },
    doghouse:   { cost: { wood: 4, bone: 1 }, hp: 8, guardRadius: 5 },
  },
  house: { hp: 40 },
  zombie: { hp: 3, speed: 0.8, hitDamage: 1, hitInterval: 2.0, playerHitInterval: 2.5, breakCost: 8, dropChance: 0.5 },
  boss:   { hp: 20, speed: 0.5, hitDamage: 2, hitInterval: 2.0, appearAt: 0.3 },
  wave:   { base: 4, perNight: 2, max: 16, spawnWindow: 0.6 },
  boar:   { hp: 4, speed: 1.2, hitDamage: 1, hitInterval: 2.0, chaseRange: 5 },
  dog:    { bonesToTame: 3, speed: 4.5, attackDamage: 1, attackInterval: 0.8, guardRadius: 5, followDistance: 2 },
  zone:   { revealNeeded: 0.9 },
  penalty: { loseRate: 0.5 },     // 쓰러지거나 집이 부서졌을 때 잃는 나무·돌 비율

  // ---- 아래는 화면과 조작에 쓰는 숫자 ----
  colors: { cloud: '#e3eaf3', text: '#3b2a20' },
  input: { dragThreshold: 12 },            // 누른 뒤 이만큼(화면 px) 넘게 움직이면 "끌기"
  camera: { followLerp: 0.15 },            // 카메라가 주인공을 따라붙는 빠르기(0~1)
  anim: {
    walkFps: 6,                            // 걷기 그림을 초당 몇 장
    waterInterval: 0.8,                    // 잔물결 바뀌는 간격(초)
    cursorTime: 0.6,                       // 누른 칸 표시가 보이는 시간(초)
  },
  occlude: { alpha: 0.5, fadeTime: 0.15 }, // 주인공을 가린 사물의 투명도, 바뀌는 시간(초)
  depth: { water: 0, edge: 1, land: 2, floor: 3, fog: 4, objectBase: 10, charBias: 0.5, fx: 50000 },
};
