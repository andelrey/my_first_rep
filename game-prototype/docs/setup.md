# Игровое приложение — рабочее место и стек

## Решение по стеку
- **Движок:** Phaser 3 (HTML5/JS) + сборщик **Vite**.
- Почему: не-инженеру проще всего; прототип не выбрасывается, а дорастает
  до продакшена и заворачивается в **Android APK через Capacitor**
  (Android SDK на машине уже есть).
- Unity рассматривался, но для простой 2D-игры избыточен. Финальный движок
  окончательно фиксируем на входе в фазу 1.

## Где лежит проект
- Компьютер пользователя (Mac, Apple Silicon): `~/projects/game-prototype`
- Уже установлено на машине: Node/npm, Bun, VS Code, Cursor, Android SDK, Java.

## Как запускать
```
cd ~/projects/game-prototype
npm install      # первый раз
npm run dev      # http://localhost:5173
```
Логика игры — в `src/scenes/GameScene.js`. Проверено: устанавливается и
собирается без ошибок (Vite 5.4, Phaser 3.80).

## Прототип фазы 0
Мини-игра «тапай по кругу» — проверка игрового цикла и тача на Android.

## План по фазам
- **Фаза 0:** заморозка минимума + рабочий прототип (текущий этап).
- **Фаза 1 (MVP):** докрутка механики.
- **Фаза 2:** дизайн-полиш.

## Дальше (фаза 1+): сборка APK
```
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Prototype" "com.example.prototype" --web-dir=dist
npm run build && npx cap add android && npx cap open android
```
