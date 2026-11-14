// Entry point.
import { Game } from './game';

declare const __BUILD_TIME__: string;

function boot(): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLDivElement;
  const bootEl = document.getElementById('boot');
  try {
    const game = new Game(canvas, ui);
    (window as any).__crest = game;
    game.start().then(() => bootEl?.remove());
  } catch (e) {
    console.error(e);
    if (bootEl) {
      bootEl.textContent = 'This game needs WebGL2. ' + (e as Error).message;
      bootEl.style.letterSpacing = '0';
    }
  }
}
void __BUILD_TIME__;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
