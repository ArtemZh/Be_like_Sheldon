/**
 * Назви станцій, придатні для читання.
 *
 * У фіді поруч зі звичайними назвами трапляються службові хвости: код
 * оператора, номер об'єкта, номер платформи, напрямок зупинки —
 * «Benneckenstein Bek_Klb 001 P1», «Hegelsbergstraße Ri. Holländ. Straße».
 * У денному режимі це видно рідко, а на табло скрінсейвера — щохвилини.
 *
 * Чистимо лише хвіст і лише те, що впізнається однозначно: зіпсувати
 * справжню назву гірше, ніж лишити технічну.
 */

const TAILS = [
  /\s+P\d+$/i, // номер платформи: «… P4»
  /\s+Gl\.?\s*\d+$/i, // «Gleis 3»
  /\s+Bstg\.?\s*\d+$/i, // «Bahnsteig 2»
  /\s+[A-Za-zÄÖÜäöüß]{2,}_[A-Za-z0-9]+$/, // код оператора: «Bek_Klb»
  /\s+\d{3,}$/, // номер об'єкта: «001»
  /[,;]?\s+Ri(?:chtung)?\.?\s+.+$/i, // напрямок: «Ri. Holländ. Straße»
];

/** Прибрати службовий хвіст. Порядок не важливий — чистимо, доки чиститься. */
export function readableName(name) {
  if (typeof name !== 'string') return '';
  let out = name.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const tail of TAILS) {
      const short = out.replace(tail, '').trim();
      // Порожнє чи надто куце — значить, правило зʼїло саму назву.
      if (short !== out && short.length >= 3) {
        out = short;
        changed = true;
      }
    }
  }
  return out.replace(/[,;]$/, '').trim();
}
