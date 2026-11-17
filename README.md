# 섬 생존 프로토타입 — 시작하는 법

수채화 그림책 풍의 쿼터뷰 생존 게임을 만들기 위한 묶음이다.

- **1단계 (Phase 1~6)**: 단검과 티셔츠로 시작해서 나무 도끼, 나무 곡괭이를 만들고, 울타리·모닥불·텐트를 지어 첫 밤을 넘긴다.
- **2단계 (Phase 7~9)**: 철광석을 캐서 총과 철조망을 만들고, 화살을 쏘는 망루와 총을 쏘는 총 타워로 밤을 막는다. 멀리서 총을 쏘는 해적도 나온다.
- **다듬기 (Phase 10)**: 걷기, 휘두르기, 맞기, 쓰러지기를 자연스럽게 하고 타격 효과(궤적, 번쩍임, 나무 조각, 먼지 등)를 붙인다. Phase 5 이후 아무 때나.

## 들어 있는 것

| 파일/폴더 | 내용 |
|---|---|
| `DEMO_SPEC.md` | Claude Code가 읽고 만드는 지시문 (2단계는 11장, 다듬기는 12장) |
| `CLAUDE.md` | Claude Code가 매번 자동으로 읽는 작업 규칙 |
| `assets/` | 그림 109장, 바닥 그림 15조각, 목록(`manifest.json`, 애니메이션 순서와 시간 포함) |
| `data/map.json` | 섬 맵(64×64칸, 동쪽에 철광 지대) |
| `preview/` | 완성 모습 미리보기. 1단계 4장, 2단계 3장(`preview_iron`, `preview_defense_day`, `preview_defense_night`), 움직이는 미리보기(`preview_motion.gif`), 그림 모음 |
| `lib/phaser.min.js` | 게임 엔진 Phaser 3.90.0 (MIT 라이선스) |
| `tools/` | 그림과 맵을 다시 만드는 스크립트, 확인용 페이지(선택 사항) |

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

## 이미 Claude Code로 작업을 시작했다면 (이번 업데이트 적용)

지금까지 만든 게임 코드(`index.html`, `src/`, `PROGRESS.md`)는 그대로 두고, 아래만 새 것으로 덮어쓴다.

- `assets/`, `data/`, `preview/`, `tools/` 폴더
- `DEMO_SPEC.md`, `CLAUDE.md`, `README.md`

이번 업데이트(움직임과 타격감)에서 바뀐 것

- 캐릭터 시트 5장(`char_player`, `char_zombie`, `char_pirate_1~3`)을 다시 그렸다. 프레임이 늘어서(걷기 4장, 뒷모습, 맞기, 쓰러지기 등) 시트 크기, 프레임 크기, 기준점이 바뀌었다. 예전 프레임의 이름과 번호는 그대로다(새 프레임은 뒤에 붙였다). manifest 값을 읽어 쓰고 있다면 고칠 것이 없다.
- 효과 그림 10개가 새로 생겼다(휘두른 궤적, 맞은 곳, 먼지, 조각, 발자국 등).
- 맵과 다른 그림은 그대로다. (2단계 업데이트를 아직 받지 않았다면 맵 동쪽에 철광 지대와 철광석이 생기고 바닥 그림이 바뀐다.)

덮어쓴 뒤 Claude Code에게 이렇게 말한다.

```
DEMO_SPEC.md가 바뀌었어. 3장과 12장을 읽고, 지금까지 만든 것이 새 캐릭터 그림에서 문제없이 도는지 확인해줘. 기능은 아직 더하지 마.
```

문제없으면 원할 때 `Phase 10 진행해줘`라고 한다.

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
```

`mode=defense`에서는 망루와 총 타워가 캠프 둘레를 도는 좀비를 따라 돌며 화살과 총알을 쏜다. `mode=motion`에서는 캐릭터의 애니메이션 전부와 효과, 조각이 엔진에서 실제로 움직인다.

## 그림이나 맵을 바꾸고 싶을 때 (선택)

`tools/` 스크립트는 파이썬과 아래 꾸러미가 있어야 돈다.

```
pip install cairosvg pillow numpy scipy
python tools/make_map.py         맵 다시 만들기 (data/map.json)
python tools/make_ground.py      바닥 그림 다시 그리기 (맵을 바꿨으면 꼭)
python tools/make_assets.py      사물, 캐릭터, 탑, 아이콘 다시 만들기
python tools/render_preview.py   미리보기 다시 만들기
python tools/render_motion.py    움직이는 미리보기(preview_motion.gif) 다시 만들기
python tools/contact_sheet.py    그림 모음 한 장 다시 만들기
python tools/check_bundle.py     그림, 맵, 지시문이 서로 맞는지 점검
```

그림의 모양은 `tools/artlib.py`, 수채화 느낌(번짐, 연필선, 색)은 `tools/wc.py`에서 정한다. 캐릭터는 자세(팔, 다리, 몸 기울기)를 숫자로 정해 그리고(`artlib.py`의 `pose`, `figure`), 애니메이션의 프레임 순서와 시간은 `tools/make_assets.py`의 `PLAYER_ANIMS` 등에 있다. 망루의 쇠뇌와 총 타워의 총은 간단한 3D 모양을 16방향으로 돌려 그린 것이라(`artlib.py`의 `crossbow`, `swivel_gun`), 모양을 고치면 16방향이 함께 바뀐다.
