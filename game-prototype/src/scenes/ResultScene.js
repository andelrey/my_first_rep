import Phaser from 'phaser';
import { CONFIG as C } from '../config.js';

const TEXTS = {
  silver: { title: 'Второе место', line: 'Поздравляем. Вы были вторым. Как и подобает.', color: '#4E8079' },
  shame:  { title: 'Первое место',  line: 'Вы победили. Мы никому не скажем.',            color: '#B84A32' },
  behind: { title: 'Отстали',       line: 'Вы отстали. Бывает. Держитесь ближе.',         color: '#C7CBD1' },
};
const PERFECT = 'Безупречное серебро. Не выделяйтесь и впредь.';

export class ResultScene extends Phaser.Scene {
  constructor() { super('ResultScene'); }

  create(data) {
    const { place, stars, outcome, total } = data;
    const W = this.scale.width, H = this.scale.height;
    this.add.rectangle(0, 0, W, H, C.colors.dark).setOrigin(0).setScrollFactor(0);

    const t = TEXTS[outcome] || TEXTS.behind;
    const cx = W / 2;

    this.add.text(cx, H * 0.24, t.title, { fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: t.color, fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, H * 0.36, `${place} место из ${total}`, { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#F1EBE0' }).setOrigin(0.5);

    // Звёзды (независимые)
    const starCount = stars.filter(Boolean).length;
    const line = stars.map((s) => (s ? '★' : '☆')).join('  ');
    this.add.text(cx, H * 0.5, line, { fontFamily: 'system-ui, sans-serif', fontSize: '44px', color: '#D9A53A' }).setOrigin(0.5);

    const sub = stars[2] ? PERFECT : t.line;
    this.add.text(cx, H * 0.62, sub, { fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: '#C7CBD1', align: 'center', wordWrap: { width: W * 0.8 } }).setOrigin(0.5);

    // Кнопка рестарта
    const btn = this.add.rectangle(cx, H * 0.8, 220, 64, C.colors.playerMarker, 0.9).setStrokeStyle(2, C.colors.light).setInteractive();
    this.add.text(cx, H * 0.8, 'Ещё раз', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', color: '#F1EBE0', fontStyle: 'bold' }).setOrigin(0.5);
    const restart = () => this.scene.start('GameScene');
    btn.on('pointerup', restart);
    this.input.keyboard.once('keydown-SPACE', restart);
    this.input.keyboard.once('keydown-ENTER', restart);

    this.add.text(cx, H * 0.9, 'Пробел / тап — рестарт', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#8A8578' }).setOrigin(0.5);
  }
}
