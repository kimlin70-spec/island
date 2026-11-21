#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
묶음 점검: 그림 목록, 맵, 지시문이 서로 맞는지 확인한다.   실행: python tools/check_bundle.py
그림이나 맵을 다시 만든 뒤에 돌려 본다. 마지막 줄에 "문제 없음"이 나오면 된다.
"""
import json
import os
import re
from collections import deque

from PIL import Image
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
problems = []


def bad(msg):
    problems.append(msg)
    print('  ✕', msg)


def main():
    man = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json'), encoding='utf-8'))
    A, G = man['assets'], man['meta']['ground']
    M = json.load(open(os.path.join(ROOT, 'data', 'map.json'), encoding='utf-8'))
    spec = open(os.path.join(ROOT, 'DEMO_SPEC.md'), encoding='utf-8').read()

    print('1) 그림 파일')
    for k, v in A.items():
        path = os.path.join(ROOT, 'assets', v['file'])
        if not os.path.exists(path):
            bad(f'{k}: 파일 없음 {v["file"]}')
            continue
        w, h = Image.open(path).size
        if (w, h) != (v['w'], v['h']):
            bad(f'{k}: 크기가 manifest와 다름 {(w, h)} != {(v["w"], v["h"])}')
        if 'frameWidth' in v:
            fw, fh = v['frameWidth'], v['frameHeight']
            if v['w'] % fw or v['h'] % fh or (v['w'] // fw) * (v['h'] // fh) < len(v['frames']) or \
                    (v['w'] // fw) * (v['h'] // fh - 1) >= len(v['frames']):
                bad(f'{k}: 프레임 수와 시트 크기가 맞지 않음')
        if v['kind'] == 'turret':
            n = v.get('directions')
            if not n or len(v.get('muzzle', [])) != n or len(v.get('screenAngle', [])) != n or len(v['frames']) % n:
                bad(f'{k}: 포탑 방향 수, muzzle, screenAngle 개수가 맞지 않음')
        if 'turret' in v:
            if v['turret'] not in A or A[v['turret']]['kind'] != 'turret' or 'mount' not in v or 'lamp' not in v:
                bad(f'{k}: 탑 받침의 turret/mount/lamp 값이 잘못됨')
        if isinstance(v.get('muzzle'), dict):
            for f in v['muzzle']:
                if f not in v.get('frames', []):
                    bad(f'{k}: muzzle 의 프레임 이름 {f} 가 없음')
        if not (0 <= v['originX'] <= 1 and 0 <= v['originY'] <= 1) and v['kind'] != 'ug' and not v.get('wall'):   # 지하 덮개·기둥, 벽 장식은 칸 가운데가 그림 밖(아래)
            bad(f'{k}: 기준점이 그림 밖')
        for name, a in v.get('anims', {}).items():               # 애니메이션: 프레임 이름, 시간, hit, swing
            names = [f for f, ms in a['frames']]
            if any(f not in v.get('frames', []) for f in names):
                bad(f'{k}:{name} 애니메이션에 없는 프레임이 있음: {[f for f in names if f not in v.get("frames", [])]}')
            if any(not isinstance(ms, int) or ms <= 0 for f, ms in a['frames']):
                bad(f'{k}:{name} 애니메이션의 프레임 시간이 잘못됨')
            if 'hit' in a and a['hit'] not in names:
                bad(f'{k}:{name} 의 hit 프레임 {a["hit"]} 가 애니메이션에 없음')
            if 'swing' in a and a['swing'] not in A.get('fx_swing', {}).get('anims', {}):
                bad(f'{k}:{name} 의 swing {a["swing"]} 가 fx_swing 에 없음')
    for ch in G['chunks'] + G.get('snowChunks', []):
        path = os.path.join(ROOT, 'assets', ch['file'])
        if not os.path.exists(path) or Image.open(path).size != (G['chunkSize'], G['chunkSize']):
            bad(f'{ch["key"]}: 바닥 조각이 없거나 크기가 다름')
    if [(c['x'], c['y']) for c in G.get('snowChunks', [])] != [(c['x'], c['y']) for c in G['chunks']]:
        bad('눈 덮인 바닥 조각의 자리가 보통 바닥 조각과 다름')
    nx = len({c['x'] for c in G['chunks']})
    ny = len({c['y'] for c in G['chunks']})
    if (G['width'], G['height']) != (nx * G['chunkStep'], ny * G['chunkStep']) or G['chunkStep'] + 2 * G['chunkMargin'] != G['chunkSize']:
        bad('바닥 그림의 크기 정보가 조각 수와 맞지 않음')
    fences = [A[f'build_fence_{i}'] for i in range(16)]
    if len({(f['w'], f['h'], f['originX'], f['originY']) for f in fences}) != 1:
        bad('울타리 16장의 크기나 기준점이 서로 다름')
    print(f'   그림 {len(A)}장, 바닥 조각 {len(G["chunks"])}장')

    print('2) 맵')
    N, T = M['cols'], M['terrain']
    occ = {}
    if set(M['terrainLegend']) != {str(k) for row in T for k in set(row)} | set(M['terrainLegend']) or \
            any(str(k) not in M['terrainLegend'] for row in T for k in row):
        bad('terrainLegend 에 없는 땅 종류가 있음')
    for o in M['objects']:
        p = (o['col'], o['row'])
        if o['kind'] == 'iron' and T[p[1]][p[0]] != 5:
            bad(f'철광석이 철광 지대 밖에 있음: {p}')
        if o['sprite'] not in A:
            bad(f'맵의 사물 그림이 manifest에 없음: {o["sprite"]}')
        if T[p[1]][p[0]] == 0:
            bad(f'물 위에 사물이 있음: {p}')
        if p in occ:
            bad(f'한 칸에 사물이 둘: {p}')
        occ[p] = o
    free = lambda c, r: 0 <= c < N and 0 <= r < N and T[r][c] != 0 and (c, r) not in occ
    st = (M['playerStart']['col'], M['playerStart']['row'])
    if not free(*st):
        bad('시작 칸이 막혀 있음')
    seen, q = {st}, deque([st])
    while q:                                             # 8방향, 모서리를 끊고 지나가지 않음
        c, r = q.popleft()
        for dc in (-1, 0, 1):
            for dr in (-1, 0, 1):
                n = (c + dc, r + dr)
                if n in seen or not free(*n) or (dc and dr and not (free(c + dc, r) and free(c, r + dr))):
                    continue
                seen.add(n)
                q.append(n)
    total = sum(1 for r in range(N) for c in range(N) if free(c, r))
    if len(seen) != total:
        bad(f'시작 지점에서 갈 수 없는 땅이 있음: {total - len(seen)}칸')
    for s in M['zombieSpawns']:
        if (s['col'], s['row']) not in seen:
            bad(f'좀비가 나오는 자리에 갈 수 없음: {s}')
    land = M['pirates']['landing']
    if (land['col'], land['row']) not in seen or not any((land['col'] + d[0], land['row'] + d[1]) in seen for d in ((1, 0), (-1, 0), (0, 1), (0, -1))):
        bad('해적 상륙 칸이나 그 옆 칸에 갈 수 없음')
    crate = (M['seedCrate']['col'], M['seedCrate']['row'])                 # 3단계: 씨앗 상자, 동물 자리
    if crate not in seen:
        bad('씨앗 상자 자리에 갈 수 없음')
    else:
        rest = seen - {crate}
        start2, q2 = {st}, deque([st])
        while q2:
            c, r = q2.popleft()
            for dc in (-1, 0, 1):
                for dr in (-1, 0, 1):
                    n = (c + dc, r + dr)
                    if n in start2 or n not in rest or (dc and dr and not ((c + dc, r) in rest and (c, r + dr) in rest)):
                        continue
                    start2.add(n)
                    q2.append(n)
        if len(start2) != len(rest):
            bad('씨앗 상자가 길을 막음')
    for k, v in M['pets'].items():
        if (v['col'], v['row']) not in seen:
            bad(f'{k} 자리에 갈 수 없음')
    ug = M.get('underground', {}).get('floors', [])                      # 17장: 지하
    for F in ug:
        n_c, n_r = F['cols'], F['rows']
        inner = lambda c, r: 1 <= c < n_c - 1 and 1 <= r < n_r - 1
        dug = {(p['col'], p['row']) for p in F['startDug']}
        ores = {(p['col'], p['row']) for p in F['ores']}
        spores = {(p['col'], p['row']) for p in F['spores']}
        if not all(inner(*p) for p in dug | ores | spores):
            bad(f'{F["name"]}: 가장자리나 격자 밖에 있는 칸이 있음')
        if (F['entry']['col'], F['entry']['row']) not in dug or (F['sealedHole']['col'], F['sealedHole']['row']) not in dug:
            bad(f'{F["name"]}: 사다리 칸이나 막힌 구멍이 파낸 칸이 아님')
        if (ores | spores) & dug or ores & spores or any(p.get('type') != 'iron' for p in F['ores']):
            bad(f'{F["name"]}: 철·버섯 칸이 파낸 칸과 겹치거나 종류가 잘못됨')
        e = (F['entry']['col'], F['entry']['row'])
        room, q3 = {e}, deque([e])
        while q3:
            c, r = q3.popleft()
            for n in ((c + 1, r), (c - 1, r), (c, r + 1), (c, r - 1)):
                if n in dug and n not in room:
                    room.add(n)
                    q3.append(n)
        if len(room) < 9:
            bad(f'{F["name"]}: 사다리가 있는 처음 방이 3x3보다 작음')
    for k in ('char_pirate_1', 'char_pirate_2', 'char_pirate_3'):         # 18장: 해적의 사다리, 허리 등불 자리
        if 'climb' not in A[k].get('anims', {}) or set(A[k].get('lantern', {})) != {'f', 'b'}:
            bad(f'{k}: climb 애니메이션이나 lantern(f, b) 값이 없음')
    if A['build_burrow']['frames'][:4] != ['closed', 'open', 'damaged', 'broken']:
        bad('build_burrow 프레임 순서가 closed, open, damaged, broken 이 아님')
    for fs in ('oak', 'walnut', 'stone'):                                 # 19장: 바닥재·벽판·가장자리
        for v in (1, 2):
            if f'ug_floor_{fs}_{v}' not in A:
                bad(f'바닥재 조각이 없음: ug_floor_{fs}_{v}')
    for side in 'lr':
        for k in ('ug_wall_{}_wood', 'ug_wall_{}_plaster', 'ug_edge_{}_wood', 'ug_edge_{}_stone'):
            if k.format(side) not in A:
                bad(f'꾸민 벽·가장자리 조각이 없음: {k.format(side)}')
    for k in ('deco_sconce', 'deco_candelabra'):
        if 'flame' not in A.get(k, {}) or 'burn' not in A.get(k, {}).get('anims', {}):
            bad(f'{k}: flame 값이나 burn 애니메이션이 없음')
    for side in 'lr':                                                    # 지하 벽 조각이 종류별로 다 있는지
        for kind in ('a', 'b', 'iron', 'mush'):
            if f'ug_wall_{side}_{kind}' not in A:
                bad(f'지하 벽 조각이 없음: ug_wall_{side}_{kind}')
    for k in ('ship', 'boat'):
        p = M['pirates'][k]
        if T[int(round(p['row']))][int(round(p['col']))] != 0:
            bad(f'해적 {k}가 물 위에 있지 않음')
    # 모든 땅 칸의 마름모가 바닥 그림 안에 있는지, 시작 화면이 바닥 그림 안에 들어가는지
    for r in range(N):
        for c in range(N):
            if T[r][c]:
                x, y = (c - r) * 40, (c + r) * 20
                if not (G['x'] + 40 <= x <= G['x'] + G['width'] - 40 and G['y'] + 130 <= y <= G['y'] + G['height'] - 20):
                    bad(f'땅 칸이 바닥 그림 가장자리에 너무 가깝거나 밖에 있음: {(c, r)}')
    print(f'   땅 {sum(1 for row in T for v in row if v)}칸, 사물 {len(M["objects"])}개, 걸을 수 있는 칸 {total}칸 모두 이어짐')
    for F in ug:
        print(f'   {F["name"]}: {F["cols"]}x{F["rows"]}, 처음 파낸 칸 {len(F["startDug"])}, 철 {len(F["ores"])}, 버섯 {len(F["spores"])}')

    print('3) 지시문(DEMO_SPEC.md)에 나오는 이름')
    keys = set(A) | {c['key'] for c in G['chunks']}
    names = set()
    for token in re.findall(r'`([^`\n]+)`', spec):
        for part in re.split(r'[,\s/·→]+', token):
            m = re.fullmatch(r'((?:obj|build|char|icon|overlay|fx|light|glow|ground|turret|proj|farm|crop|decal|ug|deco)_[a-z0-9_]*?)(\d+)~([a-z]?)(\d+)', part)
            if m:                                           # obj_tree_a1~a3, build_fence_0~15 같은 범위 표기
                names.update(f'{m.group(1)}{i}' for i in range(int(m.group(2)), int(m.group(4)) + 1))
            elif re.fullmatch(r'(obj|build|char|icon|overlay|fx|light|glow|ground|turret|proj|farm|crop|decal|ug|deco)_[a-z0-9_]+', part):
                names.add(part)
    for n in sorted(names):
        if n not in keys:
            bad(f'지시문에 있는 그림이 manifest에 없음: {n}')
    unused = sorted(k for k in A if k not in names)
    if unused:
        bad(f'지시문에 한 번도 나오지 않는 그림: {unused}')
    frames = {f for v in A.values() for f in v.get('frames', [])}
    anim_names = {n for v in A.values() for n in v.get('anims', {})}
    word = r'(?:b?(?:idle|walk|dagger|axe|pick|attack|gun|swing|heavy|hoe|water|crouch)|burn|aim|shoot|reload|hurt|down|die|rise|blink|impact|sparkle|vanish|splash|puff|eat|sit|lie|sleep|happy|bark|bite|meow|open|close|closed|zzz|seed|sprout|grow|ripe|dry|wet)\d?'
    for f in re.findall(rf'`({word})`', spec):
        if f not in frames | anim_names:
            bad(f'지시문에 있는 프레임(애니메이션) 이름이 그림에 없음: {f}')
    for k, n in re.findall(r"[`']([a-z0-9_]+):([a-z0-9]+)[`']", spec):  # `char_player:walk` 같은 애니메이션 이름
        if n not in A.get(k, {}).get('anims', {}):
            bad(f'지시문에 있는 애니메이션이 없음: {k}:{n}')
    for line in spec.splitlines():                                     # 12.3 표: 그림별 애니메이션 이름
        m = re.match(r'\|\s*((?:`char_[a-z0-9_]+`,?\s*)+)\|(.*)\|\s*$', line)
        if m:
            for k in re.findall(r'`(char_[a-z0-9_]+)`', m.group(1)):
                for n in re.findall(r'\b[a-z][a-z0-9]{2,}\b', m.group(2)):
                    if n not in A.get(k, {}).get('anims', {}):
                        bad(f'12.3 표의 애니메이션 이름이 {k} 에 없음: {n}')
    m = re.search(r'^프레임 이름: (.+)\. Phaser 파티클', spec, re.M)       # 12.6 조각 이름
    if not m or [x.strip() for x in m.group(1).split(',')] != A['fx_particles']['frames']:
        bad('12.6의 조각 이름이 fx_particles 프레임과 다름')
    for pre, n in re.findall(r'(load|shot|dir)0~(?:load|shot|dir)(\d+)', spec):
        if any(f'{pre}{i}' not in frames for i in range(int(n) + 1)):
            bad(f'지시문의 프레임 범위 {pre}0~{pre}{n} 가 그림에 없음')
    # 지시문의 manifest 예시 숫자
    for k in ('obj_tree_a1', 'char_player'):
        v = A[k]
        for field in ('w', 'h', 'originX', 'originY', 'frameWidth', 'frameHeight'):
            if field in v and not re.search(rf'"{k}":\s*\{{[^}}]*"{field}": {re.escape(str(v[field]))}[,\s}}]', spec, re.S):
                bad(f'지시문의 manifest 예시가 실제 값과 다름: {k}.{field} = {v[field]}')
    for field in ('x', 'y', 'width', 'height', 'chunkSize', 'chunkStep', 'chunkMargin'):
        if not re.search(rf'"{field}": {G[field]}\b', spec):
            bad(f'지시문의 바닥 그림 예시가 실제 값과 다름: {field} = {G[field]}')
    if f'"col": {st[0]}, "row": {st[1]}' not in spec:
        bad('지시문의 시작 칸이 맵과 다름')
    print(f'   그림 이름 {len(names)}개 확인')

    print('4) 효과음')
    S = man.get('sounds', {})
    for k, v in S.items():
        path = os.path.join(ROOT, 'assets', v['file'])
        if not os.path.exists(path):
            bad(f'효과음 파일 없음: {v["file"]}')
            continue
        sr, data = wavfile.read(path)
        if abs(len(data) / sr - v['duration']) > 0.01:
            bad(f'효과음 길이가 목록과 다름: {k}')
        if f'`{k}`' not in spec:
            bad(f'지시문에 한 번도 나오지 않는 효과음: {k}')
    print(f'   효과음 {len(S)}개')

    print('문제 없음' if not problems else f'문제 {len(problems)}건')
    return 1 if problems else 0


if __name__ == '__main__':
    raise SystemExit(main())
