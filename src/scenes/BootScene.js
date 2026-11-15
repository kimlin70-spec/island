import { CONFIG } from '../config.js';
import { setTileSize } from '../iso.js';

// 그림 목록(manifest)과 맵을 먼저 읽고, 목록대로 그림을 불러온다.
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.json('manifest', 'assets/manifest.json');
    this.load.json('map', 'data/map_demo.json');
  }

  create() {
    const manifest = this.cache.json.get('manifest');
    setTileSize(manifest.meta.tileWidth, manifest.meta.tileHeight);

    for (const [key, a] of Object.entries(manifest.assets)) {
      if (a.frameWidth) {
        this.load.spritesheet(key, 'assets/' + a.file, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      } else {
        this.load.image(key, 'assets/' + a.file);
      }
    }
    this.load.once('complete', () => {
      this.makeAnimations(manifest);
      this.scene.start('game');
      this.scene.launch('ui');
    });
    this.load.start();
  }

  // 걷는 동작: walk1, walk2 를 번갈아
  makeAnimations(manifest) {
    for (const [key, a] of Object.entries(manifest.assets)) {
      if (!a.frames || !a.frames.includes('walk1')) continue;
      this.anims.create({
        key: key + '_walk',
        frames: [
          { key, frame: a.frames.indexOf('walk1') },
          { key, frame: a.frames.indexOf('walk2') },
        ],
        frameRate: CONFIG.anim.walkFps,
        repeat: -1,
      });
    }
  }
}
