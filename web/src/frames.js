/**
 * Кадри там, де requestAnimationFrame мовчить.
 *
 * У скрінсейвері macOS сторінка живе всередині вікна, яке WebKit вважає
 * невидимим: таймери працюють, а rAF після першого кадру глухне назавжди.
 * Тому кадри веде таймер, щойно `document.hidden` стає істиною, і той самий
 * код однаково працює у звичайній вкладці.
 */

const RATE = 1000 / 30;

/** Чи ховається сторінка від rAF (у тестах document може бути відсутній). */
export function hidden(doc = globalThis.document) {
  return Boolean(doc && doc.hidden);
}

/**
 * Замовляє наступний кадр. Повертає ідентифікатор, який розуміє `cancelFrame`.
 * Прихована сторінка отримує кадр від таймера, видима — від rAF.
 */
export function nextFrame(callback, doc = globalThis.document) {
  if (hidden(doc)) {
    return { timer: setTimeout(() => callback(performance.now()), RATE) };
  }
  return { raf: requestAnimationFrame(callback) };
}

/** Скасовує замовлений кадр незалежно від того, звідки він мав прийти. */
export function cancelFrame(handle) {
  if (!handle) return;
  if (handle.timer !== undefined) clearTimeout(handle.timer);
  if (handle.raf !== undefined) cancelAnimationFrame(handle.raf);
}
