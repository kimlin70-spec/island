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
    chaseInterval: 0.5,      // 적을 쫓아갈 때 길을 다시 찾는 가장 짧은 간격(초)
    light: { radius: 150, color: 0xebf0ff, alpha: 0.6, lift: 24 },   // lift: 발에서 위로(px) (3.7)
  },
  tools: {
    dagger:  { name: '단검',        power: { tree: 1, enemy: 1 } },
    axe:     { name: '나무 도끼',   cost: { wood: 3 }, power: { tree: 3 } },
    pickaxe: { name: '나무 곡괭이', cost: { wood: 3 }, power: { rock: 3, ground: 3 } },   // ground: 그루터기·돌 부스러기 파내기(사용자 요청)
  },
  nodes: {
    tree: { hp: 9, give: 'wood', amount: 4 },
    pine: { hp: 9, give: 'wood', amount: 4 },
    palm: { hp: 9, give: 'wood', amount: 3 },
    rock: { hp: 9, give: 'stone', amountBySprite: { obj_rock_s: 1, obj_rock_m: 2, obj_rock_l: 3 } },
    // 사용자 요청(문서에 없음): 곡괭이로 그루터기·돌 부스러기를 파내면 사라져서 땅이 고르게 된다. 얻는 재료는 없다.
    stump:  { hp: 3 },
    rubble: { hp: 3 },
  },
  build: {
    reach: 7, refundRate: 0.5,
    fence:    { name: '울타리', cost: { wood: 1 }, hp: 6 },
    campfire: { name: '모닥불', cost: { wood: 3, stone: 3 }, hp: 10, slowRange: 3, slow: 0.5,
                light: { radius: 300, color: 0xffedc7, alpha: 1,
                         flicker: 0.03, flickerRates: [11, 27] },    // 반지름이 ±3%로 일렁인다. 일렁이는 빠르기(라디안/초) 두 가지를 섞는다
                glow: { size: 220, day: 0.2, night: 0.45 } },   // 불꽃 둘레의 빛무리(3.7): 크기(px)와 낮·밤의 진하기
    tent:     { name: '텐트', cost: { wood: 8, stone: 2 }, hp: 24, max: 1,
                healInterval: 8, sleepTimeScale: 4, wakeRange: 6,
                attackNotice: 5,     // 텐트가 이만큼(초) 안 맞다가 맞으면 "텐트가 공격받고 있습니다"를 띄운다(5초에 한 번 이하) (5.6)
                light: { radius: 110, color: 0xffedc7, alpha: 0.8 } },
  },
  zombie: { hp: 3, speed: 1.2, hitInterval: 2.0, firstHitDelay: 1.5, hitDamage: 1,   // hitDamage: 한 번 때릴 때 깎는 하트
            structureDamage: 1, structureInterval: 1.5, breakCost: 8, spawnMinDistance: 12,
            repathInterval: 0.5,     // 길을 다시 찾는 가장 짧은 간격(초) (5.8)
            repathsPerFrame: 3 },    // 한 프레임에 길을 다시 찾는 적(좀비와 해적을 합해) 수의 최대(느린 기기에서 화면이 끊기지 않게)
  wave:   { base: 4, perNight: 2, max: 14, spawnWindow: 0.6 },
  pirate: { enabled: true, count: 2, hp: 4, speed: 1.8, hitInterval: 1.6, firstHitDelay: 1.0,   // enabled: Phase 6 에서 켰다
            structureDamage: 1, structureInterval: 1.0, breakCost: 8, shipAt: 0.35, landAt: 0.45,
            lampLight: { radius: 130, color: 0xffedc7, alpha: 0.9 },
            hitDamage: 1, repathInterval: 0.5,   // 좀비와 같은 값(5.12: 다른 점은 위의 숫자뿐이다)
            appearTime: 2,           // 해적선이 나타나는 데 걸리는 시간(초)
            leaveTime: 2 },          // 아침에 배와 보트가 사라지는 데 걸리는 시간(초)
  todo:   { fenceCount: 8 },

  // ── 아래는 6장에 없는, 화면과 조작에 쓰는 숫자 ──
  screen: {
    background: '#5fa9c8',   // 게임 배경색(바다색)
    font: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif',
    textColor: '#4a3d38',
    maxFrameTime: 0.1,       // 한 프레임에 흐를 수 있는 가장 긴 시간(초). 화면이 잠깐 멈췄을 때 캐릭터가 튀지 않게.
  },
  anim: {
    walkFps: 6,              // 걷는 그림을 초당 몇 장 바꾸는가
    burnFps: 6,              // 모닥불 그림을 초당 몇 장 바꾸는가
    toolRaise: 0.2,          // 도구를 들어 올린 그림을 보여 주는 시간(초)
    toolStrike: 0.15,        // 내려친 그림을 보여 주는 시간(초). 이 그림으로 바뀌는 순간에 피해를 준다
    attackTime: 0.3,         // 좀비가 때릴 때 attack 그림을 보여 주는 시간(초) (3.5)
  },
  input: {
    cursorTime: 0.4,         // 누른 칸 표시가 보이는 시간(초)
    pickAlpha: 110,          // 그림에서 이 값보다 진한 부분을 눌러야 그 사물을 고른다(0~255). 옅은 그림자는 빼려고.
    pickAlphaFence: 30,      // 울타리는 이 값으로 고른다. 그림자가 없어서, 기둥과 가로대의 옅은 가장자리까지 울타리로 본다.
    enemyPad: 12,            // 적은 그림 사각형을 사방으로 이만큼(px) 넓힌 곳을 눌러도 고른다 (3.5)
  },
  // 효과와 체력 막대
  fx: {
    shakeTime: 0.1, shakePx: 3,      // 맞은 대상이 좌우로 흔들리는 시간(초)과 폭(px)
    hitTime: 0.15, hitHeight: 28,    // 타격 그림을 보여 주는 시간(초), 대상의 발에서 위로 얼마나(px)
    poofTime: 0.3, poofFrom: 0.6, poofTo: 1.4,   // 먼지 그림이 커지며 흐려지는 시간(초)과 크기(배)
    popupTime: 0.9, popupRise: 60, popupIcon: 44, popupFont: 30,   // 떠오르는 "+4": 시간(초), 높이(px), 아이콘과 글자 크기
    barWidth: 56, barHeight: 8, barGap: 10,      // 체력 막대 크기, 그림 위쪽과의 간격(px)
    barLinger: 0.9,                  // 마지막으로 친 뒤 막대가 남아 있는 시간(초)
    flashTime: 0.1,                  // 맞은 캐릭터가 하얗게 번쩍이는 시간(초) (3.5)
    barBorder: 0x4a3d38, barTrack: 0xc4b8a8, barFill: 0x8fbb78,
  },
  // 캐릭터가 키 큰 사물 뒤에 가려지면 그 사물을 반투명하게 한다
  occlude: {
    kinds: ['tree', 'pine', 'palm'],   // 키 큰 사물
    alpha: 0.5,
    fadeTime: 0.15,          // 반투명해지는 데 걸리는 시간(초)
    bodyWidth: 36,           // 캐릭터 몸통의 폭(px)
    inset: 0.15,             // 사물 그림 가장자리의 빈 곳(그림 폭에 대한 비율)
  },
  depth: { ground: 0, floor: 3, objectBase: 10, charBias: 0.5, fx: 50000 },

  // ── 화면 UI (7장). 위치와 크기는 1920×1200 기준이고 preview 그림의 배치를 따른다 ──
  ui: {
    ink: '#4a3d38', dimInk: '#84786e',           // 글자색, 흐린 글자색
    panel: { color: 0xfbf6ea, alpha: 0.92, border: 0x4a3d38, borderWidth: 3, radius: 22 },
    cardColor: 0xfffcf2, yellow: 0xf6cf5e, green: 0x8fbb78,
    dimAlpha: 0.45,                              // 흐린 카드의 진하기
    margin: 24,                                  // 화면 가장자리와 패널 사이
    // 오른쪽 위: 할 일
    todo: { w: 320, padTop: 50, lineHeight: 36, padBottom: 8, titleX: 20, titleY: 28, titleFont: 26,
            boxX: 22, boxY: 4, boxSize: 22, boxRadius: 5, boxBorder: 2, textX: 56, textY: 16, font: 23 },
    // 왼쪽 아래: 가방(나무, 돌)과 장비
    bag: { w: 300, h: 88, icon: 72, font: 34, iconX: [46, 188], countX: [84, 226], countY: 51 },
    equip: { gap: 20, pad: 10, slot: 76, icon: 72 },
    // 오른쪽 아래: 만들기 버튼
    craftButton: { size: 136, edge: 28, border: 4, borderOpen: 6, icon: 80, iconY: -20, font: 22, textY: 34 },
    // 만들기 창: 버튼 위로 열린다
    craft: { gapToButton: 20, pad: 20, titleHeight: 44, titleFont: 28, titleY: 36, noteFont: 20,
             cardW: 170, cardH: 196, cardGap: 12, cardRadius: 16, cardBorder: 3, selectedBorder: 7,
             icon: 96, iconY: 56, nameY: 124, nameFont: 24,
             costY: 164, costIcon: 40, costFont: 24, costStep: 66, costTrim: 6, costTextX: 42,   // 재료 아이콘과 숫자 한 묶음의 폭이 costStep
             statusFont: 22 },                   // "보유", "절반 돌려받음" 글자
    // 왼쪽 위: 하트(56px). 빈 칸은 icon_heart_empty
    hearts: { h: 72, padX: 13, step: 58, icon: 56 },
    // 가운데 위: 해/달 아이콘, "1일째 낮", 진행 막대(낮 노랑, 밤 파랑). x 는 화면 가운데 기준, y 는 패널 위쪽 기준
    clock: { w: 460, h: 72, iconX: -190, icon: 64, textX: -150, textY: 24, font: 26,
             barX: -150, barY: 42, barW: 356, barH: 18, track: 0xc4b8a8, dayFill: 0xf0be54, nightFill: 0x687ac4 },
    // 아래 가운데: 텐트에서 쉬는 동안의 버튼 "쉬는 중 · 누르면 나옵니다"
    rest: { h: 88, padX: 22, icon: 64, gap: 12, font: 28 },
    // 가운데 위쪽: 알림
    notice: { y: 147, height: 54, padX: 26, font: 28, time: 2.5, fade: 0.2 },
    // 할 일 아래: 시험용 도구. 창의 아래 끝(지금 y 718)이 만들기 창의 위 끝(y 736)보다 위에 오게 한다.
    debug: { buttonW: 88, buttonH: 40, gap: 10, font: 20, radius: 14,
             w: 300, pad: 16, itemH: 48, itemGap: 8, itemFont: 24, giveAmount: 20,
             fastSpeed: 3 },                     // 속도 ×1 / ×3
    // 화면 가운데: "쓰러졌습니다" 창과 첫 아침의 결과 창. 떠 있는 동안 뒤의 화면은 흐려지고 눌리지 않는다.
    modal: { w: 600, pad: 40, titleY: 64, titleFont: 40, lineY: 136, lineH: 50, lineFont: 28, labelX: 70, valueX: 530,
             buttonW: 236, buttonH: 76, buttonGap: 28, buttonFont: 28, buttonRadius: 20, gapAfterLines: 24, dim: 0.35 },
  },
};
