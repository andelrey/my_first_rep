import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { LEVEL_SWING } from '../level.js';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    const level = LEVEL_SWING;
    this.level = level;

    // --- Сплайн трассы ---
    const pts = level.spline.map(([x, y]) => new Phaser.Math.Vector2(x, y));
    this.curve = new Phaser.Curves.Spline(pts);
    this.curveLen = this.curve.getLength();

    this._p = new Phaser.Math.Vector2();
    this._t = new Phaser.Math.Vector2();

    // --- Рисуем трассу ---
    const g = this.add.graphics();
    g.lineStyle(level.trackWidthPx, C.colors.asphalt, 1);
    this.curve.draw(g, 96);
    // центральная линия
    g.lineStyle(4, C.colors.light, 0.5);
    this.curve.draw(g, 96);
    // финишная черта
    this.curve.getPoint(0.995, this._p);
    this.curve.getTangent(0.995, this._t);
    const fa = Math.atan2(this._t.y, this._t.x);
    const finish = this.add.rectangle(this._p.x, this._p.y, 10, level.trackWidthPx, C.colors.dark);
    finish.setRotation(fa);

    // --- Машины ---
    this.cars = [];
    const gridGap = 52;
    const nCars = C.botCount + 2; // + чемпион + игрок
    // grid 1 (чемпион, впереди) ... grid nCars
    this.champion = this._makeCar('Чемпион', C.colors.leader, { isChampion: true });
    this.champion.dist = (nCars - 1) * gridGap;
    this.champion.lane = -20;

    this.player = this._makeCar('Игрок', C.colors.bot, { isPlayer: true });
    this.player.dist = (nCars - 2) * gridGap;
    this.player.lane = 20;

    const botNames = ['Свен', 'Бьёрн', 'Сигрид'];
    for (let i = 0; i < C.botCount; i++) {
      const b = this._makeCar(botNames[i] || `Бот ${i + 1}`, C.colors.bot, { isBot: true });
      b.dist = (nCars - 3 - i) * gridGap;
      b.lane = (i % 2 === 0 ? -30 : 30);
      b.paceBase = 1 + Phaser.Math.FloatBetween(-C.botPaceSpread, C.botPaceSpread);
      b.prefLane = Phaser.Math.Between(-40, 40);
    }

    for (const car of this.cars) car.speed = C.baseSpeed;

    // --- Камера ---
    this.cameras.main.setBounds(-200, -200, 2400, 1600);
    this.cameras.main.startFollow(this.player.container, true, 0.12, 0.12);
    this.cameras.main.setZoom(1.0);
    this.targetZoom = 1.0;

    // --- Ввод ---
    this.gasDown = false;
    this.driftDown = false;
    this.steer = 0;        // -1..1 (клавиши)
    this.tiltGamma = null; // наклон

    const keys = this.input.keyboard.addKeys('UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,W,A,D,S');
    this.keys = keys;

    this._buildTouchControls();
    this._initTilt();

    // --- HUD ---
    this.hudPos = this.add.text(16, 12, '', { fontFamily: 'system-ui, sans-serif', fontSize: '34px', color: '#F1EBE0', fontStyle: 'bold' }).setScrollFactor(0).setDepth(100);
    this.hudLeader = this.add.text(16, 58, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#F1EBE0' }).setScrollFactor(0).setDepth(100);
    this.hudThird = this.add.text(16, 84, '', { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#F1EBE0' }).setScrollFactor(0).setDepth(100);
    this.hudHint = this.add.text(16, 118, 'Газ — правая кнопка / ↑ · Дрифт — левая / Shift · Руль — наклон / ← →',
      { fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: '#C7CBD1' }).setScrollFactor(0).setDepth(100);

    // Состояние
    this.wasEverFirst = false;
    this.state = 'racing';
  }

  _makeCar(name, color, flags = {}) {
    const cont = this.add.container(0, 0);
    const body = this.add.rectangle(0, 0, 40, 22, color).setStrokeStyle(2, C.colors.dark);
    const nose = this.add.rectangle(15, 0, 10, 22, C.colors.dark);
    cont.add([body, nose]);
    if (flags.isPlayer) {
      const marker = this.add.rectangle(0, 0, 52, 34).setStrokeStyle(4, C.colors.playerMarker);
      const arrow = this.add.triangle(0, -30, 0, 10, 8, -6, -8, -6, C.colors.playerMarker);
      cont.add([marker, arrow]);
    }
    if (flags.isChampion) {
      const crown = this.add.text(0, -26, '#1', { fontFamily: 'system-ui', fontSize: '16px', color: '#D9A53A', fontStyle: 'bold' }).setOrigin(0.5);
      cont.add(crown);
    }
    cont.setDepth(10);
    const car = { name, color, container: cont, body, dist: 0, speed: 0, lane: 0, prefLane: 0, paceBase: 1, finished: false, ...flags };
    this.cars.push(car);
    return car;
  }

  _buildTouchControls() {
    const cam = this.cameras.main;
    const W = this.scale.width, H = this.scale.height;
    // Газ — справа, дрифт — слева. Пиннятся к экрану.
    const gas = this.add.rectangle(W - 90, H - 90, 130, 130, C.colors.playerMarker, 0.25)
      .setStrokeStyle(3, C.colors.playerMarker).setScrollFactor(0).setDepth(90).setInteractive();
    this.add.text(W - 90, H - 90, 'ГАЗ', { fontFamily: 'system-ui', fontSize: '20px', color: '#F1EBE0' }).setOrigin(0.5).setScrollFactor(0).setDepth(91);
    const drift = this.add.rectangle(90, H - 90, 130, 130, C.colors.alarm, 0.22)
      .setStrokeStyle(3, C.colors.alarm).setScrollFactor(0).setDepth(90).setInteractive();
    this.add.text(90, H - 90, 'ДРИФТ', { fontFamily: 'system-ui', fontSize: '18px', color: '#F1EBE0' }).setOrigin(0.5).setScrollFactor(0).setDepth(91);

    gas.on('pointerdown', () => { this.gasDown = true; this._askTilt(); });
    gas.on('pointerup', () => { this.gasDown = false; });
    gas.on('pointerout', () => { this.gasDown = false; });
    drift.on('pointerdown', () => { this.driftDown = true; });
    drift.on('pointerup', () => { this.driftDown = false; });
    drift.on('pointerout', () => { this.driftDown = false; });

    // Пересобрать позиции кнопок при ресайзе
    this.scale.on('resize', (gameSize) => {
      const w = gameSize.width, h = gameSize.height;
      gas.setPosition(w - 90, h - 90);
      drift.setPosition(90, h - 90);
    });
  }

  _initTilt() {
    this._tiltHandler = (e) => { if (e.gamma != null) this.tiltGamma = e.gamma; };
    window.addEventListener('deviceorientation', this._tiltHandler);
  }

  _askTilt() {
    // iOS 13+ требует запрос разрешения по жесту
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function' && !this._tiltAsked) {
      this._tiltAsked = true;
      DOE.requestPermission().catch(() => {});
    }
  }

  _zoneAt(t) {
    for (const z of this.level.zones) if (t >= z.from && t < z.to) return z.type;
    return 'blue';
  }

  _placeCar(car) {
    const t = Phaser.Math.Clamp(car.dist / this.curveLen, 0, 1);
    this.curve.getPoint(t, this._p);
    this.curve.getTangent(t, this._t);
    const nx = -this._t.y, ny = this._t.x;
    car.container.setPosition(this._p.x + nx * car.lane, this._p.y + ny * car.lane);
    car.container.setRotation(Math.atan2(this._t.y, this._t.x));
    car.t = t;
  }

  update(time, delta) {
    if (this.state !== 'racing') return;
    const dt = Math.min(delta / 1000, 0.05);

    // Ранги (по прогрессу)
    const order = [...this.cars].sort((a, b) => b.dist - a.dist);
    const playerRank = order.indexOf(this.player) + 1;
    if (playerRank === 1) this.wasEverFirst = true;

    // --- Игрок ---
    const leading = playerRank === 1;
    const maxS = C.maxSpeed * (leading ? C.leaderHeaviness.maxSpeed : 1);
    const acc = C.accel * (leading ? C.leaderHeaviness.accel : 1);
    const p = this.player;
    if (this.driftDown) {
      p.speed = Math.max(40, p.speed - C.driftScrub * dt);
    } else if (this.gasDown || this.keys.UP.isDown || this.keys.W.isDown || this.keys.SPACE.isDown) {
      p.speed = Math.min(maxS, p.speed + acc * dt);
    } else {
      p.speed = Math.max(0, p.speed - C.brake * dt);
    }
    // Руль: клавиши или наклон
    let steer = 0;
    if (this.keys.LEFT.isDown || this.keys.A.isDown) steer = -1;
    else if (this.keys.RIGHT.isDown || this.keys.D.isDown) steer = 1;
    else if (this.tiltGamma != null) {
      const dz = C.tiltDeadzoneDeg, mx = C.tiltMaxDeg;
      const gv = this.tiltGamma;
      if (Math.abs(gv) > dz) steer = Phaser.Math.Clamp((gv - Math.sign(gv) * dz) / (mx - dz), -1, 1);
    }
    const laneLimit = this.level.trackWidthPx / 2 - 12;
    p.lane = Phaser.Math.Clamp(p.lane + steer * C.steerSpeed * dt, -laneLimit, laneLimit);

    // --- ИИ ---
    for (const car of this.cars) {
      if (car.isPlayer) continue;
      const t = Phaser.Math.Clamp(car.dist / this.curveLen, 0, 1);
      let pace;
      if (car.isChampion) {
        pace = C.championPace * (this._zoneAt(t) === 'red' ? C.championCornerPenalty : 1);
      } else {
        pace = car.paceBase;
        if (t > C.finishZoneFrom) pace *= C.finishBoost;
      }
      const target = C.baseSpeed * pace;
      car.speed += (target - car.speed) * Math.min(1, C.aiEase * dt);
      // Плавно к своей полосе
      const pref = car.isChampion ? -20 : car.prefLane;
      car.lane += (pref - car.lane) * Math.min(1, 1.5 * dt);
    }

    // --- Движение и отрисовка ---
    for (const car of this.cars) {
      if (!car.finished) car.dist += car.speed * dt;
      this._placeCar(car);
    }

    // --- HUD ---
    this._updateHud(order, playerRank);

    // --- Зум финиша (перк-заглушка): отъезжаем в финишной зоне ---
    this.targetZoom = p.t > C.finishZoneFrom ? 0.8 : 1.0;
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, this.targetZoom, Math.min(1, 2 * dt)));

    // --- Финиш ---
    if (p.dist >= this.curveLen) this._finish(order, playerRank);
  }

  _updateHud(order, playerRank) {
    const p = this.player;
    this.hudPos.setText(`${playerRank}/${this.cars.length}`);
    const idx = order.indexOf(p);
    const ahead = order[idx - 1];
    const behind = order[idx + 1];
    const third = order[2];

    if (ahead) {
      const gap = (ahead.dist - p.dist) / C.carLenPx;
      this.hudLeader.setText(`До впереди идущего: ${gap.toFixed(1)} корп.`);
      this.hudLeader.setColor(gap < 1.5 ? '#D9A53A' : '#F1EBE0');
    } else {
      this.hudLeader.setText('Ты ПЕРВЫЙ — сбрось темп!');
      this.hudLeader.setColor('#B84A32');
    }
    // разрыв до 3-го (угроза вылететь с серебра)
    if (playerRank <= 2 && third && third !== p) {
      const gap3 = (p.dist - third.dist) / C.carLenPx;
      this.hudThird.setText(`До 3-го: ${gap3.toFixed(1)} корп.`);
      this.hudThird.setColor(gap3 < 1.5 ? '#B84A32' : '#F1EBE0');
    } else if (behind) {
      const gapB = (p.dist - behind.dist) / C.carLenPx;
      this.hudThird.setText(`До догоняющего: ${gapB.toFixed(1)} корп.`);
      this.hudThird.setColor('#F1EBE0');
    } else {
      this.hudThird.setText('');
    }
  }

  _finish(order, playerRank) {
    this.state = 'finished';
    const p = this.player;
    const idx = order.indexOf(p);
    const ahead = order[idx - 1];
    const gapAheadPx = ahead ? (ahead.dist - p.dist) : Infinity;

    const place = playerRank;
    const stars = [
      place === 2,                                     // 1★ второе место
      place === 2 && !this.wasEverFirst,               // 2★ и ни разу не первый
      place === 2 && gapAheadPx <= C.perfectSilverPx,  // 3★ идеальное серебро
    ];
    let outcome = 'behind';
    if (place === 1) outcome = 'shame';
    else if (place === 2) outcome = 'silver';

    window.removeEventListener('deviceorientation', this._tiltHandler);
    this.scene.start('ResultScene', { place, stars, outcome, total: this.cars.length });
  }
}
