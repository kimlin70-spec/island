# -*- coding: utf-8 -*-
"""월드 좌표와 바닥 그림의 범위(저장 크기 기준, 한 칸 80x40)."""
HW, HH = 40, 20                 # 한 칸의 반폭, 반높이
GROUND_X0, GROUND_Y0 = -2560, -276     # 바닥 그림 왼쪽 위 모서리의 월드 좌표
GROUND_W, GROUND_H = 5120, 3072        # 바닥 그림을 그리는 크기(게임에서 실제 쓰는 범위는 5110 x 3066)
CHUNK = 1024                           # 바닥 그림 조각 한 장의 크기
STEP = 1022                            # 조각을 놓는 간격. 조각의 가장자리 1px은 이웃과 겹치는 여유분
VIEW_W, VIEW_H = 1920, 1200            # 게임 화면 크기


def t2w(col, row):
    """칸 -> 월드 좌표(칸 중심)."""
    return ((col - row) * HW, (col + row) * HH)


def w2t(x, y):
    """월드 좌표 -> 칸 좌표(소수)."""
    return ((x / HW + y / HH) / 2.0, (y / HH - x / HW) / 2.0)


def h01(c, r, k=0):
    """칸마다 고정된 0~1 난수."""
    h = ((int(c) * 73856093) ^ (int(r) * 19349663) ^ (k * 83492791)) & 0xFFFFFFFF
    h = (h * 2654435761) & 0xFFFFFFFF
    return ((h >> 8) & 0xFFFF) / 65535.0
