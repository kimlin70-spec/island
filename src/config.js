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
  zombie: {
    hp: 3, speed: 0.8, hitDamage: 1, hitInterval: 2.0, playerHitInterval: 2.5, breakCost: 8, dropChance: 0.5,
    playerDamage: 1,       // 좀비가 주인공에게 주는 피해(하트)
    repathInterval: 0.5,   // 시설이 바뀌었을 때 길을 다시 계산하는 최소 간격(초)
    jitter: 14,            // 여럿이 겹쳐도 보이게 그림을 어긋나게 하는 정도(px)
  },
  boss:   { hp: 20, speed: 0.5, hitDamage: 2, hitInterval: 2.0, appearAt: 0.3 },
  wave:   { base: 4, perNight: 2, max: 16, spawnWindow: 0.6, firstDelay: 0.25 },   // firstDelay: 첫 좀비가 나오는 때(간격의 몇 배)
  boar:   { hp: 4, speed: 1.2, hitDamage: 1, hitInterval: 2.0, chaseRange: 5 },
  dog:    { bonesToTame: 3, speed: 4.5, attackDamage: 1, attackInterval: 0.8, guardRadius: 5, followDistance: 2 },
  zone:   { revealNeeded: 0.9 },
  penalty: { loseRate: 0.5 },     // 쓰러지거나 집이 부서졌을 때 잃는 나무·돌 비율

  // ---- 아래는 화면과 조작에 쓰는 숫자 ----
  colors: { cloud: '#e3eaf3', text: '#3b2a20' },
  input: {
    dragThreshold: 12,                     // 누른 뒤 이만큼(화면 px) 넘게 움직이면 "끌기"
    pickAlpha: 40,                         // 사물 그림에서 이보다 진한 곳(0~255)을 눌러야 선택된다
    charPad: 24,                           // 캐릭터를 누를 때 그림 둘레에 두는 여유(px)
  },
  camera: { followLerp: 0.15, changeTime: 1.5 },   // 따라붙는 빠르기(0~1), 밤낮이 바뀔 때 확대가 바뀌는 시간(초)
  tint: { day: '#ffffff', evening: '#ffd9b0', night: '#8ca6f2', changeTime: 1.5 },   // 화면색(곱하기)
  anim: {
    walkFps: 6,                            // 걷기 그림을 초당 몇 장
    waterInterval: 0.8,                    // 잔물결 바뀌는 간격(초)
    cursorTime: 0.6,                       // 누른 칸 표시가 보이는 시간(초)
    attackTime: 0.2,                       // 때리거나 캘 때 attack 그림을 보여 주는 시간(초)
  },
  fog: { fadeTime: 0.2 },                  // 안개가 흐려지며 사라지는 시간(초)
  fx: {
    popupTime: 0.9,                        // "+1"이 떠 있는 시간(초)
    popupRise: 70,                         // "+1"이 떠오르는 높이(px)
    popupHeight: 110,                      // 사물 발 위치에서 "+1"이 시작하는 높이(px)
    popupIconScale: 0.5, popupFontSize: 40,
    flashTime: 0.1,                        // 맞았을 때 하얗게 번쩍이는 시간(초)
    poofTime: 0.35, starTime: 0.6, starRise: 90,
    barWidth: 72, barHeight: 12,           // 체력 막대 크기(px)
    houseBarDrop: 30,                      // 집 체력 막대를 그림 꼭대기에서 얼마나 내려 그릴지(px)
    barBack: 0x3b2a20, barFill: 0x6fd36f, barLow: 0xf2a53a,
  },
  collapse: { fadeTime: 0.5, holdTime: 0.5 },   // 쓰러졌을 때 화면이 어두워지는/머무는 시간(초)
  ui: {
    font: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif',
    panelColor: 0xfff8e6, borderColor: 0x3b2a20, borderWidth: 6, radius: 28,
    fontSize: 48,                          // 기본 글자 크기(최소 44)
    countFontSize: 56,                     // 가방 숫자
    noticeFontSize: 60,                    // 알림 글자
    noticeTime: 2.5,                       // 알림이 떠 있는 시간(초)
    noticeFade: 0.25,
    accentColor: 0xffd24a,                 // 망치 버튼, 고른 카드의 노란색
    dimAlpha: 0.45,                        // 재료가 모자란 카드의 흐림 정도
  },
  debug: { giveAmount: 20, fastSpeed: 3 }, // 시험용 도구: 재료 +20, 빠른 속도 배수
  occlude: { alpha: 0.5, fadeTime: 0.15 }, // 주인공을 가린 사물의 투명도, 바뀌는 시간(초)
  depth: { water: 0, edge: 1, land: 2, floor: 3, fog: 4, buildMark: 4.5, objectBase: 10, charBias: 0.5, fx: 50000 },
};
