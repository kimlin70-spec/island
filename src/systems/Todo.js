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
export function todoFor(stage) { return stage >= 2 ? TODO_ITEMS2 : TODO_ITEMS; }

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
