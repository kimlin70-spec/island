# 섬 생존 프로토타입 — 시작하는 법

수채화 그림책 풍의 쿼터뷰 생존 게임 초반부를 만들기 위한 묶음이다. 단검과 티셔츠로 시작해서 첫 밤을 넘기는 데까지를 다룬다.

## 들어 있는 것

| 파일/폴더 | 내용 |
|---|---|
| `DEMO_SPEC.md` | Claude Code가 읽고 만드는 지시문 |
| `CLAUDE.md` | Claude Code가 매번 자동으로 읽는 작업 규칙 |
| `assets/` | 그림 66장, 바닥 그림 15조각, 목록(`manifest.json`) |
| `data/map.json` | 섬 맵(64×64칸) |
| `preview/` | 완성 모습 미리보기(섬 전체, 시작 화면, 캠프 짓기, 첫 밤, 그림 모음) |
| `lib/phaser.min.js` | 게임 엔진 Phaser 3.90.0 (MIT 라이선스) |
| `tools/` | 그림과 맵을 다시 만드는 스크립트, 확인용 페이지(선택 사항) |

## 시작하기

1. 이 폴더를 통째로 새 프로젝트 폴더로 쓴다.
2. 이 폴더에서 Claude Code를 연다.
3. 아래 문장을 입력한다.

```
DEMO_SPEC.md를 읽고 Phase 1만 진행해줘. 끝나면 실행 방법과 내가 확인할 것을 알려줘.
```

4. 확인이 끝나면 `다음 Phase 진행해줘`라고 입력한다. Phase 5까지 하면 첫 밤까지 해 볼 수 있다. Phase 6(해적)은 원할 때만 한다.

## 숫자를 바꾸고 싶을 때

너무 쉽거나 어려우면 Claude Code에게 이렇게 말한다.

```
config.js에서 낮 길이를 180초로, 첫 밤 좀비를 6마리로 바꿔줘.
```

재료 값, 도구의 세기, 시설 체력, 좀비 수와 속도가 모두 `src/config.js` 한 곳에 모인다(`DEMO_SPEC.md` 6장).

## 지도와 그림만 먼저 보고 싶을 때

이 폴더에서 `python -m http.server 8000`을 실행하고 브라우저에서 아래 주소를 연다. 게임이 아니라 그림이 엔진에서 어떻게 보이는지 확인하는 페이지다.

```
http://localhost:8000/tools/reference_map.html?mode=day
http://localhost:8000/tools/reference_map.html?mode=night
http://localhost:8000/tools/reference_map.html?mode=full
```

## 그림이나 맵을 바꾸고 싶을 때 (선택)

`tools/` 스크립트는 파이썬과 아래 꾸러미가 있어야 돈다.

```
pip install cairosvg pillow numpy scipy
python tools/make_map.py         맵 다시 만들기 (data/map.json)
python tools/make_ground.py      바닥 그림 다시 그리기 (맵을 바꿨으면 꼭)
python tools/make_assets.py      사물, 캐릭터, 아이콘 다시 만들기
python tools/render_preview.py   미리보기 다시 만들기
python tools/contact_sheet.py    그림 모음 한 장 다시 만들기
python tools/check_bundle.py     그림, 맵, 지시문이 서로 맞는지 점검
```

그림의 모양은 `tools/artlib.py`, 수채화 느낌(번짐, 연필선, 색)은 `tools/wc.py`에서 정한다.
