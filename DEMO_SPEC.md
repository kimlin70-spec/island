# 섬 생존 프로토타입 — 개발 지시문 (1단계: 첫날과 첫 밤 · 2단계: 철과 방어 시설 · 다듬기)

이 문서는 Claude Code가 읽고 그대로 만드는 기준 문서다. 그림(`assets/`)과 맵(`data/map.json`)은 이미 들어 있다.

## 0. 무엇을 만드는가

- **목적**: 게임 초반의 흐름이 재미있는지 직접 해 보고 판단하기 위한 프로토타입. 앞으로 많이 고칠 것이므로 **작게, 고치기 쉽게** 만든다.
- **1단계 (Phase 1~6)**: 단검과 티셔츠만 가지고 시작 → 단검으로 나무를 벤다 → 나무 도끼와 나무 곡괭이를 만든다 → 나무와 돌을 모아 울타리, 모닥불, 텐트를 짓는다 → 첫 밤을 넘긴다.
- **2단계 (Phase 7~9, 11장)**: 철광석을 캐서 총과 철조망을 만들고, 화살을 쏘는 망루와 총을 쏘는 총 타워를 세워 밤을 막는다(타워 디펜스). 해적 중에는 멀리서 총을 쏘는 총잡이가 있다. **1단계를 끝내고 사용자가 원할 때** 시작한다.
- **다듬기 (Phase 10, 12장)**: 게임 규칙은 그대로 두고 움직임과 타격감을 자연스럽게 한다. 걷기 4장, 뒷모습, 숨쉬기와 눈 깜빡임, 휘두르기 3장, 맞기·쓰러지기·땅에서 올라오기, 휘두른 궤적, 맞은 곳의 번쩍임, 나무 조각과 잎, 먼지 등. Phase 5 이후 아무 때나 할 수 있다.
- **게임 전체 구상(참고만 한다. 이번에 만들지 않는다)**: 낮은 안전하고 밤에만 좀비나 해적이 나온다. 낮에는 나무와 돌을 캐서 캠프를 짓는다. 주기적으로 배가 고파져서 농사, 낚시, 사냥을 해야 한다. 나중에는 닭과 젖소를 키워 계란과 우유를 얻고, 강아지와 고양이도 키운다.
- **넣지 않는 것**: 스토리, 저장, 소리, 제목 화면. 새로고침하면 처음부터 다시 시작한다. 자세한 목록은 10장.
- **플레이 환경**: PC 브라우저(마우스)와 태블릿(터치). 가로 화면.
- **만드는 사람**: 개발 지식이 없다. 설명은 쉬운 한국어로 하고, 실행 명령은 그대로 복사해 쓸 수 있게 적는다.
- **완성 모습**: 먼저 `preview/` 폴더의 그림을 본다. 게임 화면이 이 그림과 같은 느낌이어야 한다.
  - `preview_map.png` 섬 전체 / `preview_day.png` 시작 직후 / `preview_build.png` 만들기 창을 열고 캠프를 짓는 중 / `preview_night.png` 첫 밤(해적은 Phase 6을 넣었을 때의 모습) / `preview_assets.png` 그림 전체
  - 2단계: `preview_iron.png` 철광석 캐기 / `preview_defense_day.png` 총 타워 지을 칸 고르기(사거리 표시) / `preview_defense_night.png` 탑, 철조망, 총잡이 해적이 있는 밤
  - 다듬기: `preview_motion.gif` 움직이는 미리보기(걷기, 나무 베기, 돌 캐기, 맞기와 쓰러지기, 땅에서 올라오기, 장전)
- **참고 예시**: `tools/reference_map.html`은 3장의 규칙만으로 화면을 그리는 확인용 페이지다. 서버를 켜고 `http://localhost:8000/tools/reference_map.html?mode=day` (또는 `night`, `full`, `defense`)로 연다. Phaser 3.90에서 아래 네 가지가 되는 것을 확인했다. 좌표, 겹침, 밤 화면이 헷갈리면 이 파일을 본다. 다만 게임 코드는 이 파일을 늘려 가지 말고 2장의 구성대로 새로 짠다.
  - 바닥 그림 조각 사이에 줄이 보이지 않는다(카메라가 소수 좌표에 있거나 확대·축소해도).
  - 누른 곳 → 칸 변환이 맞는다(1920×1200, 1366×768, 1024×768 터치).
  - 밤 화면(빛 지도)이 `preview_night.png`와 같게 나온다.
  - (`mode=defense`) 포탑이 움직이는 좀비 쪽으로 돌아가며 화살과 총알을 쏜다. 포탑 시트(두 줄짜리 포함), 받침 위의 포탑 위치, 총구 위치가 맞다.
  - (`mode=motion`) manifest의 `anims` 55개가 빠진 프레임 없이 Phaser 애니메이션으로 만들어지고, 프레임마다 정한 시간대로 돈다. `fx_particles`로 Phaser 파티클이 나온다.

## 1. 작업 방식

1. **9장의 Phase를 하나씩** 진행한다. 한 Phase가 끝나면 아래 세 가지를 쉬운 말로 알려 주고 **멈춘다.** 사용자가 "다음"이라고 하면 다음 Phase로 간다.
   - 실행하는 방법
   - 사용자가 직접 해 보고 확인할 것 (각 Phase의 "확인할 것" 목록)
   - 아직 안 되는 것, 알려진 문제
2. Phase가 끝날 때마다 `PROGRESS.md`에 한 일과 다음 할 일을 적는다. 새 대화를 시작하면 이 파일부터 읽는다.
3. **그림은 `assets/`에 있는 것만 쓴다.** 필요한 그림이 없으면 색 도형과 글자로 임시 처리하고, `PROGRESS.md`의 "필요한 그림" 목록에 적는다. 새 그림을 직접 만들지 않는다.
4. **바꿀 수 있는 숫자는 전부 `src/config.js` 한 곳에** 둔다(6장). 코드 중간에 숫자를 직접 쓰지 않는다.
5. 이 문서에 없는 기능은 넣지 않는다. 문서대로 하기 어렵거나 더 나은 방법이 있으면 먼저 물어본다.
6. 한 Phase 안에서 스스로 실행해 보고, 콘솔 오류가 없는 상태에서 멈춘다.

## 2. 기술 조건

- **Phaser 3.90.0**이 `lib/phaser.min.js`에 들어 있다. 이 파일을 쓴다(CDN에 의존하지 않는다).
- **빌드 도구 없음.** `index.html` + ES 모듈(`<script type="module">`)만 쓴다. 정적 파일 서버 하나로 실행된다.
  - 실행: 프로젝트 폴더에서 `python -m http.server 8000` → 브라우저에서 `http://localhost:8000`
  - `index.html`의 `<head>`에 `<link rel="icon" href="data:,">`를 넣어 favicon 오류가 콘솔에 뜨지 않게 한다.
- **화면**: 게임 해상도 1920×1200, `Phaser.Scale.FIT` + 가운데 정렬. 페이지 배경색 `#26303a`, 게임 배경색 `#5fa9c8`.
- **조작**: 한 번 누르기(마우스 클릭 = 터치)만 쓴다. 끌기, 길게 누르기, 두 손가락 조작, 키보드는 쓰지 않는다. 마우스를 움직일 때(터치는 누르고 있는 동안)의 위치는 짓기 표시에만 쓴다.
- **터치 기기 대응**: 페이지 스크롤, 확대, 길게 눌러 선택이 일어나지 않게 한다(`viewport`의 `user-scalable=no`, CSS `touch-action: none`, `user-select: none`).
- **글꼴**: 시스템 글꼴(`"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif`), 굵게. 글자색 `#4a3d38`.
- **화면 글의 말투**: 일반 이용자 대상의 담백한 존댓말("나무가 부족합니다", "곧 밤이 됩니다").
- **권장 폴더 구성** (세부는 조정 가능)

```
index.html
lib/phaser.min.js      제공됨
src/main.js            게임 설정, 씬 등록
src/config.js          모든 숫자
src/iso.js             좌표 변환
src/scenes/            BootScene(불러오기), GameScene(월드), UIScene(화면 UI와 빛 지도)
src/systems/           지도와 길찾기, 캐기, 만들기와 짓기, 낮밤, 적 등
assets/  data/         제공됨 (그대로 쓴다)
tools/  preview/       제공됨 (게임에는 쓰지 않는다)
```

## 3. 그림과 좌표 규칙

### 3.1 manifest.json

`assets/manifest.json`에 모든 그림의 정보가 있다. BootScene에서 이 파일과 `data/map.json`을 먼저 읽고, 그 내용대로 그림을 불러온다. 파일 경로, 크기, 기준점, 프레임 크기를 코드에 따로 적지 말고 manifest 값을 쓴다.

```json
{
  "meta": {
    "tileWidth": 80, "tileHeight": 40, "viewWidth": 1920, "viewHeight": 1200,
    "ground": { "x": -2559, "y": -275, "width": 5110, "height": 3066,
                "chunkSize": 1024, "chunkStep": 1022, "chunkMargin": 1,
                "chunks": [ { "key": "ground_0_0", "file": "ground/ground_0_0.jpg", "x": -2560, "y": -276 }, ... ] }
  },
  "assets": {
    "obj_tree_a1": { "file": "objects/obj_tree_a1.png", "w": 109, "h": 130, "originX": 0.4005, "originY": 0.8016, "kind": "object" },
    "char_player": { "file": "chars/char_player.png", "w": 1310, "h": 504, "originX": 0.5, "originY": 0.6485, "kind": "char",
                     "frameWidth": 131, "frameHeight": 126,
                     "frames": ["idle", "walk1", "walk2", "dagger1", "dagger2", "axe1", "axe2", "pick1", "pick2", "gun1", "gun2", "idle2", ... ],
                     "muzzle": { "gun1": [47.2, -37.9], "gun2": [42.4, -45.6], ... },
                     "anims": { "walk": { "frames": [["walk1", 83], ["walk3", 83], ["walk2", 83], ["walk4", 83]], "loop": true },
                                "axe": { "frames": [["axe1", 190], ["axe2", 90], ["axe3", 150]], "loop": false, "hit": "axe2", "swing": "heavy" }, ... } }
  }
}
```

- `originX`, `originY`: 그림에서 **발이 닿는 점**. `sprite.setOrigin(originX, originY)`를 하고 칸 중심 좌표에 놓으면 제자리에 선다. 그림자는 그림 안에 이미 들어 있다.
- `frameWidth`가 있으면 스프라이트 시트다. `frames`의 순서가 프레임 번호(0부터)다.
- 그 밖의 값: `build_tent`의 `footprint`(차지하는 칸 수)와 `door`(문 한가운데, 기준점에서의 px 거리), `build_campfire`의 `flame`(불꽃 위치), `obj_ship`의 `lamp`(등불 위치). 빛을 놓을 자리로 쓴다.
- 2단계에서 쓰는 값: 탑 받침의 `turret`(올릴 포탑 그림 이름), `mount`(포탑을 올리는 자리), `lamp`(등불), 포탑의 `directions`(방향 수 16), `muzzle`(방향별 화살·총알이 나가는 곳 16개), `screenAngle`(방향별 화면 각도), 캐릭터의 `muzzle`(프레임별 총구 위치). 쓰는 법은 11.10.
- 시트는 여러 줄일 수 있다(캐릭터는 10개씩, `turret_bow`는 16개씩). 프레임 번호는 왼쪽→오른쪽, 위→아래 순서다. Phaser의 `load.spritesheet`가 그대로 읽는다. 프레임은 번호 대신 이름으로 찾는다(`frames.indexOf(이름)`). 프레임은 뒤에 붙여 늘리므로 예전 이름의 번호는 바뀌지 않는다.
- `anims`: 애니메이션 이름 → 프레임 순서와 각 프레임의 시간(ms), `loop`(반복), `hit`(피해를 주는 프레임), `swing`(그때 함께 틀 `fx_swing`의 애니메이션). 쓰는 법은 12.1.

### 3.2 좌표 변환

한 칸은 가로 80, 세로 40 픽셀의 마름모다. `(col, row)`는 맵 배열의 열과 행이다.

```js
const HW = 40, HH = 20;

// 칸 -> 월드 좌표(칸 중심)
function tileToWorld(col, row) {
  return { x: (col - row) * HW, y: (col + row) * HH };
}

// 월드 좌표 -> 칸  (누른 곳은 pointer.worldX, pointer.worldY 를 넣는다)
function worldToTile(x, y) {
  return {
    col: Math.floor((x / HW + y / HH) / 2 + 0.5),
    row: Math.floor((y / HH - x / HW) / 2 + 0.5),
  };
}
```

- `col + row`가 클수록 화면 아래쪽(가까운 쪽)이다. `col`이 늘면 화면 오른쪽 아래로, `row`가 늘면 왼쪽 아래로 간다.
- 소수 칸 좌표도 같은 식을 쓴다. 2×2칸인 텐트는 네 칸의 한가운데인 `tileToWorld(col + 0.5, row + 0.5)`에 놓는다.

### 3.3 바닥 그림

바닥은 타일을 이어 붙이는 방식이 아니라, **섬 전체를 그린 큰 그림 한 장**을 조각으로 나눈 것이다(풀, 모래, 물결, 꽃이 모두 그려져 있다). 맵이 바뀌면 `tools/make_ground.py`로 다시 그린다.

```js
const G = manifest.meta.ground;
for (const ch of G.chunks) {
  this.add.image(ch.x, ch.y, ch.key).setOrigin(0, 0)
    .setCrop(G.chunkMargin, G.chunkMargin, G.chunkStep, G.chunkStep)   // 가장자리 1px을 빼고 안쪽 1022x1022만 그린다
    .setDepth(0);
}
this.cameras.main.setBounds(G.x, G.y, G.width, G.height);              // 카메라가 바닥 그림 밖으로 나가지 않게
```

- **`setCrop`을 빼면 안 된다.** 조각 그림은 이웃 조각과 1px씩 겹치게 만들어져 있다. 그림 전체를 그리면 카메라가 움직일 때 조각 사이에 가는 줄이 보인다(직접 확인한 문제다).
- 물, 모래, 풀의 경계는 그림에서 자연스럽게 번져 있지만, 걸을 수 있는지는 `map.terrain`의 칸 값으로만 판단한다.

### 3.4 그리는 순서(깊이)

| 순서 | 내용 | depth |
|---|---|---|
| 1 | 바닥 그림 조각 | 0 |
| 2 | 바닥 표시: 지을 수 있음/없음, 누른 칸 | 3 |
| 3 | 사물, 시설, 캐릭터 | `10 + 발 위치의 월드 y` |
| 4 | 효과(먼지, 타격, 떠오르는 숫자), 체력 막대 | 50000 |
| 5 | 빛 지도(3.7) | UIScene의 맨 아래 |
| 6 | 화면 UI | UIScene |

- 3번은 **발 위치의 y가 클수록 앞에** 그린다. 움직이는 캐릭터는 매 프레임 depth를 갱신한다. y가 같으면 캐릭터가 사물보다 앞이다.
- 주인공이나 적이 키 큰 사물(나무, 텐트, 2단계의 탑) 뒤에 가려지면 그 사물을 반투명(알파 0.5)으로 바꿔 보이게 한다. 벗어나면 되돌린다. 탑은 받침과 포탑을 함께 바꾼다.
- (2단계) 포탑의 depth = 받침 depth + 0.5. 날아가는 화살과 총알, 총구 불꽃과 연기는 4번(50000)이다.

### 3.5 사물과 캐릭터

- 맵의 사물은 `objects[].sprite`에 쓸 그림 이름이 적혀 있다(같은 나무라도 모양이 여러 가지다). 그대로 쓴다.
- 다 벤 나무는 `obj_stump`, 다 캔 돌은 `obj_rubble`로 바꾼다. 이 둘은 장식이다. 밟고 지나갈 수 있고, 그 칸에 시설을 지으면 사라진다.
- 캐릭터 그림은 모두 **오른쪽**을 본다. 화면 왼쪽으로 움직이거나 왼쪽의 대상을 향할 때 `setFlipX(true)`. 시트는 발이 프레임 가로 한가운데에 있어서 뒤집어도 위치가 변하지 않는다.
- 걷기: `walk1`, `walk2`를 초당 6장으로 번갈아. 서 있을 때는 `idle`(좀비와 해적은 `walk1`).
  - 새로 시작한다면 처음부터 manifest의 `anims`(12.1)로 걷기(4장)와 도구 쓰기(3장)를 만들어도 된다. 더 자연스럽고 코드는 같다. 이미 아래 방법으로 만들었다면 Phase 10에서 바꾼다.
- 주인공이 도구를 쓸 때: 도구에 따라 `dagger1→dagger2`, `axe1→axe2`, `pick1→pick2`. 앞의 것(들어 올림)을 0.2초, 뒤의 것(내려침)을 0.15초 보여 주고 `idle`로 돌아간다. **내려치는 순간**에 피해를 주고, 맞은 대상을 0.1초 동안 좌우로 3px 흔들고 `fx_hit`을 0.15초 보여 준다.
- 좀비와 해적이 때릴 때는 `attack` 프레임을 0.3초 보여 준다.
- 맞은 캐릭터는 0.1초 동안 하얗게 번쩍인다. 사물이 다 쓰이거나 캐릭터·시설이 사라질 때는 `fx_poof`가 0.3초 동안 커지며 흐려진다.
- 모닥불은 `burn1~burn3`을 초당 6장으로 반복한다.
- **누른 대상 판정** (우선순위: 화면 UI → 적 → 사물·시설 → 땅)
  - 적: 그림 사각형을 사방 12px 넓힌 영역.
  - 사물·시설: 그림의 **투명하지 않은 부분**(나무는 잎을 눌러도 선택된다). 누른 점이 그림 사각형 안에 있는 것들을 depth가 큰 것부터 보면서 `this.textures.getPixelAlpha(x, y, key, frame)`로 확인한다.
  - 둘 다 아니면 `worldToTile`로 땅의 칸을 구한다.

### 3.6 울타리 연결

울타리는 이웃 칸에 울타리가 있는 방향으로 가로대가 이어진다. 이웃에 따라 아래 숫자를 더한 값이 그림 번호다(`build_fence_0` ~ `build_fence_15`).

```js
function fenceMask(col, row, hasFence) {
  return (hasFence(col + 1, row) ? 1 : 0) | (hasFence(col - 1, row) ? 2 : 0)
       | (hasFence(col, row + 1) ? 4 : 0) | (hasFence(col, row - 1) ? 8 : 0);
}
```

울타리를 짓거나 없앨 때 그 칸과 이웃 네 칸의 그림을 다시 고른다. 16장 모두 크기와 기준점이 같다.

### 3.7 밤의 빛 (빛 지도)

밤에는 화면 전체가 푸르게 어두워지고, 모닥불 둘레만 밝다. 방법은 다음과 같다.

1. UIScene에서 **가장 먼저** 화면 크기의 `RenderTexture`를 만들고 블렌드를 `MULTIPLY`로 둔다. 월드 위, 다른 UI 아래에 그려진다.
2. 매 프레임 이 그림판을 **지금 시간의 화면색**으로 채우고, 빛마다 `light_soft`(가운데가 진한 흰 원)를 빛 색으로 물들여 보통 방식으로 그린다.
3. 결과가 화면에 곱해진다. 화면색 부분은 어두워지고 빛 부분은 원래 색이 살아난다.

```js
// UIScene.create() — 다른 UI보다 먼저
this.lightmap = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.MULTIPLY);
this.stamp = this.make.image({ key: 'light_soft', add: false });

// UIScene.update() — 화면색이 흰색이면 lightmap.setVisible(false) 하고 건너뛴다
const cam = gameScene.cameras.main;
this.lightmap.fill(ambientColor);
for (const L of lights) {                          // { x, y, radius, color, alpha }  월드 좌표
  const size = L.radius * 2 * cam.zoom;
  this.stamp.setTint(L.color).setAlpha(L.alpha * lightStrength).setDisplaySize(size, size);
  this.lightmap.draw(this.stamp,
    (L.x - cam.midPoint.x) * cam.zoom + cam.width / 2,      // 월드 -> 화면. cam.worldView 는 반올림된 값이라 쓰지 않는다
    (L.y - cam.midPoint.y) * cam.zoom + cam.height / 2);
}
```

| 시간 | 화면색 `ambientColor` | 빛 세기 `lightStrength` |
|---|---|---|
| 낮 | `#ffffff` (빛 지도를 숨긴다) | 0 |
| 저녁 앞 절반 | `#ffffff` → `#ffd2a6` | 0 |
| 저녁 뒤 절반 | `#ffd2a6` → `#6670b8` | 0 → 1 |
| 밤 | `#6670b8` | 1 |
| 아침(3초 동안) | `#6670b8` → `#ffffff` | 1 → 0 |

| 빛 | 위치 | 반지름 | 색 | 알파 |
|---|---|---|---|---|
| 모닥불 | 기준점 + `flame` | 300 (±3%로 일렁임) | `#ffedc7` | 1 |
| 주인공 | 발에서 24px 위 (텐트 안에 있으면 없음) | 150 | `#ebf0ff` | 0.6 |
| 주인공이 들어가 있는 텐트 | 기준점 + `door` | 110 | `#ffedc7` | 0.8 |
| 해적선 등불 | 기준점 + `lamp` | 130 | `#ffedc7` | 0.9 |
| (2단계) 망루, 총 타워 등불 | 기준점 + `lamp` | 120 | `#ffedc7` | 0.85 |
| (2단계) 총을 쏜 순간(0.1초) | 총구 | 110 | `#ffedc7` | 0.9 |

- 모닥불에는 추가로 `glow_warm`을 월드에 `ADD` 블렌드로 올린다(불꽃 위치, 크기 220, 알파는 밤 0.45 / 낮 0.2, depth는 모닥불 바로 위).
- 빛 지도가 기기에서 문제를 일으키면 화면 전체 사각형(`MULTIPLY`, 화면색)으로 대신하고 `PROGRESS.md`에 적는다.

### 3.8 그림 목록

| 구분 | key |
|---|---|
| 바닥 | `ground_0_0` ~ `ground_2_4` (15조각, `meta.ground.chunks`) |
| 자연 사물 | `obj_tree_a1~a3`, `obj_tree_b1~b2`, `obj_tree_w1`, `obj_pine_1~3`, `obj_palm_1~2`, `obj_rock_s`, `obj_rock_m`, `obj_rock_l`, `obj_bush_1~2`, `obj_stump`, `obj_rubble` |
| 시설 | `build_fence_0~15`, `build_tent`, `build_tent_lit`(안에 불이 켜진 모습), `build_campfire`(시트: burn1~3) |
| 캐릭터 시트 | `char_player`(idle, walk1, walk2, dagger1, dagger2, axe1, axe2, pick1, pick2), `char_zombie`(walk1, walk2, attack), `char_pirate_1`·`char_pirate_2`(walk1, walk2, attack) |
| 해적 | `obj_ship`, `obj_rowboat` |
| 아이콘 80×80 | `icon_wood`, `icon_stone`, `icon_heart`, `icon_heart_empty`, `icon_dagger`, `icon_axe`, `icon_pickaxe`, `icon_tshirt`, `icon_fence`, `icon_tent`, `icon_campfire`, `icon_sun`, `icon_moon`, `icon_craft`, `icon_remove`, `icon_sleep` |
| 바닥 표시 | `overlay_ok`(지을 수 있음), `overlay_no`(지을 수 없음), `overlay_cursor`(누른 칸) |
| 효과, 빛 | `fx_poof`, `fx_hit`, `light_soft`, `glow_warm` |
| (2단계) 사물 | `obj_iron_1`, `obj_iron_2`(철광석) |
| (2단계) 시설 | `build_wire_0~15`(철조망, 울타리처럼 연결), `build_watchtower`(망루 받침), `build_guntower`(총 타워 받침) |
| (2단계) 포탑 시트 | `turret_bow`(쇠뇌: load0~load15, shot0~shot15), `turret_gun`(총: dir0~dir15) |
| (2단계) 캐릭터 | `char_player`의 gun1, gun2 프레임, `char_pirate_3`(총잡이 해적: walk1, walk2, aim, shoot) |
| (2단계) 아이콘 | `icon_iron`, `icon_gun`, `icon_wire`, `icon_watchtower`, `icon_guntower` |
| (2단계) 날아가는 것, 효과 | `proj_arrow`, `proj_bullet`, `fx_muzzle`(총구 불꽃), `fx_smoke`(총 연기), `overlay_range`(사거리 표시) |
| (다듬기) 캐릭터 프레임 | 걷기 walk3, walk4, 숨쉬기 idle2, 눈 깜빡임 blink, 휘두르기 마지막 장(dagger3 등), hurt, 쓰러짐(down, die1~3), 땅에서 올라옴(rise1~3), 해적 attack0·attack2, 총잡이 reload1·2, 뒷모습(b가 붙은 이름) |
| (다듬기) 효과 시트 | `fx_swing`(휘두른 궤적), `fx_impact`(맞은 곳), `fx_dust`(먼지), `fx_sparkle`(반짝임), `fx_vanish`(보라 연기), `fx_splash`(물보라), `fx_smoke_puff`(총 연기 4장) |
| (다듬기) 조각, 자국 | `fx_particles`(wood1, wood2, leaf1~3, stone1, stone2, iron, spark, ember, goo, dirt, dust, heart), `fx_footprint`(모래 발자국), `proj_arrow_stuck`(땅에 꽂힌 화살) |

주인공 그림은 임시다. 누가 주인공인지는 나중에 정한다.

## 4. 맵 데이터 (data/map.json)

```json
{
  "cols": 64, "rows": 64, "tileWidth": 80, "tileHeight": 40,
  "terrainLegend": { "0": "water", "1": "sand", "2": "grass", "3": "forest", "4": "dirt", "5": "ironsoil" },
  "terrain": [[...64개...], ...64줄...],                 // terrain[row][col]
  "playerStart": { "col": 37, "row": 39 },
  "zombieSpawns": [ { "col": 32, "row": 22 }, ... ],      // 10곳, 숲 속
  "pirates": { "ship": { "col": 35.92, "row": 59.15 }, "boat": { "col": 34.97, "row": 53.18 }, "landing": { "col": 35, "row": 51 } },
  "objects": [ { "kind": "tree", "sprite": "obj_tree_b2", "col": 17, "row": 20 }, ... ]   // 270개
}
```

- 땅은 `terrain` 값이 0(물)이 아닌 칸이다. 모래, 풀, 숲, 흙, 철광 지대(5) 모두 걸을 수 있고 지을 수 있다(종류에 따른 차이는 이번에 없다).
- `objects[].kind`: `tree`(105), `pine`(79), `palm`(9), `rock`(41), `bush`(26), `iron`(10). 모두 그 칸을 막는다. **덤불은 이번에는 장식**이다(캘 수 없다). `iron`(철광석)은 2단계부터 캔다. 1단계에서는 돌처럼 길을 막기만 하고, 누르면 "아직 캘 수 없습니다"를 보여 준다.
- 동쪽(시작 지점에서 12칸, 화면 오른쪽)에 붉은 흙의 철광 지대가 있고, 철광석 10개(모두 캐면 23개)가 있다.
- 시작 지점은 섬 아래쪽 풀밭 한가운데다(`preview_map.png`). 12칸 안에 나무 16그루와 돌 5개가 있고, 화면 기준으로 왼쪽에 돌밭, 위쪽과 오른쪽에 숲이 있다.
- 사물이 길을 막지 않게 검증해 두었다(걸을 수 있는 모든 칸이 시작 지점과 이어져 있다). 사물 위치를 코드에서 바꾸지 않는다.

## 5. 게임 규칙

### 5.1 조작과 이동

- **땅을 누르면** 주인공이 그 칸으로 걸어간다. 길찾기는 A*(8방향, 모서리를 비스듬히 끊고 지나가지 않음). 누른 칸에 `overlay_cursor`를 0.4초 보여 준다. 갈 수 없는 칸을 누르면 아무 일도 일어나지 않는다.
- **나무, 돌, 적, 텐트를 누르면** 그 대상에 붙은 칸(둘레 8방향) 중 가장 가까운 곳까지 걸어가서 행동한다(베기, 캐기, 공격, 들어가기).
- 지나갈 수 없는 칸: 물, 나무·돌·덤불이 있는 칸, 텐트(네 칸), 모닥불.
- **주인공은 자기 울타리를 넘어 다닐 수 있다.** 좀비와 해적은 넘지 못한다. (문을 만들기 전까지의 임시 규칙이다.)
- 울타리를 누르면 땅을 누른 것과 같다(그 칸으로 간다). 모닥불을 누르면 아무 일도 없다. (치우기를 골랐을 때는 5.4)
- 이동 중이나 행동 중에 다른 곳을 누르면 바로 그쪽으로 바꾼다.
- 카메라는 주인공을 부드럽게 따라간다(확대 1.0 고정). 한 화면에 가로 24칸쯤이 보인다.

### 5.2 도구와 캐기

주인공은 **단검**과 **티셔츠**만 가지고 시작한다. 도구는 대상에 따라 자동으로 골라 쓴다.

| 대상 | 쓰는 도구 | 체력 | 다 캐면 |
|---|---|---|---|
| 나무, 소나무 | 나무 도끼(있으면), 없으면 단검 | 9 | 나무 +4, 그루터기가 됨 |
| 야자수 | 위와 같음 | 9 | 나무 +3, 그루터기가 됨 |
| 돌 | 나무 곡괭이 (**없으면 캘 수 없다**) | 9 | 돌 +1 / +2 / +3 (`obj_rock_s` / `m` / `l`), 돌 부스러기가 됨 |

- `player.actionInterval`(0.55초)마다 한 번 친다. 한 번에 깎는 양: 단검 1, 나무 도끼 3(나무에만), 나무 곡괭이 3(돌에만). 단검으로는 나무 한 그루에 약 5초, 도끼로는 약 1.7초가 걸린다.
- 적과 싸울 때는 단검을 쓴다(5.9).
- 곡괭이 없이 돌을 누르면 "곡괭이가 필요합니다"를 보여 준다.
- 치는 동안 대상 위에 작은 체력 막대를 보여 준다. 캐다가 다른 곳을 누르면 멈추고, 깎인 체력은 그대로 남는다.
- 재료를 얻으면 아이콘과 "+4"가 떠오르고 가방 숫자가 늘어난다.
- 나무와 돌은 다시 생기지 않는다(이번 범위).
- **티셔츠**는 장비 칸에 보이기만 하고 효과가 없다. 나중에 옷을 바꾸면 방어력이 생길 자리다.

### 5.3 만들기

화면 오른쪽 아래의 **만들기** 버튼을 누르면 창이 열린다(`preview_build.png`). 다시 누르면 닫힌다.

| 카드 | 재료 | 종류 | 하는 일 |
|---|---|---|---|
| 나무 도끼 | 나무 3 | 도구 | 나무를 빨리 벤다 |
| 나무 곡괭이 | 나무 3 | 도구 | 돌을 캘 수 있다 |
| 울타리 | 나무 1 | 시설 | 적의 길을 막는다 |
| 모닥불 | 나무 3, 돌 3 | 시설 | 밤에 주변을 밝히고, 가까이 온 좀비를 느리게 한다 |
| 텐트 | 나무 8, 돌 2 | 시설 (1개만) | 들어가서 쉰다(5.6) |
| 치우기 | | | 지은 시설을 없애고 재료의 절반을 돌려받는다 |

- 재료가 모자란 카드는 흐리게 보인다. 누르면 "재료가 부족합니다".
- **도구 카드**를 누르면 바로 만들어진다. 재료가 빠지고, 장비 칸에 아이콘이 생기고, "나무 도끼를 만들었습니다"를 보여 준다. 이미 가진 도구(와 이미 지은 텐트)의 카드는 "보유"로 표시하고 누를 수 없다.
- **시설 카드**를 누르면 짓기 상태가 된다(5.4).

### 5.4 짓기와 치우기

- 짓기 상태에서는 화면 위에 "울타리: 지을 칸을 누르세요"를 띄워 둔다. 포인터가 있는 칸에 `overlay_ok` 또는 `overlay_no`를 보여 준다(마우스는 움직이는 대로, 터치는 손을 대고 있는 동안). 클릭하거나 손을 뗄 때 `overlay_ok`였으면 그 칸에 **바로** 지어진다(주인공이 걸어갈 필요 없음). 재료가 빠지고 `fx_poof`가 뜬다.
- 짓기 상태는 만들기 버튼을 다시 누르거나 다른 카드를 고를 때까지 유지된다(울타리를 연달아 지을 수 있게). 재료가 떨어지면 "재료가 부족합니다"와 함께 풀린다.
- **지을 수 있는 칸**: 땅이고, 나무·돌·덤불·다른 시설이 없고, 캐릭터가 서 있지 않고, 주인공에게서 `build.reach`(7칸) 안. 그루터기와 돌 부스러기 위에는 지을 수 있다.
- **텐트는 2×2칸**이다. 포인터의 소수 칸 좌표 `fc = (x / HW + y / HH) / 2`, `fr = (y / HH - x / HW) / 2`에서 `col = Math.floor(fc)`, `row = Math.floor(fr)`로 잡고 `(col, row)`, `(col+1, row)`, `(col, row+1)`, `(col+1, row+1)` 네 칸을 차지한다. 네 칸 모두에 표시를 보여 주고, 네 칸 모두 지을 수 있어야 한다. 그림은 `tileToWorld(col + 0.5, row + 0.5)`에 놓는다.
- 낮과 밤 모두 지을 수 있다.
- **치우기**: 카드를 고른 뒤 내 시설을 누르면 없어지고 재료의 절반(내림)을 돌려받는다. 울타리는 돌려받는 것이 없다.
- 시설에는 체력이 있다(울타리 6, 모닥불 10, 텐트 24). 깎였을 때만 작은 체력 막대를 보여 준다. 0이 되면 `fx_poof`와 함께 사라진다.

### 5.5 낮과 밤

- 낮 `time.dayLength`(240초) → 밤 `time.nightLength`(150초) → 아침, 반복. 낮의 마지막 `time.duskLength`(40초)는 저녁이다.
- 화면 위 가운데에 해/달 아이콘, "1일째 낮" / "1일째 밤", 진행 막대를 보여 준다.
- **낮에는 적이 나오지 않는다.**
- 저녁이 시작되면 "곧 밤이 됩니다"를 보여 주고 화면색이 변하기 시작한다(3.7).
- 밤이 시작되면 "밤이 되었습니다"를 보여 주고 좀비가 나오기 시작한다(5.8).
- 아침이 되면 5.10.

### 5.6 텐트

- 텐트를 누르면 붙은 칸까지 걸어가서 들어간다. 주인공이 보이지 않게 되고 텐트 그림이 `build_tent_lit`으로 바뀐다. 화면 아래 가운데에 `icon_sleep`과 "쉬는 중 · 누르면 나옵니다" 버튼이 나온다. 버튼이나 텐트를 누르면 들어갔던 칸으로 나온다.
- 텐트 안에 있는 동안:
  - 주인공은 공격받지 않는다. 적은 텐트를 공격한다.
  - `build.tent.healInterval`(8초)마다 하트가 1 찬다.
  - 텐트에서 `build.tent.wakeRange`(6칸) 안에 적이 없으면 **게임 시간이 `build.tent.sleepTimeScale`(4배)로 흐른다.** 적이 들어오면 원래 속도로 돌아온다. 낮에 들어가서 밤까지 시간을 보내는 데도 쓴다.
- 텐트가 공격받기 시작하면 "텐트가 공격받고 있습니다"를 보여 준다(5초에 한 번 이하).
- 텐트 체력이 0이 되면 텐트가 사라지고 주인공은 그 자리 근처의 빈 칸에 나타난다.

### 5.7 모닥불

- 밤에 주변을 밝힌다(3.7).
- `build.campfire.slowRange`(3칸) 안의 **좀비**는 속도가 `build.campfire.slow`(0.5배)가 된다. 해적은 느려지지 않는다.
- 여러 개 지을 수 있다.

### 5.8 좀비

- 밤마다 나온다. N번째 밤의 수 = `wave.base`(4) + `wave.perNight`(2) × (N − 1), 최대 `wave.max`(14). 밤의 처음 60% 동안 같은 간격으로 한 마리씩 나온다.
- 나오는 자리: `map.zombieSpawns` 중 주인공에게서 `zombie.spawnMinDistance`(12칸) 이상 떨어진 곳에서 무작위. 나올 때 `fx_poof`.
- **목표는 주인공이다.** 주인공이 텐트 안에 있으면 텐트가 목표다. 목표에 붙은 칸 중 가장 가까운 곳으로 A*로 걸어간다.
- **내 시설(울타리, 모닥불, 텐트)은 "부수면 지나갈 수 있는 칸"**으로 계산한다(길찾기 비용 `zombie.breakCost` = 8, 보통 칸은 1). 돌아가는 길이 짧으면 돌아가고, 멀면 부수고 지나간다. 다음에 갈 칸이 시설이면 그 앞에 서서 `zombie.structureInterval`(1.5초)마다 피해 1을 준다.
- 자연 사물과 물은 지나가지 못한다. 길은 주인공의 칸이 바뀌었거나 시설이 생기고 없어졌을 때 다시 계산한다(한 마리당 0.5초에 한 번 이하).
- 주인공과 붙은 칸에 오면 때린다. 붙은 뒤 첫 공격은 `zombie.firstHitDelay`(1.5초) 뒤, 그다음부터 `zombie.hitInterval`(2.0초)마다. 한 번에 하트 1.
- 체력 3, 속도 초당 1.2칸(주인공은 3.5칸).
- 아침이 되면 남은 좀비는 모두 `fx_poof`와 함께 사라진다.

### 5.9 싸움과 하트

- **주인공의 공격**: 적을 누르면 붙은 칸으로 가서 `player.actionInterval`(0.55초)마다 단검으로 피해 1을 준다. 가만히 서 있을 때 붙은 칸에 적이 오면 자동으로 공격한다.
- 적은 체력이 깎였을 때만 작은 체력 막대를 보여 준다.
- 하트는 5칸이다. 회복: 텐트 안에서 8초마다 +1, 아침에 +2.
- **하트가 0이 되면** "쓰러졌습니다" 창과 "다시 시작" 버튼을 보여 준다. 누르면 처음부터 다시 시작한다.

### 5.10 아침

- 남은 적이 모두 사라지고, 화면색이 3초에 걸쳐 낮으로 돌아오고, 하트가 2 차고, 남아 있는 시설의 체력이 가득 찬다.
- **첫 밤을 넘긴 아침**에는 결과 창을 보여 준다: "첫 밤을 넘겼습니다", 물리친 적의 수, 남은 울타리 수, 남은 하트, 그리고 "계속하기" / "다시 시작" 버튼. 이 프로토타입의 목표는 여기까지다.
- "계속하기"를 누르면 2일째 낮이 이어진다(밤마다 좀비가 늘어난다). 그 뒤의 아침에는 창 없이 "3일째 아침입니다"만 보여 준다.

### 5.11 할 일 목록

화면 오른쪽 위에 보여 준다. 조건이 되면 체크된다. 순서는 상관없다.

1. 나무 도끼 만들기
2. 나무 곡괭이 만들기
3. 모닥불 피우기
4. 텐트 치기
5. 울타리 8개 세우기
6. 아침까지 버티기

### 5.12 해적 (Phase 6, 선택)

`config.pirate.enabled`가 `true`일 때만 나온다.

- 밤의 35% 시점: 해적선(`obj_ship`)이 `map.pirates.ship` 자리에 2초에 걸쳐 나타난다. "해적선이 나타났습니다". 등불에 빛을 추가한다(3.7).
- 밤의 45% 시점: 보트(`obj_rowboat`)가 `map.pirates.boat`에 나타나고, 해적 2명(`char_pirate_1`, `char_pirate_2`)이 `map.pirates.landing` 칸과 그 옆의 빈 땅 칸에 나타난다. "해적이 상륙했습니다".
- 해적은 좀비와 같은 규칙으로 움직이고 공격한다. 다른 점은 숫자뿐이다: 체력 4, 속도 초당 1.8칸, 공격 간격 1.6초(첫 공격 1.0초 뒤), 시설 공격 간격 1.0초, 모닥불에 느려지지 않음.
- 아침이 되면 해적은 `fx_poof`와 함께 사라지고, 배와 보트는 2초에 걸쳐 사라진다.

## 6. 수치 (src/config.js 초기값)

```js
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
};
```

이 숫자들은 해 보지 않고 정한 시작값이다. 직접 해 보면서 조정한다.

## 7. 화면 UI

`preview_day.png`, `preview_build.png`의 배치를 따른다. 패널은 바탕 `#fbf6ea`(알파 0.92), 테두리 `#4a3d38`(두께 3), 둥근 모서리 22. 아래 위치는 1920×1200 기준이다.

| 위치 | 내용 |
|---|---|
| 왼쪽 위 | 하트 5개(56px). 빈 칸은 `icon_heart_empty` |
| 가운데 위 | 해/달 아이콘, "1일째 낮" 글자(26px), 진행 막대(낮은 노랑 `#f0be54`, 밤은 파랑 `#687ac4`) |
| 오른쪽 위 | "할 일" 목록(23px). 체크된 줄은 흐린 글자색 |
| 왼쪽 아래 | 가방: 나무, 돌 아이콘(72px)과 개수(34px). 그 옆에 장비 칸: 단검, 티셔츠, 만든 도구 아이콘 |
| 오른쪽 아래 | 만들기 버튼(지름 136px의 노란 원 `#f6cf5e`, `icon_craft`, "만들기"). 누르면 그 위로 만들기 창이 열린다 |
| 만들기 창 | 카드 6장(170×196): 아이콘(96px), 이름(24px), 재료 아이콘과 숫자. 고른 카드는 노란 굵은 테두리 |
| 가운데 위쪽(시계 아래) | 알림 글자(28px): 2.5초 떴다가 사라진다. 짓기 상태의 안내는 계속 떠 있다 |

- UI는 별도 씬(UIScene)으로 만든다. 패널과 버튼에 `setInteractive()`를 해 두면 그 위를 누른 것은 아래의 GameScene에 전달되지 않는다(Phaser의 기본 동작이고, 3.90에서 확인했다).
- 처음 시작할 때 알림 세 개를 차례로 보여 준다: "땅을 누르면 이동합니다" → "나무를 누르면 다가가서 벱니다" → "만들기에서 도구와 캠프를 만들 수 있습니다"

## 8. 시험용 도구

할 일 목록 아래에 작은 "시험" 버튼을 둔다. 누르면 아래 버튼이 있는 창이 열린다. 빨리 확인하기 위한 것이다.

- 밤으로 넘기기 / 아침으로 넘기기
- 나무, 돌 +20
- 좀비 1마리 부르기
- 속도 ×1 / ×3

## 9. 개발 순서

### Phase 1 — 섬과 이동

- 프로젝트 틀(`index.html`, `src/`), manifest와 맵을 읽고 그림 불러오기
- 바닥 그림(3.3), 사물 그리기, 깊이 정렬, 가려지면 반투명
- 주인공: 눌러서 이동(A*), 걷는 동작, 좌우 뒤집기. 카메라가 따라감
- 끝날 때 PC에서 실행하는 방법을 설명한다.

확인할 것
- 섬 모양이 `preview_map.png`와 같고, 시작 화면이 `preview_day.png`와 비슷하다(UI 제외).
- 땅을 누르면 나무와 돌을 피해서 걸어간다. 물로는 가지 않는다.
- 나무 뒤로 가면 나무가 반투명해지고, 나무 앞에 서면 주인공이 나무를 가린다.
- 걸어 다니는 동안 바닥에 가는 줄이 보이지 않는다.

### Phase 2 — 캐기와 도구 만들기

- 캐기(5.2), 가방과 장비 UI, 떠오르는 숫자
- 만들기 버튼과 창, 도구 만들기(5.3). 시설 카드는 보이기만 하고 아직 눌리지 않아도 된다
- 할 일 목록(1, 2번), 시작 알림, 시험용 도구(재료 +20)

확인할 것
- 나무를 누르면 다가가서 단검으로 베고, 약 5초 뒤 그루터기가 남으며 나무가 4 늘어난다.
- 돌을 누르면 "곡괭이가 필요합니다"가 나온다.
- 나무 3으로 나무 도끼를 만들면 장비 칸에 생기고, 나무를 훨씬 빨리 벤다(도끼를 휘두르는 그림으로 바뀐다).
- 나무 곡괭이를 만들면 돌을 캘 수 있다.

### Phase 3 — 캠프 짓기

- 짓기 상태, 바닥 표시, 울타리(연결 그림 3.6), 모닥불(불꽃 애니메이션), 텐트(2×2), 치우기(5.4)
- 할 일 목록(3, 4, 5번)

확인할 것
- 만들기 → 울타리 → 땅을 누르면 울타리가 생기고, 이웃한 울타리끼리 가로대가 이어진다.
- 나무 위, 물 위, 주인공에게서 먼 곳에는 빨간 표시가 뜨고 지어지지 않는다.
- 텐트는 네 칸에 표시가 뜨고, 지으면 `preview_build.png`처럼 보인다.
- 주인공은 울타리를 넘어 다닐 수 있다.
- 치우기로 모닥불을 없애면 재료의 절반이 돌아온다.

### Phase 4 — 낮과 밤, 텐트

- 시간 흐름, 시계 UI, 저녁과 밤 알림(5.5)
- 밤의 빛 지도(3.7): 화면색 변화, 모닥불·주인공·텐트의 빛
- 텐트에 들어가기, 쉬는 동안 시간 빨리 흐르기와 하트 회복(5.6)
- 시험용 도구(밤으로/아침으로 넘기기, 속도)

확인할 것
- 저녁이 되면 화면이 노을빛으로, 밤이 되면 푸르게 변하고 모닥불 둘레만 밝다(`preview_night.png`).
- 주인공이 움직이면 주인공 둘레의 옅은 빛도 따라온다.
- 텐트에 들어가면 텐트에 불이 켜지고 시계가 빨리 간다. 버튼을 누르면 나온다.
- 아침이 되면 화면이 다시 밝아지고 "2일째 낮"이 된다.

### Phase 5 — 좀비와 첫 밤

- 좀비 나오기, 길찾기, 시설과 텐트 공격(5.8)
- 주인공의 공격, 하트, 쓰러졌을 때 처리(5.9)
- 모닥불의 느려지는 효과(5.7)
- 아침 처리와 결과 창(5.10), 할 일 목록(6번), 시험용 도구(좀비 부르기)

확인할 것
- 밤이 되면 좀비가 숲 쪽에서 주인공을 향해 걸어온다.
- 울타리로 둘러싸면 좀비가 돌아가거나 울타리를 부순다.
- 좀비를 누르면 주인공이 가서 단검으로 공격하고, 좀비가 사라진다.
- 텐트 안에 있으면 좀비가 텐트를 공격하고, 알림이 뜨며 시간이 원래 속도로 돌아온다.
- 아침까지 버티면 "첫 밤을 넘겼습니다" 창이 나온다. 하트가 0이 되면 "쓰러졌습니다" 창이 나온다.

### Phase 6 — 해적 (선택, 사용자가 원할 때만)

- 5.12. `config.pirate.enabled`를 `true`로 바꾼다.

확인할 것
- 밤중에 섬 왼쪽 아래 바다에 해적선이 나타나고(`preview_map.png`의 해적선 자리), 조금 뒤 해적 2명이 해변에 내려 주인공에게 온다.
- 아침이 되면 해적과 배가 사라진다.

### Phase 7 — 철광석과 철조망 (2단계 시작)

- 2단계 시작(11.1): 결과 창의 "계속하기" 뒤에 2단계 할 일 목록으로 바꾸기
- 철광석 캐기(11.2), 가방에 철광석, 만들기 창 두 줄(11.3)
- 철조망: 짓기, 연결 그림, 지나가는 적이 느려지고 다치기(11.4)
- 할 일(1번, 5번), 시험용 도구(철광석 +20)

확인할 것
- 시작 지점 오른쪽의 붉은 흙 지대에 철광석이 있다(`preview_iron.png`). 곡괭이로 캐면 철광석이 2~3개 늘어난다.
- 곡괭이 없이 철광석을 누르면 "곡괭이가 필요합니다"가 나온다.
- 철조망을 이어서 지으면 철사가 서로 이어진다. 울타리와는 이어지지 않는다.
- 좀비가 철조망 위를 지나가면 느려지고 체력이 깎인다. 주인공은 그냥 지나간다.

### Phase 8 — 망루와 총 타워

- 탑 짓기(받침 + 포탑, 11.10), 지을 때와 지은 탑을 눌렀을 때 사거리 원(11.5)
- 조준(16방향), 쏘기, 화살(포물선)과 총알, 총구 불꽃과 연기, 맞으면 `fx_hit`
- 탑 등불과 쏠 때의 불빛(3.7), 탑 뒤로 가면 반투명, 좀비가 탑을 부수기
- 할 일(3번, 4번)

확인할 것
- `preview_defense_day.png`처럼 탑을 지을 칸 둘레에 사거리 원이 보인다.
- 밤에 좀비가 사거리 안에 들어오면 망루의 쇠뇌가 좀비 쪽으로 돌아가 화살을 쏜다. 총 타워는 쏠 때 총구에 불꽃과 연기가 난다.
- 화살은 살짝 곡선을 그리며 날아가고, 화살 끝이 날아가는 방향을 향한다.
- 탑 뒤로 캐릭터가 지나가면 탑이 반투명해진다. 좀비가 탑에 막히면 탑을 부순다.

### Phase 9 — 총과 총잡이 해적 (Phase 6 다음에)

- 총 만들기와 주인공이 총으로 싸우기(11.6)
- 총잡이 해적(11.7): 해적이 상륙할 때 함께 내려서, 멀리서 겨누고 쏜다
- 할 일(2번, 6번), 시험용 도구(해적 부르기)

확인할 것
- 총을 만들면 장비 칸에 생기고, 적을 누르면 멀리서 총을 쏜다(겨누기 → 쏘기 → 불꽃).
- 총잡이 해적이 멈춰 서서 겨누는 자세를 잠깐 보인 뒤 쏜다. 그 사이에 움직이면 피할 수 있다.
- 밤 화면이 `preview_defense_night.png`처럼 보인다(탑 등불, 화살, 총알, 쏠 때의 불빛).

### Phase 10 — 움직임과 타격감 다듬기 (Phase 5 이후 아무 때나)

- manifest의 `anims`로 애니메이션 만들기(12.1), 앞모습과 뒷모습 고르기(12.2), 캐릭터별 애니메이션(12.3)
- 타격감(12.4), 휘두른 궤적(12.5), 조각 효과(12.6), 자원과 시설의 움직임(12.7), 총과 화살(12.8), 걷기 효과(12.9)
- 아직 만들지 않은 Phase의 것(탑, 총잡이 등)은 그 Phase를 만들 때 12장을 함께 적용한다

확인할 것
- 화면 위쪽으로 걸어가면 뒷모습이 보이고, 다리가 4장으로 부드럽게 움직인다. 멈추면 숨을 쉬듯 살짝 움직이고 가끔 눈을 깜빡인다.
- 나무를 베면 도끼를 들어 올렸다 내리치고 따라 내려가며, 흰 궤적과 나무 조각·잎이 튄다. 다 베면 나무가 넘어가며 먼지가 인다(`preview_motion.gif`).
- 좀비를 때리면 잠깐 멈칫하며 하얗게 번쩍이고 뒤로 밀린다. 쓰러지면 넘어진 뒤 보라색 연기로 사라진다.
- 밤이 되면 좀비가 흙을 튀기며 땅에서 올라온다.
- 태블릿에서도 느려지지 않는다. 느리면 `config.fx.particleCount`를 0.5로 줄인다.

## 10. 이번에 하지 않는 것

나중에 넣을 것(지금은 만들지 않는다. 다만 나중에 넣기 쉽도록 숫자와 종류를 `config.js`에 모아 둔다)

- 배고픔, 농사, 낚시, 사냥, 요리
- 닭과 젖소(계란, 우유), 강아지와 고양이
- 문, 돌로 만드는 도구, 옷과 방어구 등 다음 단계의 장비
- 탑 업그레이드와 수리, 탄약, 철광석 녹이기(용광로)
- 나무와 돌이 다시 생기는 것, 덤불에서 열매 따기
- 섬의 다른 구역, 더 큰 맵

이 프로토타입에서 아예 하지 않는 것

- 저장과 불러오기, 소리와 음악, 제목 화면, 설정 화면, 스토리와 대사
- 새 그림 만들기, 제공된 그림과 맵 수정 (사용자가 따로 요청한 경우는 예외)
- 키보드 조작, 화면 확대·축소
- 이 문서에 없는 시설, 적, 아이템

## 11. 2단계: 철과 방어 시설 (Phase 7~9)

1단계(Phase 1~5, 해적은 Phase 6)를 끝낸 뒤에 진행한다. 1~10장의 규칙은 그대로 두고 아래를 더한다.

### 11.1 흐름

- 첫 밤의 결과 창에서 "계속하기"를 누르면 2단계가 시작된다. 오른쪽 위의 할 일 목록이 아래 목록으로 바뀐다.
  1. 철광석 5개 모으기 (캔 개수를 센다)
  2. 총 만들기
  3. 망루 세우기
  4. 총 타워 세우기
  5. 철조망 6개 깔기
  6. 밤을 넘기기
- 밤마다 좀비가 늘어난다(5.8). 해적을 켰으면(5.12) 총잡이 해적이 함께 온다(11.7).

### 11.2 철광석

- 철광 지대(`terrain` 5)에 있는 `iron` 사물. 나무 곡괭이로 캔다. 곡괭이가 없으면 "곡괭이가 필요합니다".
- 체력 15, 곡괭이로 한 번에 3 → 5번(약 2.8초). `obj_iron_1`은 철광석 2개, `obj_iron_2`는 3개. 다 캐면 `obj_rubble`이 된다.
- 다시 생기지 않는다(섬 전체에 23개).

### 11.3 재료와 만들기 창

- 가방에 철광석(`icon_iron`)이 더해져 세 가지가 된다: 나무, 돌, 철광석.
- 만들기 창은 카드 10장을 두 줄로 보여 준다(카드 150×170, 아이콘 70px, `preview_defense_day.png`).
  - 윗줄: 나무 도끼, 나무 곡괭이, 총, 울타리, 철조망
  - 아랫줄: 모닥불, 텐트, 망루, 총 타워, 치우기
- 새 카드

| 카드 | 재료 | 종류 | 하는 일 |
|---|---|---|---|
| 총 | 철광석 3, 나무 2 | 도구 | 멀리 있는 적을 쏜다(11.6) |
| 철조망 | 철광석 1 | 시설 | 밟고 지나가는 적이 느려지고 다친다(11.4) |
| 망루 | 나무 8, 돌 2 | 시설 | 사거리 안의 적에게 화살을 쏜다(11.5) |
| 총 타워 | 돌 6, 철광석 4 | 시설 | 더 멀리서 더 세게 쏜다(11.5) |

- 치우기는 5.4와 같다(재료의 절반, 내림).

### 11.4 철조망

- 1칸. 울타리처럼 이웃한 철조망끼리 이어진다(3.6과 같은 계산, `build_wire_0~15`). 울타리나 탑과는 이어지지 않는다.
- **길을 막지 않는다.** 누구나 지나갈 수 있다.
- 적(좀비, 해적)이 철조망 칸 위에 있는 동안 속도가 0.4배가 되고, 1초마다 피해 1을 입는다. 철조망은 피해를 줄 때마다 체력이 1 줄고(체력 10), 0이 되면 `fx_poof`와 함께 사라진다.
- 주인공은 느려지지도 다치지도 않는다.
- 좀비와 해적의 길찾기에서 철조망 칸의 비용은 3이다(보통 칸 1). 조금 돌아가서 피할 수 있으면 피한다.

### 11.5 망루와 총 타워

- 1칸짜리 시설. 다른 시설처럼 짓는다(5.4). 짓는 동안 지을 칸 표시와 함께 그 칸을 가운데로 한 **사거리 원**을 보여 준다. 짓기 상태가 아닐 때 지은 탑을 누르면 사거리 원을 2초 보여 준다.
- 지나갈 수 없는 칸이 된다. 좀비와 해적에게는 울타리처럼 "부수면 지나갈 수 있는 칸"이다(5.8).

| | 망루 | 총 타워 |
|---|---|---|
| 사거리 | 5칸 | 6.5칸 |
| 쏘는 간격 | 1.1초 | 1.6초 |
| 피해 | 1 | 3 |
| 날아가는 것 | 화살(포물선, 초당 650px) | 총알(직선, 초당 1400px) |
| 체력 | 14 | 22 |

- 거리는 칸 좌표의 직선 거리 √(Δcol² + Δrow²)로 잰다.
- 목표: 사거리 안의 적 중 탑에서 가장 가까운 적. 그 적이 죽거나 사거리를 벗어날 때까지 바꾸지 않는다. 적이 없으면 마지막 방향을 그대로 둔다.
- 포탑은 매 프레임 목표 쪽으로 방향을 바꾼다(16방향, 11.10).
- 쏠 때
  - 망루: 포탑 프레임을 `shot{방향}`으로 0.25초 보여 준 뒤 `load{방향}`으로 돌아간다. 화살이 `muzzle`에서 날아간다.
  - 총 타워: 총구 불꽃 0.08초, 연기(위로 30px 올라가며 0.6초에 사라짐), 총알, 짧은 빛(3.7). 포탑을 조준 반대쪽으로 3px 밀었다가 0.08초 뒤 되돌리면 반동처럼 보인다.
- 탑이 쏜 화살과 총알은 목표를 따라가서 반드시 맞는다(날아가는 동안 목표 위치를 갱신한다). 목표가 먼저 사라지면 마지막 위치에 떨어져 사라진다. 맞으면 `fx_hit`을 0.15초 보여 준다.
- 시간(쏘는 간격, 겨누는 시간 등)은 모두 씬 시계(`this.time`, update의 delta)로 잰다. 그래야 시험용 속도 ×3과 텐트의 빨리 흐르기에 함께 맞춰진다.

### 11.6 주인공의 총

- 총을 만들면 장비 칸에 `icon_gun`이 생기고, 그때부터 적과는 단검 대신 총으로 싸운다.
- 적을 누르면: 사거리(5칸) 안이면 그 자리에 서서 쏘고, 밖이면 사거리 안까지 걸어간 뒤 쏜다. 가만히 서 있을 때 사거리 안에 적이 있으면 가장 가까운 적을 자동으로 쏜다.
- 쏘는 동작: 적 쪽을 보고 `gun1`(겨누기) 0.25초 → `gun2`(쏘기) 0.15초와 총구 불꽃, 총알 → `idle`. 1.4초마다 한 번. 피해 2. 총알은 반드시 맞는다.
- 나무 베기와 돌·철광석 캐기는 그대로 도끼와 곡괭이로 한다.

### 11.7 총잡이 해적

- `char_pirate_3`. 해적이 상륙할 때(5.12) 선장, 선원과 함께 1명이 내린다.
- 사거리(4.5칸)보다 멀면 다른 해적처럼 주인공 쪽으로 걸어온다. 사거리 안에 들어오면 멈춰 서서 쏜다. 울타리 너머로도 쏠 수 있다(장애물이 총알을 막지 않는다).
- 쏘는 순서: `aim` 0.6초(이때 움직이면 피할 수 있다) → `shoot` 0.2초와 총구 불꽃, 총알 → 처음부터 반복. 한 번 쏘는 데 2.6초.
- 총알은 쏜 순간의 주인공 위치로 곧게 날아간다(초당 900px). 도착했을 때 주인공이 그 점에서 0.6칸 안에 있으면 하트 1을 잃는다. 주인공이 텐트 안에 있으면 텐트를 쏜다(피해 2, 반드시 맞음).
- 체력 3, 속도 초당 1.6칸. 탑과 주인공은 다른 적과 똑같이 총잡이를 공격한다.

### 11.8 화면 UI와 시험용 도구에 더할 것

- 왼쪽 아래 가방: 나무, 돌, 철광석.
- 시험용 도구: "나무, 돌, 철광석 +20", "해적 부르기"(밤에만. 해적선과 해적이 바로 나온다).

### 11.9 수치 (src/config.js에 더한다)

```js
// 6장의 CONFIG 안, 같은 이름의 묶음에 더한다
nodes:  { iron: { hp: 15, give: 'iron', amountBySprite: { obj_iron_1: 2, obj_iron_2: 3 } } },
tools:  { gun: { name: '총', cost: { iron: 3, wood: 2 }, damage: 2, range: 5, interval: 1.4, aimTime: 0.25, bulletSpeed: 1400 } },
build: {
  wire:       { name: '철조망', cost: { iron: 1 }, hp: 10, slow: 0.4, damage: 1, damageInterval: 1.0, pathCost: 3 },
  watchtower: { name: '망루', cost: { wood: 8, stone: 2 }, hp: 14, range: 5, interval: 1.1, damage: 1,
                arrowSpeed: 650, arcRatio: 0.25, arcMax: 60, light: { radius: 120, color: 0xffedc7, alpha: 0.85 } },
  guntower:   { name: '총 타워', cost: { stone: 6, iron: 4 }, hp: 22, range: 6.5, interval: 1.6, damage: 3,
                bulletSpeed: 1400, light: { radius: 120, color: 0xffedc7, alpha: 0.85 } },
},
gunner: { hp: 3, speed: 1.6, range: 4.5, aimTime: 0.6, interval: 2.6, damage: 1, tentDamage: 2, dodgeRadius: 0.6, bulletSpeed: 900 },
pirate: { gunners: 1 },
flashLight: { radius: 110, color: 0xffedc7, alpha: 0.9, time: 0.1 },
todo2:  { iron: 5, wire: 6 },
```

이 숫자들도 해 보지 않고 정한 시작값이다.

### 11.10 그림 쓰는 법 (탑, 포탑, 총, 날아가는 것)

**탑 = 받침 + 포탑 두 장.** 받침(`build_watchtower`, `build_guntower`)은 다른 시설처럼 칸 중심에 놓는다. 포탑(받침의 `turret` 값: `turret_bow`, `turret_gun`)은 받침 기준점에서 `mount`만큼 옮긴 곳에 놓고, depth는 받침 depth + 0.5로 한다.

```js
const base = A.build_watchtower;                                   // manifest.assets
const w = tileToWorld(col, row);
const baseImg = this.add.image(w.x, w.y, 'build_watchtower').setOrigin(base.originX, base.originY).setDepth(10 + w.y);
const tk = base.turret;                                             // 'turret_bow'
const tur = this.add.sprite(w.x + base.mount[0], w.y + base.mount[1], tk, 0)
  .setOrigin(A[tk].originX, A[tk].originY).setDepth(10 + w.y + 0.5);
```

**포탑 방향 번호(0~15).** 탑과 목표의 발 위치(월드 좌표)로 구한다. 화면의 세로를 2배로 펴서 잰 각도를 16등분한다.

```js
const a = Math.atan2((target.y - tower.y) * 2, target.x - tower.x);
const i = ((Math.round(a / (Math.PI * 2 / 16)) % 16) + 16) % 16;
// 0 = 화면 오른쪽, 4 = 화면 아래(보는 사람 쪽), 8 = 왼쪽, 12 = 위. 시계 방향으로 커진다.
tur.setFrame(A[tk].frames.indexOf('load' + i));                    // 총 타워는 'dir' + i, 망루가 쏜 직후는 'shot' + i
```

**화살과 총알이 나가는 곳.** 포탑 위치 + `muzzle[i]`(포탑 그림에 방향별로 16개). `screenAngle[i]`는 그 방향이 화면에서 가리키는 각도(도)로, 총구 불꽃을 돌릴 때 쓴다: `fx_muzzle.setRotation(Phaser.Math.DegToRad(screenAngle[i]))`.

**캐릭터의 총구.** `char_player.muzzle.gun1`, `gun2`와 `char_pirate_3.muzzle.aim`, `shoot`은 발 위치 기준이고 오른쪽을 볼 때의 값이다. 왼쪽을 보면(setFlipX) x의 부호를 바꾸고, 불꽃도 `setFlipX(true)`로 뒤집는다.

**날아가는 것.** `proj_arrow`, `proj_bullet`, `fx_muzzle`은 오른쪽을 향해 그려져 있다. 기준점은 화살의 가운데, 총알의 앞쪽 끝, 불꽃의 총구 쪽 끝이다. 날아가는 방향의 화면 각도로 `setRotation` 한다. 화살은 포물선으로 난다(t = 0→1, 걸리는 시간 = 거리 ÷ 속도).

```js
const h = Math.min(60, dist * 0.25);                                // 포물선 높이(px)
x = x0 + (x1 - x0) * t;
y = y0 + (y1 - y0) * t - h * 4 * t * (1 - t);
rotation = Math.atan2((y1 - y0) - h * 4 * (1 - 2 * t), x1 - x0);   // 화살 끝이 날아가는 쪽을 향한다
```

**사거리 원.** `overlay_range`(512×256, 땅 위의 원 모양)를 탑의 칸 중심에 놓고 `setDisplaySize(113.1 × R, 56.6 × R)` 한다(R = 사거리 칸 수). depth는 바닥 표시와 같은 3.

`tools/reference_map.html?mode=defense`에 위 내용이 모두 들어 있다(포탑이 움직이는 좀비를 따라 돌며 화살과 총알을 쏜다).

## 12. 움직임과 타격감 다듬기 (Phase 10)

게임 규칙(피해, 시간, 수치)은 바꾸지 않고 보이는 것만 자연스럽게 한다. 숫자는 `config.fx`에 둔다(12.10). 3.5, 5장, 11장의 보이는 방법과 다른 곳은 Phase 10부터 12장을 따른다.

### 12.1 애니메이션 만들기

캐릭터와 효과 시트의 `anims`(3.1)를 게임 시작 때 모두 Phaser 애니메이션으로 만든다. 이름은 `그림이름:애니메이션이름`이다(예: `char_player:walk`).

```js
for (const [key, v] of Object.entries(A)) {                         // A = manifest.assets
  for (const [name, a] of Object.entries(v.anims || {})) {
    this.anims.create({
      key: key + ':' + name, repeat: a.loop ? -1 : 0,
      frames: a.frames.map(([f, ms]) => ({ key, frame: v.frames.indexOf(f), duration: ms })),
    });
  }
}
sprite.play('char_player:axe');
```

- Phaser 3.90은 프레임의 `duration`을 그 프레임이 보이는 시간으로 그대로 쓴다(확인함).
- `hit`: 피해를 주는 프레임. 그 프레임이 나오는 순간 피해와 효과를 낸다. 첫 장이 `hit`인 것(총잡이의 shoot)도 있어서 `animationstart`와 `animationupdate`를 둘 다 본다(확인함).

```js
const hitFrame = (key, name) => A[key].frames.indexOf(A[key].anims[name].hit);
function onFrame(anim, frame) {                  // sprite.on('animationstart', onFrame); sprite.on('animationupdate', onFrame);
  const [key, name] = anim.key.split(':');
  if (A[key].anims[name].hit && frame.textureFrame === hitFrame(key, name)) {
    // 피해, 효과(12.4)
  }
}
```

- `swing`: 그 순간 함께 틀 `fx_swing`의 애니메이션 이름(12.5).
- 빨리 감기(시험용 속도, 텐트)는 `this.anims.globalTimeScale`도 함께 바꾼다.

### 12.2 앞모습과 뒷모습

움직이는 방향(또는 때리는 목표 쪽)의 화면 방향 (dx, dy)로 고른다.

- dy < 0(화면 위쪽으로): 뒷모습. 이름 앞에 `b`가 붙은 애니메이션을 쓴다(`bwalk`, `bidle`, `baxe`, `battack` 등).
- 그 밖: 앞모습.
- dx < 0: `setFlipX(true)`. 위아래로만 움직일 때(|dx|가 아주 작을 때)는 직전의 좌우를 그대로 둔다.
- 뒷모습이 없는 동작(맞기, 쓰러지기, 올라오기, 총잡이의 겨누기·쏘기·장전)은 앞모습을 쓴다.

### 12.3 캐릭터별 애니메이션

| 그림 | 애니메이션 |
|---|---|
| `char_player` | idle, bidle(숨쉬기, 반복), walk, bwalk(반복), blink, dagger, axe, pick, gun과 b가 붙은 것, hurt, down |
| `char_zombie` | idle, walk, bwalk, attack, battack, hurt, die, rise |
| `char_pirate_1`, `char_pirate_2` | idle, walk, bwalk, attack, battack, hurt, die |
| `char_pirate_3` | idle, walk, bwalk, aim, shoot, reload, hurt, die |

- 서 있을 때는 idle을 반복한다. 주인공은 3~5초에 한 번 blink(0.12초)를 보여 주고 idle로 돌아간다.
- 걸을 때는 walk를 반복하고, 멈추면 바로 idle로 바꾼다.
- 도구 쓰기는 3장이다(들어 올림 → 내리침 → 따라 내려감). 피해는 `hit` 프레임에 준다. 한 번 휘두르는 시간이 `player.actionInterval`(0.55초)보다 짧아서, 남는 시간에는 idle을 보여 준다.
- 좀비와 해적의 공격도 `attack`의 `hit` 프레임에 피해를 준다.
- 총잡이: aim → shoot → reload를 되풀이한다. 11.7의 시간과 맞는다(겨누기 0.6초 + 쏘기 0.2초 + 장전 1.6초 + 쉼 0.2초 = 2.6초).
- 맞을 때: hurt(주인공 0.22초, 적 0.2초) 뒤에 하던 애니메이션으로 돌아간다.
- 쓰러질 때: die(마지막 장에서 0.7초 머문다) → 0.4초에 걸쳐 흐려지며 좀비는 `fx_vanish`, 해적은 `fx_dust`.
- 좀비가 나올 때: 5.8의 `fx_poof` 대신 rise(땅에서 올라옴)와 흙 조각. rise 동안은 움직이지도 공격받지도 않는다.
- 주인공이 쓰러질 때: down을 보여 주고 1초 뒤에 "쓰러졌습니다" 창을 띄운다.

### 12.4 타격감(맞힐 때)

`hit` 프레임에서 아래를 한꺼번에 한다.

1. 피해를 주고, 맞은 곳에 `fx_hit` 대신 `fx_impact`를 튼다. 맞은 곳 = 캐릭터는 발에서 40px 위, 나무·돌·시설은 기준점에서 30px 위. 때린 쪽에는 `fx_swing`(12.5).
2. 맞은 쪽: hurt 프레임, 0.06초 하얗게(`setTintFill(0xffffff)` → `clearTint()`), 때린 쪽 반대로 6px 밀림(0.12초).
3. 멈칫(히트 스톱): 때린 쪽과 맞은 쪽의 애니메이션만 0.05초 멈췄다가 다시 튼다(`anims.pause()` → `anims.resume()`). 게임 전체를 멈추지는 않는다.
4. 조각 효과(12.6).
5. 주인공이 맞았을 때만 카메라를 살짝 흔든다: `cam.shake(120, 0.004)`.

### 12.5 휘두른 궤적 `fx_swing`

- 기준점이 캐릭터의 발이다. 캐릭터와 같은 자리에 놓고 같은 `setFlipX`를 준다.
- 애니메이션: swing(단검), heavy(도끼, 곡괭이, 해적 칼), bswing, bheavy(뒷모습). 도구 `anims`의 `swing` 값을 쓴다.
- 앞모습 궤적의 depth = 캐릭터 + 0.5, 뒷모습 궤적은 캐릭터 − 0.5(캐릭터 뒤).

### 12.6 조각 효과 `fx_particles`

프레임 이름: wood1, wood2, leaf1, leaf2, leaf3, stone1, stone2, iron, spark, ember, goo, dirt, dust, heart. Phaser 파티클로 흩뿌린다. 개수는 아래 표의 수 × `config.fx.particleCount`(반올림, 최소 1).

```js
const P = A.fx_particles, idx = (n) => P.frames.indexOf(n);
const chips = this.add.particles(0, 0, 'fx_particles', {
  frame: ['wood1', 'wood2', 'leaf1'].map(idx), emitting: false, lifespan: 600, speed: { min: 90, max: 220 },
  angle: { min: 200, max: 340 }, gravityY: 650, rotate: { min: 0, max: 360 }, alpha: { start: 1, end: 0 },
  scale: { min: 0.8, max: 1.2 } }).setDepth(50000);
chips.explode(5, x, y);                                              // x, y = 맞은 곳
```

| 언제 | 조각 |
|---|---|
| 나무를 칠 때 | wood1, wood2 3개 + 잎 2개(leaf1, leaf2. 단풍나무 `obj_tree_w1`은 leaf3) |
| 나무가 넘어갈 때 | 잎 8개(천천히: speed 40~140, gravityY 250) |
| 돌을 칠 때 | stone1, stone2 3개 + dust 1개 |
| 돌이 부서질 때 | stone 6개 |
| 철광석을 칠 때 | iron 2개 + spark 3개 |
| 적이 맞을 때 | goo 3개 |
| 좀비가 올라올 때 | dirt 6개 + dust 2개 |
| 시설을 지을 때 | dust 4개 |
| 시설이 부서질 때 | 나무 시설은 wood 6개, 총 타워는 stone 6개 |
| 하트가 찰 때(텐트, 아침) | heart 2개(위로 천천히: angle 250~290, speed 40~70, gravityY −20) |
| 모닥불(밤에만) | ember를 0.3초마다 1개(angle 255~285, speed 30~60, gravityY −15, lifespan 1200) |

### 12.7 자원과 시설의 움직임

- 나무를 칠 때마다 나무 그림을 좌우로 3px 흔든다(0.16초).
- 나무를 다 베면: 나무를 기준점(발)을 축으로 주인공 반대쪽으로 0.5초에 80° 넘어뜨리고(origin이 발이라 `setRotation`이 그대로 맞는다), 0.3초 뒤부터 흐려지게 한다. 넘어간 끝(기준점에서 넘어간 쪽으로 60px)에 `fx_dust`와 잎 조각. 그루터기는 바로 나타난다.
- 돌, 철광석을 다 캐면: 바로 `obj_rubble`로 바꾸고 `fx_dust`와 조각.
- 시설을 지을 때: 크기를 0.8 → 1.06 → 1.0으로 0.25초에(튀어나오듯), `fx_dust`(0.6배)와 `fx_sparkle`.
- 시설이 부서질 때: 5.4의 `fx_poof` 대신 조각(12.6)과 `fx_dust`.

### 12.8 총과 화살

- 총을 쏠 때: `fx_muzzle`(0.07초) 뒤에 총구에서 `fx_smoke_puff`를 튼다(11.5의 `fx_smoke` 대신).
- 탑이 쏜 화살이 목표를 잃으면(목표가 먼저 사라지면) 떨어진 곳에 `proj_arrow_stuck`을 남기고, 2초 뒤 0.5초에 걸쳐 없앤다. 화살이 왼쪽으로 날아가고 있었으면 `setFlipX(true)`.
- 총알이 목표를 잃으면 떨어진 곳에 `fx_dust`(0.4배).

### 12.9 걷기 효과

- 걸을 때 디딤 프레임(walk1, walk2, bwalk1, bwalk2)이 나올 때마다 뒷발 쪽(발에서 뒤로 8px)에 `fx_dust`를 0.4배로 튼다.
- 모래(terrain 1) 위에서는 디딜 때 `fx_footprint`를 땅에 남긴다(depth 2, 3초 뒤 1초에 걸쳐 사라짐, 한 번에 최대 20개). 걷는 방향이 왼쪽이면 `setFlipX(true)`.
- 해적이 상륙할 때: 상륙 칸에서 배 쪽으로 30px 떨어진 물가에 `fx_splash`.

### 12.10 수치 (src/config.js에 더한다)

```js
fx: {
  hitStop: 0.05, flash: 0.06, knockback: 6, knockbackTime: 0.12, cameraShake: { duration: 120, intensity: 0.004 },
  treeShake: 3, treeFall: { angle: 80, time: 0.5, fadeAfter: 0.3 }, buildPop: { from: 0.8, over: 1.06, time: 0.25 },
  blinkEvery: [3, 5], stepDustScale: 0.4, footprintLife: 3, footprintMax: 20, arrowStuckLife: 2,
  particles: { lifespan: 600, speed: [90, 220], gravityY: 650 },
  particleCount: 1,        // 조각 수 배율. 태블릿에서 느리면 0.5
},
```
