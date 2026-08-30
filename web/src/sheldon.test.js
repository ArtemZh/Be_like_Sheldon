import { describe, expect, it } from 'vitest';
import { STRINGS } from './strings.js';
import {
  LOOP,
  PLACES,
  REAL,
  ROUTES,
  SECTIONS,
  loopGeojson,
  placesGeojson,
  realGeojson,
  routeBounds,
  stopsGeojson,
  walkGeojson,
} from './sheldon.js';

const ROUTE_IDS = ROUTES.map((r) => r.id);

describe('маршрут Шелдона', () => {
  it('кожен розділ належить наявному маршруту й має тексти', () => {
    for (const section of SECTIONS) {
      expect(ROUTE_IDS).toContain(section.route);
      expect(STRINGS[`story.${section.id}.title`]).toBeDefined();
      expect(STRINGS[`story.${section.id}.text`]).toBeDefined();
    }
  });

  it('у кожного маршруту є назва, підпис і мітка', () => {
    for (const id of ROUTE_IDS) {
      for (const part of ['title', 'summary', 'meta']) {
        expect(STRINGS[`story.route.${id}.${part}`]).toBeDefined();
      }
    }
  });

  it('у кожного маршруту є свій розділ', () => {
    for (const id of ROUTE_IDS) {
      expect(SECTIONS.some((s) => s.route === id)).toBe(true);
    }
  });

  it('кільце замкнене й проходить через проміжні станції, а не хордами', () => {
    expect(LOOP[0]).toBe(LOOP[LOOP.length - 1]);
    for (const id of LOOP) expect(PLACES[id]).toBeDefined();
    const line = loopGeojson().features[0].geometry.coordinates;
    // на кожен опорний вокзал припадає десяток проміжних станцій
    expect(line.length).toBeGreaterThan(LOOP.length * 5);
    expect(line[0]).toEqual(line[line.length - 1]);
  });

  it('реальна поїздка — дві лінії, кожна по станціях мережі', () => {
    const features = realGeojson().features;
    expect(features).toHaveLength(REAL.length);
    for (const feature of features) {
      expect(feature.geometry.coordinates.length).toBeGreaterThan(2);
    }
    for (const { from, to } of REAL) {
      expect(PLACES[from]).toBeDefined();
      expect(PLACES[to]).toBeDefined();
    }
  });

  it('дорога пішки йде по дорогах, а не по прямій', () => {
    const path = walkGeojson().features[0].geometry.coordinates;
    expect(path.length).toBeGreaterThan(10);
    expect(path[0]).not.toEqual(path[path.length - 1]);
  });

  it('кожен маршрут підсвічує свої станції', () => {
    const active = (route) =>
      placesGeojson(route).features.filter((f) => f.properties.active).length;
    expect(active('walk')).toBe(2);
    expect(active('real')).toBe(3);
    expect(active('planned')).toBe(5);
  });

  it('рамка маршруту охоплює його точки', () => {
    for (const id of ROUTE_IDS) {
      const [[minLon, minLat], [maxLon, maxLat]] = routeBounds(id);
      expect(maxLon).toBeGreaterThan(minLon);
      expect(maxLat).toBeGreaterThan(minLat);
    }
  });
});

describe('зупинки маршруту', () => {
  it('кільце показує всі проміжні станції, а не лише вокзали', () => {
    const stops = stopsGeojson('planned').features;
    expect(stops.length).toBeGreaterThan(50);
    expect(stops.every((f) => f.properties.name.length > 0)).toBe(true);
  });

  it('реальна поїздка бере станції обох ліній без повторів', () => {
    const names = stopsGeojson('real').features.map((f) => f.properties.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('у пішого маршруту станцій немає', () => {
    expect(stopsGeojson('walk').features).toHaveLength(0);
  });
});
