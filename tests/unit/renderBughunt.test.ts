import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAPS, resolveEnvironment, type TimeOfDay, type Weather } from '../../src/data/maps';
import { nightHaze } from '../../src/render/world/backdrop';

/** Regressions found by the render bug hunt. */
describe('backdrop at night', () => {
  const haze = (map: (typeof MAPS)[number], time: TimeOfDay, weather: Weather) => nightHaze(new THREE.Color(resolveEnvironment(map.id, time, weather).fog.color));

  it('pushes the unlit mountain ranges into the dark fog at night (snow caps used to glow white)', () => {
    for (const map of MAPS) {
      if (!map.times.includes('night')) continue;
      for (const weather of map.weathers) expect(haze(map, 'night', weather)).toBeGreaterThan(0.6);
    }
  });

  it('snowfall does not turn the night fog into a bright white wall', () => {
    const lum = (c: string) => {
      const col = new THREE.Color(c);
      return 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    };
    const night = lum(resolveEnvironment('snow', 'night', 'snow').fog.color);
    const sunset = lum(resolveEnvironment('snow', 'sunset', 'snow').fog.color);
    const day = lum(resolveEnvironment('snow', 'day', 'snow').fog.color);
    expect(night).toBeLessThan(0.05);
    expect(night).toBeLessThan(sunset);
    expect(sunset).toBeLessThan(day);
  });

  it('leaves dawn, day and dusk ranges alone', () => {
    for (const map of MAPS) {
      for (const time of map.times) {
        if (time === 'night') continue;
        expect(haze(map, time, map.weathers[0]), `${map.id} ${time}`).toBeLessThan(0.2);
      }
    }
  });
});
