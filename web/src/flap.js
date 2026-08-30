/**
 * Механічне табло: літери «пробігають» алфавіт, поки не стануть на місце.
 *
 * Розділено на дві частини навмисно: `flapFrame` — чиста функція одного
 * кадру (її і тестуємо), `flapText` — тонка обгортка над rAF, яка пише в DOM.
 */

// Тільки латиниця й цифри: у моноширинному шрифті вони гарантовано однієї
// ширини, а кирилиця в запасних шрифтах системи — вже ні.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DIGITS = '0123456789';

/**
 * Числовий рядок крутить лише цифри.
 *
 * Літери в пропорційному шрифті ширші за цифри, тому «Ж» на місці «0»
 * розсовувала б рядок і зсувала підпис поруч — саме те, чого табло не
 * має робити.
 */
export function alphabet(target) {
  return /^[\d\s:.,\-–—]*$/.test(target) ? DIGITS : GLYPHS;
}

/** Пробіли й пунктуація не крутяться — інакше рядок читається як шум. */
function isStatic(ch) {
  return !/[\p{L}\p{N}]/u.test(ch);
}

/**
 * Кадр анімації переходу з `from` у `target`.
 *
 * Кожен символ крутиться `spin` кадрів, сусідні стартують із зсувом
 * `stagger` — звідси хвиля зліва направо. Символи, черга яких ще не
 * дійшла, показують старе значення, а не порожнечу: інакше рядок
 * схлопувався б і тягнув за собою підпис поруч.
 *
 * Довжина кадру — не менша за довшу з двох, тому сусідній текст не
 * рухається, поки табло крутиться.
 */
export function flapFrame(target, frame, { stagger = 2, spin = 7, rand = Math.random, from = '' } = {}) {
  const glyphs = alphabet(target);
  const width = Math.max(target.length, from.length);
  let out = '';
  for (let i = 0; i < width; i += 1) {
    const ch = target[i] ?? '';
    const start = i * stagger;
    if (ch === '') {
      // за межами цілі крутити нічого: хвіст довшого попереднього рядка
      // гасимо пробілом, а не випадковими літерами
      out += ' ';
    } else if (frame >= start + spin) {
      out += ch;
    } else if (frame < start) {
      out += from[i] ?? ' ';
    } else if (isStatic(ch) && ch !== '') {
      out += ch;
    } else {
      out += glyphs[Math.floor(rand() * glyphs.length)];
    }
  }
  return out;
}

/** Скільки кадрів триває повний перехід. */
export function flapDuration(target, { stagger = 2, spin = 7, from = '' } = {}) {
  const width = Math.max(target.length, from.length);
  return width === 0 ? 0 : (width - 1) * stagger + spin;
}

/**
 * Заповнювач — рядок із самих прочерків (і розділювачів у годиннику).
 *
 * Прочерки не крутяться ніколи: вони вміють лише зникнути або поступитись
 * текстом. Тому такий рядок і ставиться, і зникає миттєво.
 */
export function isFiller(text) {
  return /-/.test(text) && /^[\s:.\-–—]+$/.test(text);
}

const running = new WeakMap();

/**
 * Прокрутити вміст вузла до `text`. Повторний виклик скасовує попередню
 * анімацію того самого вузла — миша ходить швидше за табло.
 */
export function flapText(node, text, options = {}) {
  const previous = running.get(node);
  if (previous) cancelAnimationFrame(previous);

  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || node.textContent === text || isFiller(text)) {
    node.textContent = text;
    return;
  }

  // Прочерки з попереднього вмісту гаснуть на нульовому кадрі: вони не
  // беруть участі в анімації, лише тримали місце.
  const from = (options.from ?? node.textContent).replace(/[-–—]/g, ' ');
  const settings = { ...options, from };
  const total = flapDuration(text, settings);
  const step = options.frameMs ?? 34;
  let frame = 0;
  let last = 0;

  const tick = (now) => {
    if (now - last >= step) {
      last = now;
      node.textContent = flapFrame(text, frame, settings);
      frame += 1;
    }
    if (frame <= total) {
      running.set(node, requestAnimationFrame(tick));
    } else {
      node.textContent = text;
      running.delete(node);
    }
  };
  running.set(node, requestAnimationFrame(tick));
}

/**
 * Розкласти текст рівно на `count` рядків заданої ширини.
 *
 * Ширину міряє інжектований предикат `fits` — сам модуль нічого не знає
 * ні про шрифт, ні про DOM, тому логіка переносу перевіряється тестами.
 * Рядки, на які тексту не вистачило, лишаються порожніми: чим їх
 * заповнити, вирішує викликач. Що не влізло — обрізаємо трикрапкою.
 */
export function wrapLines(text, fits, count = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate) || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  while (lines.length < count) lines.push('');

  const out = lines.slice(0, count);
  const overflow = lines.length > count;
  if (overflow || !fits(out[count - 1])) {
    let last = out[count - 1];
    while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
    out[count - 1] = `${last}…`;
  }
  return out;
}
