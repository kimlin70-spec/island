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
    pickaxe: { name: '나무 곡괭이', cost: { wood: 3 }, power: { rock: 3, ground: 3, iron: 3 } },   // ground: 그루터기·돌 부스러기 파내기(사용자 요청), iron: 철광석(11.2)
    // (2단계) 총 (11.6, 11.9): 가지면 적과는 단검 대신 총으로 싸운다. 캐기에는 쓰지 않는다(power 없음).
    // (3단계) 농사 도구 (13.3). 재료는 farm.hoeCost, farm.canCost (아래에서 넣는다). 캐기에는 쓰지 않는다.
    hoe:          { name: '나무 괭이', power: {} },
    watering_can: { name: '물뿌리개', power: {} },
    gun:     { name: '총', cost: { iron: 3, wood: 2 }, damage: 2, range: 5, interval: 1.4, aimTime: 0.25, bulletSpeed: 1400, power: {} },
  },
  nodes: {
    tree: { hp: 9, give: 'wood', amount: 4 },
    pine: { hp: 9, give: 'wood', amount: 4 },
    palm: { hp: 9, give: 'wood', amount: 3 },
    rock: { hp: 9, give: 'stone', amountBySprite: { obj_rock_s: 1, obj_rock_m: 2, obj_rock_l: 3 } },
    // 사용자 요청(문서에 없음): 곡괭이로 그루터기·돌 부스러기를 파내면 사라져서 땅이 고르게 된다. 얻는 재료는 없다.
    stump:  { hp: 3 },
    rubble: { hp: 3 },
    iron:   { hp: 15, give: 'iron', amountBySprite: { obj_iron_1: 2, obj_iron_2: 3 } },   // (2단계) 11.9. 1단계에서는 캘 수 없다
  },
  build: {
    reach: 7, refundRate: 0.5,
    walkMargin: 1.5,   // (사용자 요청) 멀어서 걸어가 지을 때 reach 보다 이만큼(칸) 안쪽까지 간다
    reachCircle: { tint: 0x7fd858, alpha: 0.9 },   // 초록: 탑의 사거리 원(색 없음)과 구별되게   // (사용자 요청) 짓는 동안 주인공 둘레에 지을 수 있는 거리(reach)를 원으로 보여 준다. 그림은 overlay_range
    fence:    { name: '울타리', cost: { wood: 1 }, hp: 6 },
    // (지하) 굴 입구 (17.2, 17.11): 하나만. 적은 공격하지 않는다
    burrow:   { name: '굴 입구', hp: 20, max: 1 },
    // (지하) 지하 가구 (17.6). 재료는 ug.cost (아래에서 넣는다). 침대는 하나만. 체력이 없다(적이 오지 않는다)
    bed: { name: '침대', max: 1 }, fireplace: { name: '벽난로' }, lantern: { name: '등불' }, planter: { name: '버섯 화분' },
    table: { name: '탁자' }, stool: { name: '의자' }, rug: { name: '깔개' }, chest: { name: '보관 상자' },
    // (3단계) 문 (13.2, 13.6 의 gate). 주인공이 openRange 칸 안에 오면 열리고, closeRange 칸보다 멀어지면 닫힌다
    gate:     { name: '문', cost: { wood: 3 }, hp: 10, openRange: 1.3, closeRange: 1.8 },
    campfire: { name: '모닥불', cost: { wood: 3, stone: 3 }, hp: 10, slowRange: 3, slow: 0.5,
                light: { radius: 300, color: 0xffedc7, alpha: 1,
                         flicker: 0.03, flickerRates: [11, 27] },    // 반지름이 ±3%로 일렁인다. 일렁이는 빠르기(라디안/초) 두 가지를 섞는다
                glow: { size: 220, day: 0.2, night: 0.45 } },   // 불꽃 둘레의 빛무리(3.7): 크기(px)와 낮·밤의 진하기
    tent:     { name: '텐트', cost: { wood: 8, stone: 2 }, hp: 24, max: 1,
                healInterval: 8, sleepTimeScale: 4, wakeRange: 6,
                attackNotice: 5,     // 텐트가 이만큼(초) 안 맞다가 맞으면 "텐트가 공격받고 있습니다"를 띄운다(5초에 한 번 이하) (5.6)
                light: { radius: 110, color: 0xffedc7, alpha: 0.8 } },
    // (2단계) 철조망 11.4: 길을 막지 않는다. 위에 있는 적은 slow 배로 느려지고 damageInterval 초마다 damage. 그때마다 철조망 체력 1 줄어듦.
    // 적의 길찾기에서 이 칸의 비용은 pathCost(보통 칸 1)
    wire:     { name: '철조망', cost: { iron: 1 }, hp: 10, slow: 0.4, damage: 1, damageInterval: 1.0, pathCost: 3 },
    // (2단계) 탑 11.5, 11.9: 사거리(칸), 쏘는 간격(초), 피해. 화살은 포물선(높이 = 거리 × arcRatio, 최대 arcMax px), 총알은 직선. 속도는 초당 px.
    watchtower: { name: '망루', cost: { wood: 8, stone: 2 }, hp: 14, range: 5, interval: 1.1, damage: 1,
                  arrowSpeed: 650, arcRatio: 0.25, arcMax: 60, light: { radius: 120, color: 0xffedc7, alpha: 0.85 } },
    guntower:   { name: '총 타워', cost: { stone: 6, iron: 4 }, hp: 22, range: 6.5, interval: 1.6, damage: 2,   // damage: 11.9 는 3. 사용자 요청(너무 세다)으로 2
                  bulletSpeed: 1400, light: { radius: 120, color: 0xffedc7, alpha: 0.85 } },
  },
  flashLight: { radius: 110, color: 0xffedc7, alpha: 0.9, time: 0.1 },   // (2단계) 총을 쏜 순간 총구의 빛(3.7, 11.9)
  // (2단계) 탑의 화면에 쓰는 숫자(11.5, 11.10, 12.8)
  tower: {
    rangeShowTime: 2,        // 지은 탑을 누르면 사거리 원을 보여 주는 시간(초)
    rangeSize: [113.1, 56.6],   // 사거리 원 overlay_range 의 크기 = 이 값 × 사거리(칸)
    shotTime: 0.25,          // 망루: 쏜 뒤 shot 그림을 보여 주는 시간(초)
    muzzleTime: 0.07,        // 총 타워: 총구 불꽃이 보이는 시간(초). 그 뒤 연기(fx_smoke_puff) (12.8)
    recoil: 3, recoilTime: 0.08,   // 총 타워: 쏠 때 포탑을 겨눈 반대로 미는 거리(px)와 되돌리는 시간(초)
    hitHeight: 40,           // 화살·총알이 맞는 곳: 적의 발에서 위로(px. 12.4의 캐릭터 맞은 곳과 같다)
    arrowStuckFade: 0.5,     // 목표를 잃고 땅에 꽂힌 화살이 사라지는 데 걸리는 시간(초). 남는 시간은 fx.arrowStuckLife
    missDustScale: 0.4,      // 목표를 잃은 총알이 떨어진 곳의 먼지 크기(배)
  },
  zombie: { hp: 3, speed: 1.2, hitInterval: 2.0, firstHitDelay: 1.5, hitDamage: 1,   // hitDamage: 한 번 때릴 때 깎는 하트
            structureDamage: 1, structureInterval: 1.5, breakCost: 8, spawnMinDistance: 12,
            repathInterval: 0.5,     // 길을 다시 찾는 가장 짧은 간격(초) (5.8)
            repathsPerFrame: 6,      // 한 프레임에 길을 다시 찾는 적(좀비와 해적을 합해) 수의 최대(느린 기기에서 화면이 끊기지 않게). 좀비 수를 2배로 하며 3 -> 6
            // hp: 6장의 3. (사용자 요청으로 6 으로 올렸다가, 다시 사용자 요청으로 3 으로 되돌리고 대신 wave 의 수를 2배로)
          },
  // 6장은 base 4, perNight 2, max 14. 사용자 요청(좀비 체력을 낮추고 수를 늘려 난이도를 맞춤)으로 2배
  wave:   { base: 8, perNight: 4, max: 28, spawnWindow: 0.6 },
  pirate: { enabled: true, count: 2, hp: 4, speed: 1.8, hitInterval: 1.6, firstHitDelay: 1.0,   // enabled: Phase 6 에서 켰다
            structureDamage: 1, structureInterval: 1.0, breakCost: 8, shipAt: 0.35, landAt: 0.45,
            lampLight: { radius: 130, color: 0xffedc7, alpha: 0.9 },
            hitDamage: 1, repathInterval: 0.5,   // 좀비와 같은 값(5.12: 다른 점은 위의 숫자뿐이다)
            appearTime: 2,           // 해적선이 나타나는 데 걸리는 시간(초)
            leaveTime: 2,            // 아침에 배와 보트가 사라지는 데 걸리는 시간(초)
            gunners: 1 },            // (2단계) 함께 상륙하는 총잡이 해적 수 (11.7)
  // (2단계) 총잡이 해적 (11.7, 11.9). 아래 줄은 11.9 에 없는, 걸어오다 시설에 막혔을 때의 값(다른 해적과 같다, 5.12)
  gunner: { hp: 3, speed: 1.6, range: 4.5, aimTime: 0.6, interval: 2.6, damage: 1, tentDamage: 2, dodgeRadius: 0.6, bulletSpeed: 900,
            structureDamage: 1, structureInterval: 1.0, breakCost: 8, repathInterval: 0.5 },
  // (사용자 요청, 문서에 없음) 난이도: 2단계부터 나오는 좀비·해적·총잡이의 체력을 이 배수로(zombie, pirate, gunner 의 hp × 이 값).
  // 1단계는 그대로(단검으로 싸우는 첫 밤이 너무 어려워지지 않게). 1 로 두면 문서의 값.
  stage2: { enemyHpScale: 2 },
  // 효과음 (15.4). master: 전체 크기, ambience: 배경 소리(낮·밤)에 더 곱하는 값, loopFade: 반복 소리의 크기가 바뀌는 시간(초),
  // fullRange/hearRange: 카메라 가운데에서 이 칸 안은 그대로, 이 칸에서 0. detune: 같은 소리를 조금씩 다르게(센트).
  // sameSoundGap: 같은 소리를 다시 틀지 않는 시간(초), maxSame: 같은 소리를 동시에 트는 수, step: 발소리 크기
  sound: { master: 0.8, ambience: 0.5, loopFade: 2, fullRange: 4, hearRange: 14, detune: 100, sameSoundGap: 0.05, maxSame: 4, step: 0.3,
           swing: 0.5,                 // 휘두르는 소리의 크기(15.3)
           fire: { near: 2, far: 8, volume: 0.6 },   // 모닥불 곁: 가장 가까운 모닥불까지 near 칸 안 volume, far 칸에서 0 (15.3)
           groanEvery: [8, 15] },      // 밤 동안 좀비 하나가 신음하는 간격(초) (15.3)
  todo:   { fenceCount: 8 },
  todo2:  { iron: 5, wire: 6 },
  todo3:  { farm: 6 },
  todo4:  { dig: 10 },
  todo5:  { floor: 10, cover: 4 },     // (지하 꾸미기) 할 일: 나무 마루 칸 수, 벽판 수 (19.8)                 // (지하) 할 일: 판 칸 수 (17.10)                 // (3단계) 할 일: 간 밭 수 (13.5)
  // (3단계) 농사 (13.3, 13.6). 아래 줄의 값은 13.3 의 글에 있는 숫자
  farm: {
    hoeCost: { wood: 3 }, canCost: { wood: 2, stone: 2 }, reach: 7, tillTerrain: [2, 3, 4],
    crateSeeds: { carrot: 4, corn: 2, pumpkin: 1 },
    crops: {
      carrot:  { name: '당근',   stageTime: 30, harvest: 2, seeds: [1, 2], heal: 1 },
      corn:    { name: '옥수수', stageTime: 45, harvest: 3, seeds: [1, 2], heal: 1 },
      pumpkin: { name: '호박',   stageTime: 60, harvest: 1, seeds: [1, 2], heal: 3 },
    },
    crateFade: { after: 2, time: 0.5 },       // 열린 상자가 after 초 뒤 time 초에 걸쳐 사라진다
    tillDustScale: 0.7,                       // 밭을 갈 때의 먼지 크기(배)
    growSparkleScale: 0.5,                    // 한 단계 자랄 때의 반짝임 크기(배)
    ripeSway: { angle: 2, period: 1.5 },      // 다 자란 작물이 흔들리는 각도(도)와 한 번 흔드는 시간(초)
    debugSeeds: 5,                            // 시험용 도구 "씨앗 +5"
  },
  // 지하 생활 (17.11). 아래 줄의 값은 17장의 글에 있는 숫자와 화면에 쓰는 숫자
  ug: { offsetY: 6000, ambient: 0x403a4c, background: 0x2a2019, fadeMs: 400, climbMs: 800, wallFadeAlpha: 0.35,
        digHits: 4, digHitsIron: 6, stonePerCell: 1, ironPerCell: 2, sporePerCell: 2,
        bed: { healInterval: 6, sleepTimeScale: 4 },
        mushroom: { growEvery: 60, yield: 3, heal: 1 },   // heal: 배고픔을 끄면 버섯 하나가 채우는 하트(16.2, 열매와 같게)
        cost: { burrow: { wood: 6, stone: 4 }, bed: { wood: 6 }, fireplace: { stone: 8, wood: 2 }, lantern: { wood: 2, iron: 1 },
                planter: { wood: 3 }, table: { wood: 3 }, stool: { wood: 1 }, rug: { wood: 2 }, chest: { wood: 4, iron: 1 } },
        crouchMs: 300, climbRise: 150,          // 내려가기 전 쪼그려 앉는 시간(ms), 사다리를 오르내리는 높이(px)
        shake: { duration: 60, intensity: 0.002 }, chips: { hit: 2, out: 6, iron: 3 },
        markTint: 0xffe2a0, noMarkTime: 0.4, crackFrontDepth: 1.6, boundsPad: 400, eventVolume: 0.6,
        shaft: { color: 0xfff7e0, low: { radius: 170, alpha: 0.9 }, high: { radius: 120, alpha: 0.7, lift: 130 }, glowAlpha: 0.55, duskMin: 0.2 },
        // (Phase 18) 지하 살림 17.6~17.9. 아래 값은 17장의 글에 있는 숫자와 화면에 쓰는 숫자
        fireplace: { light: { radius: 300, color: 0xffedc7, alpha: 1, flicker: 0.03, flickerRates: [11, 27] }, glow: { size: 220, alpha: 0.45 } },
        lantern:   { light: { radius: 210, color: 0xffedc7, alpha: 0.9 }, glow: { size: 120, alpha: 0.35 } },
        chestVolume: 0.5,                       // 상자를 열고 닫는 소리(gate_open / gate_close)의 크기
        zzz: [-24, -56],                        // 침대에서 자는 동안 zzz 의 자리: 침대 기준점에서(px, 베개 위)
        attackHold: 5,                          // 땅 위의 시설이 마지막으로 맞은 뒤 이만큼(초) 동안은 침대의 빨리 감기를 멈춘다
        attackNotice: 5,                        // "땅 위: 캠프가 공격받고 있습니다"는 이만큼(초)에 한 번 이하
        debugSpores: 5 },                       // 시험용 도구 "포자 +5"
  // 해적의 지하 침입 (18.6). enabled 가 false 면 18장 전체가 없다(해적은 17.2 대로 굴 입구 둘레를 돈다).
  // 아래 두 줄은 18장의 글에 있는 숫자와 화면에 쓰는 숫자
  raid: { enabled: true, hatchHp: 20, knockSoundEvery: 0.8, descendInterval: 1.5, enterMs: 500,
          repairCost: { wood: 2 }, moon: { tint: 0x9fb4ff, alpha: 0.3 },
          lantern: { radius: 140, color: 0xffdba0, alpha: 0.85, swing: 6 },
          enterDrop: 40, holeLift: 150,                     // 굴 입구로 들어갈 때 내려가는 높이(px), 사다리 구멍: 사다리 칸 가운데에서 위로(px)
          knockShake: { duration: 120, intensity: 0.003 }, breakShake: { duration: 200, intensity: 0.006 },
          debris: { knock: 3, break: 12, time: [0.4, 0.65], spread: 22 },   // 사다리 구멍에서 떨어지는 부스러기: 수, 떨어지는 시간(초), 좌우로 퍼지는 폭(px)
          alertAfter: 3, alertHold: 1.2,                    // alert: 부서진 뒤 이만큼(초), 마지막으로 친 뒤 이만큼(초) 보여 준다
          moonLight: { color: 0x9fb4ff, low: { radius: 120, alpha: 0.4 }, high: { radius: 90, alpha: 0.3, lift: 120 } },
          lanternLight: { drop: 12, glowSize: 70, glowAlpha: 0.3 }, lanternFade: 0.3, swingRate: 9,   // 등불 빛은 등불에서 12px 아래. 흔들림 빠르기(라디안/초)
          menu: { w: 250, h: 60, gap: 10, lift: 140, font: 24 } },   // 굴 입구를 고치는 버튼: 굴 입구 기준점에서 위로 lift(px)
  // 지하 꾸미기 (19.9). 아래 줄의 이름과 화면 숫자는 19장의 글에 있는 것
  decor: { cost: { floorOak: { wood: 1 }, floorWalnut: { wood: 2 }, floorStone: { stone: 2 },
                   wallWood: { wood: 2 }, wallPlaster: { stone: 1, wood: 1 },
                   shelf: { wood: 2 }, sconce: { iron: 1, wood: 1 }, painting: { wood: 2 } },
           okTint: 0xc8f5b0, noTint: 0xff9c8c, hintY: 172,
           light: { color: 0xffebc2, alpha: 0.9, glowAlpha: 0.45,
                    sconce: { radius: 190, glow: 92 }, candelabra: { radius: 230, glow: 120 } },
           names: { floorOak: '나무 마루', floorWalnut: '짙은 마루', floorStone: '돌 바닥', wallWood: '나무 벽판', wallPlaster: '회벽',
                    shelf: '선반', sconce: '벽 촛대', painting: '그림 액자',
                    rugPersian: '페르시아 양탄자', rugRound: '둥근 양탄자', rugRunner: '긴 양탄자', flag: '해적 깃발', wheel: '배 키', map: '보물 지도',
                    candelabra: '촛대', globe: '지구본', treasure: '보물 상자', barrel: '술통' },
           floorDust: 0.5, wallDust: 0.4 },          // 깔 때 fx_dust 크기(배): 바닥재, 벽 장식
  // 해적 전리품 (19.6, 19.9)
  loot: { chance: 0.35, firstAlways: true, sparkleEvery: 2, bounce: 24,
          weights: { rugPersian: 3, rugRound: 3, rugRunner: 3, barrel: 3, flag: 2, wheel: 2, map: 2, candelabra: 2, globe: 1, treasure: 1 },
          bounceTime: 0.3, poofScale: 0.5, sparkleLift: 30, pickRise: 16, pickTime: 0.4 },
  // 배고픔 (16.5). enabled: false 면 배부름이 없고 먹을 것은 하트를 채운다
  hunger: { enabled: true, max: 5, start: 5, drainEvery: 90, starveEvery: 30, warnAt: 1,
            food: { berry: 1, carrot: 1, corn: 2, pumpkin: 3, mushroom: 1 } },
  berries: { perBush: 2, heal: 1 },   // 덤불 열매 (16.3)
  // 날씨 (14.5). 아래 줄의 값은 14장의 글에 있는 숫자
  weather: {
    chance: { clear: 0.6, rain: 0.25, snow: 0.15 }, firstDay: 'clear', fade: 4,
    rain: { far: { alpha: 0.6, speed: [200, 900] }, near: { alpha: 0.45, scale: 1.7, speed: [330, 1500] }, shade: 0xc7d1e6,
            splashEvery: 0.06, puddles: 10, puddleIn: 6, puddleOut: 20,
            puddleRange: 10 },                       // 웅덩이를 놓는 범위: 카메라 가운데에서 ±칸
    snow: { far: { alpha: 0.8, fall: 50, sway: 20, swayPeriod: 1400 }, near: { alpha: 0.6, scale: 1.7, fall: 90, sway: 30, swayPeriod: 1100 },
            shade: 0xf0f4ff, coverIn: 40, coverOut: 60,
            footprintCover: 0.5 },                   // 쌓인 눈이 이보다 진하면 어디서나 발자국과 step_snow
  },
  // (3단계) 강아지와 고양이 (13.4, 13.6). 아래 두 줄은 13.4 의 글에 있는 숫자와 화면에 쓰는 숫자
  pets: {
    followNear: 1.5, followFar: 3, teleportFar: 12, catSleepAfter: 10,
    dog: { speed: 3.8, barkRange: 6, barkEvery: 5, biteRange: 1.2, biteInterval: 1.2, biteDamage: 1, chaseMax: 3 },
    cat: { speed: 2.6, petsToBefriend: 3, gift: { carrot: 0.5, corn: 0.35, pumpkin: 0.15 },
           hop: [1, 2] },                     // 처음 두 번 쓰다듬은 뒤 옮겨 앉는 거리(칸)
    greetRange: 4, noPathTeleport: 3, teleportDust: 0.5,   // 처음 반기는 거리(칸), 길이 없을 때 옮기기까지(초), 옮길 때의 먼지(배)
    emote: { time: 0.8, rise: 6 },            // alert, heart, note 가 떠오르며 흐려지는 시간(초)과 높이(px)
    repathInterval: 0.5,                      // 따라갈 때 길을 다시 찾는 가장 짧은 간격(초)
    biteSlack: 0.3,                           // 물기의 hit 프레임에 적이 이만큼(칸) 더 멀어져도 맞는다
  },        // (2단계) 할 일: 캔 철광석 수, 깐 철조망 수 (11.1)

  // ── 아래는 6장에 없는, 화면과 조작에 쓰는 숫자 ──
  screen: {
    background: '#5fa9c8',   // 게임 배경색(바다색)
    font: '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", "Noto Sans CJK KR", sans-serif',
    textColor: '#4a3d38',
    maxFrameTime: 0.1,       // 한 프레임에 흐를 수 있는 가장 긴 시간(초). 화면이 잠깐 멈췄을 때 캐릭터가 튀지 않게.
  },
  anim: {
    burnFps: 6,              // 모닥불 그림을 초당 몇 장 바꾸는가
    // 캐릭터와 효과의 애니메이션(프레임 순서와 시간)은 manifest 의 anims 를 쓴다 (12.1)
  },
  input: {
    cursorTime: 0.4,         // 누른 칸 표시가 보이는 시간(초)
    pickAlpha: 110,          // 그림에서 이 값보다 진한 부분을 눌러야 그 사물을 고른다(0~255). 옅은 그림자는 빼려고.
    pickAlphaFence: 30,      // 울타리와 철조망은 이 값으로 고른다. 그림자가 없어서, 기둥과 가로대·철사의 옅은 가장자리까지 그 시설로 본다.
    enemyPad: 12,            // 적은 그림 사각형을 사방으로 이만큼(px) 넓힌 곳을 눌러도 고른다 (3.5)
    // (사용자 요청: 한 번에 잘 눌리게) 정확히 맞은 것이 없으면, 그림의 진한 곳에서 이만큼(px) 안을 눌러도 그 사물을 고른다.
    // 지하의 흙벽은 넓히지 않는다(벽 옆 바닥으로 걸어가려다 파지 않게)
    pickPad: 10,
    // 작고 얇은 그림은 그림 사각형 안 어디를 눌러도 그것(사다리, 문, 등불, 의자, 상자, 버섯 화분)
    boxPick: ['ug_ladder', 'build_gate_col', 'build_gate_row', 'build_lantern', 'build_stool', 'build_chest', 'build_planter'],
    tapPop: { scale: 0.06, time: 0.18 },   // 누른 사물이 잠깐 커졌다 돌아온다(눌렸다는 표시): 크기, 시간(초)
  },
  // 효과와 체력 막대. 12.10 의 이름은 그대로 두었다(hitStop ~ particleCount).
  fx: {
    // ── 12.10 ──
    hitStop: 0.05,           // 맞힐 때 때린 쪽과 맞은 쪽의 그림만 멈추는 시간(초)
    flash: 0.06,             // 맞은 캐릭터가 하얗게 번쩍이는 시간(초)
    knockback: 6, knockbackTime: 0.12,   // 맞은 캐릭터가 때린 쪽 반대로 밀리는 거리(px)와 시간(초)
    cameraShake: { duration: 120, intensity: 0.004 },   // 주인공이 맞았을 때 카메라 흔들림(ms, 세기)
    treeShake: 3,            // 나무·돌을 칠 때 좌우로 흔드는 폭(px)
    treeFall: { angle: 80, time: 0.5, fadeAfter: 0.3 },   // 다 벤 나무가 넘어가는 각도(도), 시간(초), 흐려지기 시작(초)
    buildPop: { from: 0.8, over: 1.06, time: 0.25 },     // 지을 때 크기 0.8 -> 1.06 -> 1.0 (초)
    blinkEvery: [3, 5],      // 주인공이 눈을 깜빡이는 간격(초, 이 사이에서 무작위)
    stepDustScale: 0.4,      // 걸을 때 디딜 때마다 뒷발에 이는 먼지의 크기(배)
    footprintLife: 3, footprintMax: 20,   // 모래 발자국이 남는 시간(초), 한 번에 최대 수
    arrowStuckLife: 2,       // (2단계) 땅에 꽂힌 화살이 남는 시간(초)
    particles: { lifespan: 600, speed: [90, 220], gravityY: 650 },   // 조각 효과(12.6)
    particleCount: 1,        // 조각 수 배율. 태블릿에서 느리면 0.5
    // ── 12장에 나오는 그 밖의 숫자 ──
    treeShakeTime: 0.16,     // 나무·돌이 흔들리는 시간(초)
    fallEase: 1.6,           // 넘어가는 나무가 점점 빨라지는 정도(각도 = angle × (t/time)^fallEase)
    fallDustAt: 0.38,        // 넘어간 끝에 먼지와 잎이 이는 때(초)
    fallDustDistance: 60,    // 그 자리: 기준점에서 넘어간 쪽으로(px)
    buildDustScale: 0.6,     // 지을 때 이는 먼지의 크기(배)
    impactHeight: { char: 40, object: 30 },   // 맞은 곳: 캐릭터는 발에서, 나무·돌·시설은 기준점에서 위로(px)
    impactPull: 6,           // 맞은 곳을 때린 쪽으로 당기는 거리(px)
    stepBack: 8,             // 걸을 때 먼지가 이는 곳: 발에서 걷는 반대쪽으로(px)
    footprintFade: 1,        // 발자국이 사라지는 데 걸리는 시간(초)
    stepMargin: 100,         // 화면 밖 이만큼(px)보다 먼 곳의 발걸음 먼지·발자국은 만들지 않는다
    downDelay: 1,            // 주인공이 쓰러진 뒤 "쓰러졌습니다" 창이 뜨기까지(초)
    dieFade: 0.4,            // 쓰러진 적이 흐려지며 사라지는 시간(초)
    splashDistance: 30,      // 해적이 상륙할 때 물보라: 상륙 칸에서 배 쪽으로(px)
    emberEvery: 0.3,         // 밤에 모닥불에서 불티가 하나씩 오르는 간격(초)
    buildPopPeak: 0.6,       // 지을 때 가장 커지는 때(buildPop 시간에 대한 비율)
    corpseShift: 30,         // 쓰러진 적의 몸 한가운데: 발에서 보는 쪽의 뒤로(px). 연기가 여기서 난다
    // 조각의 수 (12.6 표). [a, b]는 앞의 조각 a개 + 뒤의 조각 b개
    chips: { till: 4, harvest: 4, berry: 2,   // berry: 열매를 딸 때 잎 (16.3)
                       // (3단계) 밭 갈기 dirt, 거두기 잎 (13.3)
             treeHit: [3, 2], treeFall: 8, rockHit: [3, 1], rockBreak: 6, enemyHit: 3, rise: [6, 2], build: 4, broken: 6, hearts: 2, ember: 1,
             ironHit: [2, 3], ironBreak: 6 },   // ironBreak: 다 캔 철광석의 조각(12.7은 수를 적지 않았다. 돌과 같게)
    // 조각이 흩어지는 모양: 보통(12.6 예시), 천천히 지는 잎, 위로 오르는 하트, 모닥불 불티.
    // 적지 않은 값(speed, gravityY, lifespan)은 particles 의 값을 쓴다.
    burst: {
      chips:  { angle: [200, 340], rotate: [0, 360], scale: [0.8, 1.2] },
      leaves: { angle: [200, 340], rotate: [0, 360], scale: [0.8, 1.2], speed: [40, 140], gravityY: 250 },
      hearts: { angle: [250, 290], speed: [40, 70], gravityY: -20 },
      ember:  { angle: [255, 285], speed: [30, 60], gravityY: -15, lifespan: 1200 },
    },
    // ── 3장의 효과와 체력 막대 ──
    hitHeight: 28,           // 그루터기·돌 부스러기를 팔 때 맞은 곳: 발에서 위로(px, 그림 높이의 절반을 넘지 않게)
    poofTime: 0.3, poofFrom: 0.6, poofTo: 1.4,   // 먼지 그림이 커지며 흐려지는 시간(초)과 크기(배)
    popupTime: 0.9, popupRise: 60, popupIcon: 44, popupFont: 30,   // 떠오르는 "+4": 시간(초), 높이(px), 아이콘과 글자 크기
    barWidth: 56, barHeight: 8, barGap: 10,      // 체력 막대 크기, 그림 위쪽과의 간격(px)
    barLinger: 0.9,                  // 마지막으로 친 뒤 막대가 남아 있는 시간(초)
    wireBarDrop: 24,                 // (2단계) 철조망의 체력 막대: 기준점에서 아래로(px). 위에 선 적의 얼굴에 걸리지 않게
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
  depth: { ground: 0, snow: 1, footprint: 2, floor: 3, objectBase: 10, charBias: 0.5, fx: 50000 },   // footprint: 모래 발자국(12.9)

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
    bag: { w: 300, h: 88, icon: 72, font: 34, iconX: [46, 188], countX: [84, 226], countY: 51,
           step: 142 },                    // (3단계) 작물·씨앗 칸이 생기면 한 칸에 이만큼씩 넓어진다(preview_farm.png)
    bag2: { w: 438, iconX: [46, 188, 330], countX: [84, 226, 368] },   // (2단계) 나무, 돌, 철광석 (preview_defense_day.png)
    // (사용자 요청) 가방 끝의 접기 단추: 폭, 글자, 안쪽 여백과 둥글기, 진하기. 만들기 버튼과의 간격, 위로 올린 줄 사이
    bagTab: { w: 64, font: 26, inset: 10, radius: 12, shade: 0.12, gapToCraft: 16, rowGap: 10 },
    equip: { gap: 20, pad: 10, slot: 76, icon: 72 },
    // 오른쪽 아래: 만들기 버튼
    craftButton: { size: 136, edge: 28, border: 4, borderOpen: 6, icon: 80, iconY: -20, font: 22, textY: 34 },
    // 만들기 창: 버튼 위로 열린다
    craft: { gapToButton: 20, pad: 20, titleHeight: 44, titleFont: 28, titleY: 36, noteFont: 20,
             cardW: 170, cardH: 196, cardGap: 12, cardRadius: 16, cardBorder: 3, selectedBorder: 7,
             icon: 96, iconY: 56, nameY: 124, nameFont: 24,
             costY: 164, costIcon: 40, costFont: 24, costStep: 66, costTrim: 6, costTextX: 42,   // 재료 아이콘과 숫자 한 묶음의 폭이 costStep
             statusFont: 22 },                   // "보유", "절반 돌려받음" 글자
    // (2단계) 만들기 창: 카드 10장 두 줄(11.3, preview_defense_day.png). 적지 않은 값은 craft 의 값
    craft2: { perRow: 5, rowGap: 12, cardW: 150, cardH: 170, icon: 70, iconY: 40, nameY: 98, nameFont: 22,
              costY: 138, costIcon: 32, costFont: 22, costStep: 58, costTrim: 6, costTextX: 36, statusFont: 20 },
    // 왼쪽 위: 하트(56px). 빈 칸은 icon_heart_empty
    hearts: { h: 72, padX: 13, step: 58, icon: 56 },
    // (3단계) "무엇을 심을까요?" 창 (preview_farm.png). bottom: 화면 아래에서 창 아래까지
    seedWin: { bottom: 180, pad: 18, titleH: 52, titleY: 32, titleFont: 26, closeFont: 22, cardW: 150, cardH: 166, cardGap: 12,
               icon: 70, iconY: 54, nameY: 118, countY: 146, nameFont: 22, countFont: 20 },
    soundButton: { gap: 10, icon: 46 },
    // (배고픔) 하트 칸 바로 아래의 배부름 칸: 밥그릇 다섯 개(44px). 1 이하면 shakeEvery 초마다 살짝 흔든다 (16.4)
    hunger: { gap: 8, h: 56, padX: 12, step: 50, icon: 44, shakeEvery: 0.8, shake: 3 },   // 하트 칸 오른쪽의 동그란 소리 켜고 끄기 버튼(지름은 하트 칸 높이) (15.1)
    // 가운데 위: 해/달 아이콘, "1일째 낮", 진행 막대(낮 노랑, 밤 파랑). x 는 화면 가운데 기준, y 는 패널 위쪽 기준
    clock: { w: 460, h: 72, iconX: -190, icon: 64, textX: -150, textY: 24, font: 26,
             weatherGap: 14, weatherIcon: 60,   // (날씨) 시계 오른쪽의 비·눈 아이콘 (14.1, preview_rain.png)
             barX: -150, barY: 42, barW: 356, barH: 18, track: 0xc4b8a8, dayFill: 0xf0be54, nightFill: 0x687ac4 },
    // (지하 꾸미기) 만들기 창의 탭과 꾸미기 탭(19.8, preview_decor_ui.png). 적지 않은 값은 craft2 의 값
    craftTabs: { x: 8, y: 10, w: 104, h: 36, gap: 8, font: 24, radius: 18 },
    craftDecor: { perRow: 10, sectionH: 30, sectionFont: 20, rowGap: 6 },
    // (지하) 시계 아래의 "지하 1층" 표시 (17.9, preview_underground.png). 지하에서는 알림이 그 아래로 내려간다
    ugTag: { gap: 12, h: 50, padX: 18, icon: 40, iconGap: 10, font: 26 },
    noticeIcon: { size: 40, gap: 10 },           // 알림 앞의 아이콘(땅 위 소식의 icon_surface)
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

// 농사 도구의 재료는 farm 묶음의 값을 쓴다(13.6 에 그렇게 적혀 있다)
CONFIG.tools.hoe.cost = CONFIG.farm.hoeCost;
CONFIG.tools.watering_can.cost = CONFIG.farm.canCost;
// 굴 입구와 지하 가구의 재료는 ug.cost 의 값을 쓴다(17.11)
for (const [k, cost] of Object.entries(CONFIG.ug.cost)) CONFIG.build[k].cost = cost;
// 굴 입구(뚜껑)의 체력은 raid.hatchHp (18.6)
CONFIG.build.burrow.hp = CONFIG.raid.hatchHp;
