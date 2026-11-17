import { CONFIG } from '../config.js';
import { setTileSize } from '../iso.js';

// 그림 목록(manifest)과 맵을 먼저 읽고, 목록대로 그림을 불러온다.
// 파일 경로, 크기, 기준점, 프레임 크기는 모두 manifest 값을 쓴다.
export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    this.load.json('manifest', 'assets/manifest.json');
    this.load.json('map', 'data/map.json');
  }

  create() {
    const manifest = this.cache.json.get('manifest');
    const map = this.cache.json.get('map');
    const label = this.add.text(this.scale.width / 2, this.scale.height / 2, '불러오는 중입니다', {
      fontFamily: CONFIG.screen.font, fontSize: '40px', fontStyle: 'bold', color: CONFIG.screen.textColor, align: 'center',
    }).setOrigin(0.5);
    if (!manifest || !map) {
      label.setText('그림 목록이나 맵 파일을 읽지 못했습니다');
      return;
    }
    setTileSize(manifest.meta.tileWidth, manifest.meta.tileHeight);

    for (const ch of manifest.meta.ground.chunks) this.load.image(ch.key, 'assets/' + ch.file);
    for (const [key, a] of Object.entries(manifest.assets)) {
      if (a.frameWidth) {
        this.load.spritesheet(key, 'assets/' + a.file, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      } else {
        this.load.image(key, 'assets/' + a.file);
      }
    }
    const failed = [];
    this.load.on('loaderror', (file) => failed.push(file.key));
    this.load.once('complete', () => {
      if (failed.length) {
        console.error('불러오지 못한 그림:', failed.join(', '));
        label.setText('그림을 불러오지 못했습니다\n' + failed.join(', '));
        return;
      }
      this.makeAnimations(manifest);
      this.scene.start('game');
    });
    this.load.start();
  }

  // 애니메이션 (12.1): manifest 의 anims 를 모두 '그림이름:애니메이션이름'으로 만든다(프레임마다 그 시간(ms)).
  // 모닥불은 anims 가 없어서 burn1~burn3 을 burnFps 로 반복한다('build_campfire_burn').
  makeAnimations(manifest) {
    for (const [key, a] of Object.entries(manifest.assets)) {
      for (const [name, v] of Object.entries(a.anims || {})) {
        this.anims.create({
          key: key + ':' + name,
          frames: v.frames.map(([f, ms]) => ({ key, frame: a.frames.indexOf(f), duration: ms })),
          repeat: v.loop ? -1 : 0,
        });
      }
    }
    const fire = manifest.assets.build_campfire;
    if (fire && fire.frames && !this.anims.exists('build_campfire_burn')) {
      this.anims.create({
        key: 'build_campfire_burn',
        frames: ['burn1', 'burn2', 'burn3'].map((f) => ({ key: 'build_campfire', frame: fire.frames.indexOf(f) })),
        frameRate: CONFIG.anim.burnFps,
        repeat: -1,
      });
    }
  }
}
