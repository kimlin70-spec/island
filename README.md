# 섬 생존 데모 — 시작하는 법

## 들어 있는 것

| 파일/폴더 | 내용 |
|---|---|
| `DEMO_SPEC.md` | Claude Code가 읽고 만드는 지시문 |
| `CLAUDE.md` | Claude Code가 매번 자동으로 읽는 작업 규칙 |
| `assets/` | 그림 61장과 목록(`manifest.json`) |
| `data/map_demo.json` | 데모 맵(40×40칸, 3개 구역) |
| `preview/` | 완성 모습 미리보기(섬 전체, 낮 화면, 밤 화면, 그림 모음) |
| `lib/phaser.min.js` | 게임 엔진 Phaser 3.90.0 (MIT 라이선스) |
| `tools/` | 그림과 맵을 다시 만드는 스크립트, 지도 확인용 페이지(선택 사항) |

## 시작하기

1. 이 폴더를 통째로 프로젝트 폴더로 쓴다.
2. 이 폴더에서 Claude Code를 연다.
3. 아래 문장을 입력한다.

```
DEMO_SPEC.md를 읽고 Phase 1만 진행해줘. 끝나면 실행 방법과 내가 확인할 것을 알려줘.
```

4. 확인이 끝나면 `다음 Phase 진행해줘`라고 입력한다. Phase 6까지 반복한다.

## 숫자를 바꾸고 싶을 때

게임이 너무 쉽거나 어려우면 Claude Code에게 이렇게 말한다.

```
config.js에서 좀비 체력을 2로, 낮 길이를 120초로 바꿔줘.
```

## 그림이나 맵을 바꾸고 싶을 때 (선택)

`tools/` 스크립트는 파이썬과 `cairosvg`, `pillow`, `numpy`가 있어야 돈다.

```
pip install cairosvg pillow numpy
python tools/make_assets.py      그림 다시 만들기
python tools/make_map.py         맵 다시 만들기
python tools/render_preview.py   미리보기 다시 만들기
```
