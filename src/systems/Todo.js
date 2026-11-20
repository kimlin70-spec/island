import { CONFIG } from '../config.js';

// 할 일 목록 (5.11). 조건이 되면 체크된다. 순서는 상관없다.
export const TODO_ITEMS = [
  { id: 'axe',      label: '나무 도끼 만들기' },
  { id: 'pickaxe',  label: '나무 곡괭이 만들기' },
  { id: 'campfire', label: '모닥불 피우기' },
  { id: 'tent',     label: '텐트 치기' },
  { id: 'fence',    label: `울타리 ${CONFIG.todo.fenceCount}개 세우기` },
  { id: 'morning',  label: '아침까지 버티기' },
];
// 2단계의 할 일 (11.1). 첫 밤의 결과 창에서 "계속하기"를 누르면 이 목록으로 바뀐다.
export const TODO_ITEMS2 = [
  { id: 'iron',       label: `철광석 ${CONFIG.todo2.iron}개 모으기` },
  { id: 'gun',        label: '총 만들기' },
  { id: 'watchtower', label: '망루 세우기' },
  { id: 'guntower',   label: '총 타워 세우기' },
  { id: 'wire',       label: `철조망 ${CONFIG.todo2.wire}개 깔기` },
  { id: 'night',      label: '밤을 넘기기' },
];
// 3단계의 할 일 (13.5). (사용자와 정함) 2단계의 할 일을 모두 마치면 이 목록으로 바뀐다
export const TODO_ITEMS3 = [
  { id: 'gate',    label: '문 달기' },
  { id: 'hoe',     label: '괭이 만들기' },
  { id: 'farm',    label: `밭 ${CONFIG.todo3.farm}칸 갈기` },
  { id: 'plant',   label: '씨앗 심기' },
  { id: 'harvest', label: '작물 거두기' },
  { id: 'dog',     label: '강아지와 친구 되기' },
];
// (지하) 지하 생활의 할 일 (17.10). (사용자와 정한 방식대로) 3단계의 할 일을 모두 마치면 이 목록으로 바뀐다
export const TODO_ITEMS4 = [
  { id: 'burrow',   label: '굴 입구 짓기' },
  { id: 'down',     label: '지하로 내려가기' },
  { id: 'dig',      label: `방 넓히기(${CONFIG.todo4.dig}칸 파기)` },
  { id: 'bed',      label: '침대 놓기' },
  { id: 'mushroom', label: '버섯 기르기' },
];
export function todoFor(stage) { return stage >= 4 ? TODO_ITEMS4 : stage >= 3 ? TODO_ITEMS3 : stage >= 2 ? TODO_ITEMS2 : TODO_ITEMS; }

export class Todo {
  constructor(scene) {
    this.scene = scene;
    this.done = new Set();
  }

  isDone(id) { return this.done.has(id); }

  check(id) {
    if (this.done.has(id)) return;
    this.done.add(id);
    this.scene.events.emit('todo-changed');
  }
}
