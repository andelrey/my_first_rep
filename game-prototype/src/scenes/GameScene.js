import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';
import { LEVEL_SWING } from '../level.js';

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  create() {
    const level = LEVEL_SWING;
    this.level = level;

    // --- Сплайн трассы ---
    // Форма берётся из уровня, масштаб — под C.raceLengthSec на базовой скорости.
    const rawPts = level.spline.map(([x, y]) => new Phaser.Math.Vector2(x, y));
    const rawLen = new Phaser.Curves.Spline(rawPts).getLength();
    const k = (C.raceLengthSec * C.baseSpeed) / rawLen;
    const pts = rawPts.map((v) => v.scale(k));
    this.curve = new Phaser.Curves.Spline(pts);
    this.curveLen = this.curve.getLength();
    const xs = pts.map((v) => v.x), ys = pts.map((v) => v.y);
    const pad = level.trackWidthPx + 300;
    this.worldBounds = {
      x: Math.min(...xs) - pad, y: Math.min(...ys) - pad,
      w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad,
    };

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
    this.curve.getPoint(1, this._p);
    this.curve.getTangent(1, this._t);
    const fa = Math.atan2(this._t.y, this._t.x);
    const finish = this.add.rectangle(this._p.x, this._p.y, 10, level.trackWidthPx, C.colors.dark);
    finish.setRotation(fa);

    // --- Машины ---
    this.cars = [];
    const gridGap = 52;
    const nCars = C.botCount + 2; // + чемпион + игрок
    // grid 1 (чемпион, впереди) ... grid nCars
    this.champion = this._makeCar('Чемпион', C.colors.champion, { isChampion: true });
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

    // Следы шин от дрифта (под машинами)
    this.skids = this.add.graphics().setDepth(5);
    // Прожектор лидера: едет за тем, кто сейчас первый (не привязан к чемпиону)
    const sp = C.spotlight;
    this.spot = this.add.circle(0, 0, sp.radius, C.colors.leader, sp.alpha).setDepth(9);
    this.spotTag = this.add.text(0, 0, '#1',
      { fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: '#D9A53A', fontStyle: 'bold', stroke: '#2F2A26', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(13);
    this.prevLeader = null;

    // --- Камера ---
    const wb = this.worldBounds;
    this.cameras.main.setBounds(wb.x, wb.y, wb.w, wb.h);
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
    this.finishOrder = []; // машины в порядке пересечения финиша
    this.raceTime = 0;
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
    cont.setDepth(10);
    // Имя соперника над машиной (не вращается вместе с ней)
    const label = flags.isPlayer ? null : this.add.text(0, 0, name,
      { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#F1EBE0', stroke: '#2F2A26', strokeThickness: 3 })
      .setOrigin(0.5).setDepth(12);
    const car = { name, color, container: cont, body, label, dist: 0, speed: 0, lane: 0, prefLane: 0, paceBase: 1, driftAngle: 0, finished: false, ...flags };
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
    car.heading = Math.atan2(this._t.y, this._t.x);
    car.container.setRotation(car.heading + car.driftAngle);
    if (car.label) car.label.setPosition(car.container.x, car.container.y - 30);
    car.t = t;
  }

  update(time, delta) {
    if (this.state !== 'racing') return;
    const dt = Math.min(delta / 1000, 0.05);

    // Ранги (по прогрессу) — до движения, для тяжести лидерства в этом кадре
    const leader = this._ranking()[0];

    // --- Игрок ---
    const leading = leader === this.player;
    const maxS = C.maxSpeed * (leading ? C.leaderHeaviness.maxSpeed : 1);
    const acc = C.accel * (leading ? C.leaderHeaviness.accel : 1);
    const p = this.player;
    const gas = this.gasDown || this.keys.UP.isDown || this.keys.W.isDown || this.keys.SPACE.isDown;
    const drift = this.driftDown || this.keys.SHIFT.isDown;
    let driftTarget = 0;
    if (drift) {
      // Мягкий (с газом): только теряем долю скорости. Резкий (без газа): плюс обычное торможение.
      p.speed -= p.speed * (gas ? C.driftSoftLoss : C.driftHardLoss) * dt;
      if (!gas) p.speed -= C.brake * dt;
      p.speed = Math.max(0, p.speed);
      driftTarget = Phaser.Math.DegToRad(gas ? C.driftSoftAngleDeg : C.driftHardAngleDeg) * this._turnSign(p);
    } else if (gas) {
      p.speed = Math.min(maxS, p.speed + acc * dt);
    } else {
      p.speed = Math.max(0, p.speed - C.brake * dt);
    }
    p.driftAngle += (driftTarget - p.driftAngle) * Math.min(1, C.driftAngleEase * dt);
    if (drift && p.speed > 20) this._skid(p);
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
    const view = this.cameras.main.worldView;
    for (const car of this.cars) {
      if (car.isPlayer || car.finished) continue;
      const t = Phaser.Math.Clamp(car.dist / this.curveLen, 0, 1);
      let pace;
      if (car.isChampion) {
        pace = this._zoneAt(t) === 'red' ? C.championCornerPace : C.championStraightPace;
      } else {
        pace = car.paceBase;
        if (t > C.finishZoneFrom) pace *= C.finishBoost;
        // Rubber-band — только когда бота не видно в кадре
        const offscreen = !view.contains(car.container.x, car.container.y);
        if (offscreen && leader.dist - car.dist > C.silverWindowPx) pace *= 1 + C.rubberBand;
      }
      let ease = C.aiEase;
      if (car === leader) {
        pace *= C.leaderHeaviness.maxSpeed;
        ease *= C.leaderHeaviness.accel;
      }
      const target = C.baseSpeed * pace;
      car.speed += (target - car.speed) * Math.min(1, ease * dt);
      // Плавно к своей полосе
      const pref = car.isChampion ? -20 : car.prefLane;
      car.lane += (pref - car.lane) * Math.min(1, 1.5 * dt);
    }

    // --- Движение и отрисовка ---
    for (const car of this.cars) {
      if (!car.finished) {
        car.dist += car.speed * dt;
        if (car.dist >= this.curveLen) {
          // Время пересечения — с интерполяцией внутри кадра
          const over = car.dist - this.curveLen;
          car.finishTime = this.raceTime + dt - (car.speed > 0 ? over / car.speed : 0);
          car.dist = this.curveLen;
          car.finished = true;
          this.finishOrder.push(car);
        }
      }
      this._placeCar(car);
    }
    this.raceTime += dt;

    // Ранги после движения — их видит HUD и по ним считается финиш
    const order = this._ranking();
    const playerRank = order.indexOf(this.player) + 1;
    if (playerRank === 1) this.wasEverFirst = true;

    // --- HUD ---
    this._updateHud(order, playerRank);
    this._updateSpotlight(order[0]);

    // --- Зум финиша (перк-заглушка): отъезжаем в финишной зоне ---
    this.targetZoom = p.t > C.finishZoneFrom ? 0.8 : 1.0;
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Linear(cam.zoom, this.targetZoom, Math.min(1, 2 * dt)));

    // --- Финиш ---
    // Досрочно: двое соперников уже финишировали — второго места не будет
    // (иначе, если встать, гонка не кончится никогда).
    const rivalsDone = this.finishOrder.filter((c) => !c.isPlayer).length;
    if (p.finished || rivalsDone >= 2) this._finish(order, playerRank);
  }

  // Куда поворачивает трасса под машиной: +1 / -1 (на прямой — куда рулят)
  _turnSign(car) {
    const t = car.t ?? 0;
    const a = this.curve.getTangent(Math.min(1, t), new Phaser.Math.Vector2());
    const b = this.curve.getTangent(Math.min(1, t + 0.01), new Phaser.Math.Vector2());
    const cross = a.x * b.y - a.y * b.x;
    if (Math.abs(cross) > 0.002) car.turnSign = Math.sign(cross);
    return car.turnSign || 1;
  }

  // Две точки следа от задних колёс
  _skid(car) {
    const ang = car.heading + car.driftAngle;
    const cx = car.container.x - Math.cos(ang) * 16, cy = car.container.y - Math.sin(ang) * 16;
    const ox = -Math.sin(ang) * 9, oy = Math.cos(ang) * 9;
    this.skids.fillStyle(C.colors.dark, 0.35);
    this.skids.fillCircle(cx + ox, cy + oy, 2.5);
    this.skids.fillCircle(cx - ox, cy - oy, 2.5);
  }

  // Прожектор — над текущим лидером; на смене лидера — вспышка
  _updateSpotlight(leader) {
    const x = leader.container.x, y = leader.container.y;
    this.spot.setPosition(x, y);
    this.spotTag.setPosition(x, y - (leader.label ? 46 : 36));
    if (leader !== this.prevLeader) {
      this.prevLeader = leader;
      this.tweens.killTweensOf(this.spot);
      this.spot.setScale(1.8);
      this.tweens.add({ targets: this.spot, scale: 1, duration: 350, ease: 'Quad.easeOut' });
    }
    // Игрок под прожектором — пульсирует: «вторая звезда под угрозой»
    const sp = C.spotlight;
    const a = leader.isPlayer ? sp.alpha * (0.6 + 0.4 * Math.sin(this.raceTime * sp.playerPulseHz * Math.PI * 2)) + 0.15 : sp.alpha;
    this.spot.setAlpha(a);
  }

  // Финишировавшие — в порядке пересечения черты, остальные — по прогрессу
  _ranking() {
    const running = this.cars.filter((c) => !c.finished).sort((a, b) => b.dist - a.dist);
    return [...this.finishOrder, ...running];
  }

  _updateHud(order, playerRank) {
    const p = this.player;
    const lead = order[0];
    this.hudPos.setText(`${playerRank}/${this.cars.length}` + (lead.isPlayer ? '' : `  · лидер: ${lead.name}`));
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
    // Разрыв на финише: насколько впереди был соперник, когда игрок пересёк черту
    const gapAheadPx = ahead && p.finished
      ? (p.finishTime - ahead.finishTime) * p.speed
      : Infinity;

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
