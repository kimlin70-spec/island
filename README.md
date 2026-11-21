# 섬 생존 프로토타입 — 시작하는 법

수채화 그림책 풍의 쿼터뷰 생존 게임을 만들기 위한 묶음이다.

- **1단계 (Phase 1~6)**: 단검과 티셔츠로 시작해서 나무 도끼, 나무 곡괭이를 만들고, 울타리·모닥불·텐트를 지어 첫 밤을 넘긴다.
- **2단계 (Phase 7~9)**: 철광석을 캐서 총과 철조망을 만들고, 화살을 쏘는 망루와 총을 쏘는 총 타워로 밤을 막는다. 멀리서 총을 쏘는 해적도 나온다.
- **다듬기 (Phase 10)**: 걷기, 휘두르기, 맞기, 쓰러지기를 자연스럽게 하고 타격 효과(궤적, 번쩍임, 나무 조각, 먼지 등)를 붙인다. Phase 5 이후 아무 때나.
- **3단계 (Phase 11~13)**: 울타리에 문을 달고, 밭을 갈아 당근·옥수수·호박을 기르고, 강아지와 고양이를 친구로 삼는다.
- **날씨 (Phase 14)**: 비와 눈. 비가 오면 밭에 물이 차고, 눈이 오면 땅이 하얗게 덮인다.
- **효과음 (Phase 15)**: 타격음, 밤과 아침 소리, 농사·동물·날씨 소리 44개. Phase 5 이후 아무 때나.
- **배고픔 (Phase 16)**: 배부름(밥그릇 5개)이 천천히 줄고, 덤불 열매와 작물을 먹어 채운다. 설정에서 끌 수 있다.
- **지하 생활 (Phase 17~18)**: 굴 입구를 짓고 땅속으로 내려가 곡괭이로 한 칸씩 파서 방을 넓힌다. 철과 버섯 포자를 얻고, 침대·벽난로·등불·버섯 화분 같은 가구를 놓고 산다. 그동안에도 땅 위의 시간은 흐른다.
- **해적의 지하 침입 (Phase 19)**: 주인공이 지하에 있는 밤에는 해적이 굴 입구 뚜껑을 부수고 사다리로 한 명씩 내려와 쫓아온다. 허리에 등불을 달고 온다.

## 들어 있는 것

| 파일/폴더 | 내용 |
|---|---|
| `DEMO_SPEC.md` | Claude Code가 읽고 만드는 지시문 (2단계는 11장, 다듬기는 12장, 3단계는 13장, 날씨는 14장, 효과음은 15장, 배고픔은 16장, 지하 생활은 17장, 해적의 지하 침입은 18장) |
| `CLAUDE.md` | Claude Code가 매번 자동으로 읽는 작업 규칙 |
| `assets/` | 그림 190장(지하 조각은 `assets/underground`), 바닥 그림 15조각과 눈 덮인 바닥 15조각, 효과음 50개(`assets/sfx`), 목록(`manifest.json`, 애니메이션 순서와 시간, 효과음 목록 포함) |
| `data/map.json` | 섬 맵(64×64칸, 동쪽에 철광 지대, 바닷가의 씨앗 상자와 동물 자리)과 지하 1층(28×28칸, 처음 방, 철과 버섯 칸, 막힌 구멍) |
| `preview/` | 완성 모습 미리보기. 1단계 4장, 2단계 3장(`preview_iron`, `preview_defense_day`, `preview_defense_night`), 3단계와 날씨 3장(`preview_farm`, `preview_rain`, `preview_snow`), 지하 1장(`preview_underground`), 해적의 지하 침입 2장(`preview_raid_surface`, `preview_raid_underground`), 움직이는 미리보기 4개(`preview_motion.gif`, `preview_farm.gif`, `preview_underground.gif`, `preview_raid.gif`), 그림 모음 |
| `lib/phaser.min.js` | 게임 엔진 Phaser 3.90.0 (MIT 라이선스) |
| `tools/` | 그림, 맵, 효과음을 다시 만드는 스크립트, 확인용 페이지, 효과음 들어 보기(`sound_test.html`) |

## 처음 시작하기

1. 이 폴더를 통째로 새 프로젝트 폴더로 쓴다.
2. 이 폴더에서 Claude Code를 연다.
3. 아래 문장을 입력한다.

```
DEMO_SPEC.md를 읽고 Phase 1만 진행해줘. 끝나면 실행 방법과 내가 확인할 것을 알려줘.
```

4. 확인이 끝나면 `다음 Phase 진행해줘`라고 입력한다. Phase 5까지 하면 첫 밤까지 해 볼 수 있다. Phase 6(해적)은 원할 때만 한다.
5. 2단계는 1단계가 끝난 뒤 `Phase 7 진행해줘`로 시작한다. Phase 9(총잡이 해적)는 Phase 6 다음에 한다.
6. 움직임과 타격감은 Phase 5가 끝난 뒤 아무 때나 `Phase 10 진행해줘`로 한다. 2단계 중이어도 된다.
7. 3단계(문, 농사, 동물)는 1단계가 끝난 뒤 `Phase 11 진행해줘`로 시작한다. 2단계와 순서는 상관없다. 날씨는 `Phase 14 진행해줘`.
8. 효과음은 Phase 5가 끝난 뒤 아무 때나 `Phase 15 진행해줘`로 한다.
9. 배고픔은 Phase 5가 끝난 뒤 아무 때나 `Phase 16 진행해줘`로 한다. 농사(Phase 12)와 함께 하면 좋다.
10. 지하 생활은 1단계가 끝난 뒤 원할 때 `Phase 17 진행해줘`(굴 입구와 파기) → `Phase 18 진행해줘`(가구, 침대, 버섯)로 한다.
11. 해적의 지하 침입은 해적(Phase 6)과 지하(Phase 17)를 한 뒤 `Phase 19 진행해줘`로 한다.

## 이미 Claude Code로 작업을 시작했다면 (이번 업데이트 적용)

지금까지 만든 게임 코드(`index.html`, `src/`, `PROGRESS.md`)는 그대로 두고, 아래만 새 것으로 덮어쓴다.

- `assets/`, `data/`, `preview/`, `tools/` 폴더
- `DEMO_SPEC.md`, `CLAUDE.md`, `README.md`

이번 업데이트(해적의 지하 침입)에서 바뀐 것

- 해적 세 명의 시트(`char_pirate_1~3`)에 사다리 오르내리기 2장(`climb1`, `climb2`)이 뒤에 붙고, 허리 등불 자리(`lantern`)가 manifest에 더해졌다. 예전 프레임의 번호는 그대로다.
- 굴 입구(`build_burrow`)에 금 간 모습(`damaged`)과 부서진 모습(`broken`)이 뒤에 붙었다.
- 그림 2개가 새로 생겼다: 해적의 허리 등불(`fx_pirate_lantern`, 일렁이는 3장), 해적 알림 아이콘(`icon_pirate`).
- 효과음 3개(`hatch_knock`, `hatch_break`, `pirate_shout`)가 더해져 50개가 되었다.
- 지시문에 18장과 Phase 19가 더해졌다. 17.2의 굴 입구 규칙에 해적 이야기가 한 줄씩 붙었다.
- 지하 생활 업데이트를 아직 덮어쓰지 않았다면 그 내용도 함께 들어온다(아래).

그 전 업데이트(지하 생활)에서 바뀐 것

- 그림 43개가 새로 생겼다: 지하 칸 조각 15개(`assets/underground`: 바닥 3, 벽 8, 단면 2, 윗면, 기둥), 사다리, 막힌 구멍, 햇빛 기둥, 굴 입구, 가구 8개(침대, 벽난로, 등불, 버섯 화분, 탁자, 의자, 깔개, 보관 상자), 파기 표시 2개, 아이콘 14개.
- 주인공 시트(`char_player`)에 사다리 오르기 2장과 앉기 1장이 뒤에 붙어 시트가 한 줄 늘었다(높이 630 → 756). 프레임 크기와 기준점, 예전 프레임의 번호는 그대로다.
- 맵에 `underground`(지하 1층)가 더해졌다. 섬은 그대로다.
- 효과음 3개(`dig_dirt`, `ladder`, `amb_underground`)가 더해져 47개가 되었다. 예전 소리는 그대로다.
- 지시문에 17장과 Phase 17, 18이 더해졌다. 배고픔(16장)의 먹을 것에 버섯이 더해졌다.

그 전 업데이트(문, 농사, 동물, 날씨, 효과음)에서 바뀐 것

- 그림 36개가 새로 생겼다(문, 밭과 작물, 씨앗 상자, 강아지와 고양이, 농사 효과, 비와 눈, 아이콘). 바닥 그림에 눈 덮인 조각 15장이 더해졌다(보통 바닥은 그대로).
- 주인공 시트(`char_player`)에 농사 동작 13장(괭이질, 물 주기, 쪼그려 앉기, 먹기)이 뒤에 붙어 시트가 한 줄 늘었다. 프레임 크기와 기준점, 예전 프레임의 번호는 그대로다.
- 맵에 씨앗 상자 자리(`seedCrate`)와 동물 자리(`pets`)가 더해졌다. 나무, 돌, 좀비 자리 등 다른 것은 그대로다.
- 효과음 44개가 `assets/sfx`에 생기고, `manifest.json` 맨 위에 `sounds` 목록이 더해졌다.
- 배고픔용 그림 5개(밥그릇, 빈 밥그릇, 열매, 열매를 딴 덤불 2개)가 생겼다.
- 앞의 업데이트(2단계, 움직임과 타격감)를 아직 받지 않았다면 그 내용도 함께 들어온다(캐릭터 시트를 다시 그렸고, 맵 동쪽에 철광 지대가 있다).

덮어쓴 뒤 Claude Code에게 이렇게 말한다.

```
DEMO_SPEC.md가 바뀌었어. 0장과 17~18장을 읽고, 지금까지 만든 것이 새 그림과 맵에서 문제없이 도는지 확인해줘. 기능은 아직 더하지 마.
```

문제없으면 원할 때 `Phase 17 진행해줘`(굴 입구와 파기)라고 한다. 해적의 지하 침입은 Phase 17 다음에 `Phase 19 진행해줘`. 아직 안 한 Phase(문, 농사, 효과음, 배고픔 등)가 있으면 그것부터 해도 된다.

## 숫자를 바꾸고 싶을 때

너무 쉽거나 어려우면 Claude Code에게 이렇게 말한다.

```
config.js에서 낮 길이를 180초로, 망루 사거리를 6칸으로 바꿔줘.
```

재료 값, 도구와 탑의 세기, 시설 체력, 좀비와 해적의 수와 속도가 모두 `src/config.js` 한 곳에 모인다(`DEMO_SPEC.md` 6장, 11.9).

## 지도와 그림만 먼저 보고 싶을 때

이 폴더에서 `python -m http.server 8000`을 실행하고 브라우저에서 아래 주소를 연다. 게임이 아니라 그림이 엔진에서 어떻게 보이는지 확인하는 페이지다.

```
http://localhost:8000/tools/reference_map.html?mode=day
http://localhost:8000/tools/reference_map.html?mode=night
http://localhost:8000/tools/reference_map.html?mode=full
http://localhost:8000/tools/reference_map.html?mode=defense
http://localhost:8000/tools/reference_map.html?mode=motion
http://localhost:8000/tools/reference_map.html?mode=farm
http://localhost:8000/tools/reference_map.html?mode=farm&weather=rain
http://localhost:8000/tools/reference_map.html?mode=farm&weather=snow
http://localhost:8000/tools/reference_map.html?mode=underground
http://localhost:8000/tools/reference_map.html?mode=underground&raid=1
http://localhost:8000/tools/sound_test.html
```

`mode=defense`에서는 망루와 총 타워가 캠프 둘레를 도는 좀비를 따라 돌며 화살과 총알을 쏜다. `mode=motion`에서는 캐릭터의 애니메이션 전부와 효과, 조각이 엔진에서 실제로 움직인다. `mode=farm`에서는 주인공이 문을 지나 밭까지 오가고(문이 열리고 닫힘), `weather=rain`, `snow`를 붙이면 비와 눈이 온다. 화면을 누르면 효과음을 차례로 들려준다. `mode=underground`에서는 지하 처음 방이 나오고, 벽이나 앞쪽 어둠을 누르면 곡괭이로 파서 칸이 열린다. 사다리를 누르면 오르는 모습을 보여 준다. `raid=1`을 붙이면 밤에 해적이 굴 입구를 부수고 사다리로 내려와 등불을 켜고 다가온다. `sound_test.html`에서는 효과음을 하나씩 골라 들을 수 있다.

## 그림이나 맵을 바꾸고 싶을 때 (선택)

`tools/` 스크립트는 파이썬과 아래 꾸러미가 있어야 돈다.

```
pip install cairosvg pillow numpy scipy
python tools/make_map.py         맵 다시 만들기 (data/map.json)
python tools/make_ground.py      바닥 그림 다시 그리기 (맵을 바꿨으면 꼭)
python tools/make_assets.py      사물, 캐릭터, 탑, 아이콘 다시 만들기
python tools/render_preview.py   미리보기 다시 만들기
python tools/render_motion.py    움직이는 미리보기(preview_motion.gif) 다시 만들기
python tools/render_farm.py      3단계와 날씨 미리보기(preview_farm, preview_rain, preview_snow, preview_farm.gif)
python tools/render_underground.py  지하 미리보기(preview_underground.png, preview_underground.gif)
python tools/render_raid.py      해적의 지하 침입 미리보기(preview_raid_surface, preview_raid_underground, preview_raid.gif)
python tools/make_sounds.py      효과음 다시 만들기(assets/sfx)
python tools/contact_sheet.py    그림 모음 한 장 다시 만들기
python tools/check_bundle.py     그림, 맵, 지시문이 서로 맞는지 점검
```

그림의 모양은 `tools/artlib.py`, 수채화 느낌(번짐, 연필선, 색)은 `tools/wc.py`에서 정한다. 캐릭터는 자세(팔, 다리, 몸 기울기)를 숫자로 정해 그리고(`artlib.py`의 `pose`, `figure`), 애니메이션의 프레임 순서와 시간은 `tools/make_assets.py`의 `PLAYER_ANIMS` 등에 있다. 망루의 쇠뇌와 총 타워의 총은 간단한 3D 모양을 16방향으로 돌려 그린 것이라(`artlib.py`의 `crossbow`, `swivel_gun`), 모양을 고치면 16방향이 함께 바뀐다.

지하 조각(바닥, 벽, 단면)은 옆 칸과 이어 붙어야 해서 `wc.py`의 `tile_sprite`로 굽는다(가장자리 번짐과 연필 테두리 없이 도형 경계 그대로 자른다). 벽을 어떤 칸에 어떤 그림으로 세우는지는 `tools/render_underground.py`의 `ug_plan`이 게임과 같은 규칙으로 보여 준다.
