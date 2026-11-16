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
