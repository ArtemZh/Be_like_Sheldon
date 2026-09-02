/**
 * Дзеркало карти для прихованої сторінки.
 *
 * У скрінсейвері macOS WebKit не оновлює на екрані шар WebGL: карта
 * малюється, але її кадр нікуди не потрапляє. Звичайні елементи при цьому
 * малюються нормально, тож копіюємо кадр карти у 2D-полотно поверх неї.
 */

/** Створює (за потреби) полотно-дзеркало поруч із полотном карти. */
export function ensureMirror(source, doc = globalThis.document) {
  if (!source || !source.parentNode) return null;
  let mirror = source.parentNode.querySelector('canvas[data-mirror]');
  if (mirror == null) {
    mirror = doc.createElement('canvas');
    mirror.dataset.mirror = 'map';
    mirror.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    source.parentNode.appendChild(mirror);
  }
  if (mirror.width !== source.width || mirror.height !== source.height) {
    mirror.width = source.width;
    mirror.height = source.height;
  }
  return mirror;
}

/** Переносить кадр карти у дзеркало. Повертає false, якщо переносити нічого. */
export function mirrorFrame(source, doc = globalThis.document) {
  const mirror = ensureMirror(source, doc);
  if (mirror == null || source.width === 0) return false;
  const context = mirror.getContext('2d');
  if (context == null) return false;
  context.clearRect(0, 0, mirror.width, mirror.height);
  context.drawImage(source, 0, 0);
  // Прихованій сторінці WebKit перемальовує текст, але не полотно: без цього
  // поштовху на екрані назавжди лишається найперший кадр карти.
  mirror.style.opacity = mirror.style.opacity === '1' ? '0.999' : '1';
  return true;
}
