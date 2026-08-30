/**
 * Демо-екскурсія по трьох режимах.
 *
 * Кроки лежать даними: що підсвітити і в якому режимі. Тексти — у
 * strings.js під ключами `tour.<id>.title` і `tour.<id>.text`; логіка показу
 * — у map.js, бо їй потрібні DOM і карта.
 */

export const STEPS = [
  { id: 'params', mode: 'day', target: '#panel' },
  { id: 'map', mode: 'day', target: '#map', action: 'demoRoute' },
  { id: 'timeline', mode: 'day', target: '#timeline' },
  { id: 'routes', mode: 'sheldon', target: '#story-routes' },
  { id: 'sections', mode: 'sheldon', target: '#story-sections' },
  { id: 'board', mode: 'screen', target: '#screen-clock' },
  { id: 'dots', mode: 'screen', target: '.screen-figures' },
  { id: 'settings', mode: 'screen', target: '#screen-settings' },
];

/**
 * Де поставити картку відносно підсвіченого прямокутника.
 *
 * Правило просте: беремо той бік, де більше вільного місця, але знизу й
 * зверху місця треба менше, ніж збоку — картка вузька й висока.
 */
export function placeCard(rect, viewport, card = { width: 320, height: 190 }) {
  const gap = 16;
  const below = viewport.height - rect.bottom;
  const above = rect.top;
  const right = viewport.width - rect.right;
  const left = rect.left;

  if (below >= card.height + gap) return { side: 'bottom', top: rect.bottom + gap, left: clampLeft(rect, viewport, card) };
  if (above >= card.height + gap) return { side: 'top', top: rect.top - card.height - gap, left: clampLeft(rect, viewport, card) };
  if (right >= card.width + gap) return { side: 'right', left: rect.right + gap, top: clampTop(rect, viewport, card) };
  if (left >= card.width + gap) return { side: 'left', left: rect.left - card.width - gap, top: clampTop(rect, viewport, card) };

  // нікуди не влазить — кладемо по центру екрана без стрілки
  return {
    side: 'center',
    left: (viewport.width - card.width) / 2,
    top: (viewport.height - card.height) / 2,
  };
}

function clampLeft(rect, viewport, card) {
  const wanted = rect.left + rect.width / 2 - card.width / 2;
  return Math.max(16, Math.min(wanted, viewport.width - card.width - 16));
}

function clampTop(rect, viewport, card) {
  const wanted = rect.top + rect.height / 2 - card.height / 2;
  return Math.max(16, Math.min(wanted, viewport.height - card.height - 16));
}
