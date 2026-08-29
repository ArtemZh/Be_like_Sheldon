/**
 * Завантаження бінарного розкладу.
 *
 * feed.bin — суцільний блоб із секціями, вирівняними на 4 байти; feed.meta.json
 * каже, де яка. Кожна секція читається типізованим масивом поверх того самого
 * ArrayBuffer, без копіювання.
 */

const LAYOUT = {
  patternPtr: ['patternPtr', Uint32Array],
  patternStops: ['patternStops', Uint16Array],
  patternTripPtr: ['patternTripPtr', Uint32Array],
  tripBlockStart: ['tripBlockStart', Uint32Array],
  tripArr: ['tripArr', Uint32Array],
  tripDep: ['tripDep', Uint32Array],
};

/** @returns фід у форматі, який їсть raptor.js */
export function decodeFeed(buffer, meta) {
  const feed = { nStops: meta.nStops, nPatterns: meta.nPatterns };
  for (const [field, [section, Type]] of Object.entries(LAYOUT)) {
    const { offset, count } = meta.sections[section];
    feed[field] = new Type(buffer, offset, count);
  }
  return feed;
}

export async function loadFeed(dataUrl) {
  const [meta, buffer] = await Promise.all([
    fetch(`${dataUrl}/feed.meta.json`).then((r) => {
      if (!r.ok) throw new Error(`feed.meta.json: ${r.status}`);
      return r.json();
    }),
    fetch(`${dataUrl}/feed.bin`).then((r) => {
      if (!r.ok) throw new Error(`feed.bin: ${r.status}`);
      return r.arrayBuffer();
    }),
  ]);
  return decodeFeed(buffer, meta);
}
