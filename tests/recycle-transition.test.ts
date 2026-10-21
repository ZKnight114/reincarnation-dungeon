import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { recyclingFlight } from '../src/recycle-transition';

test('each equipment flies one centred point and sounds exactly once on arrival; cancellation is silent', () => {
  const previousDocument = globalThis.document;
  const w = new Window();
  Object.assign(globalThis, { document: w.document });
  const sources = Array.from({ length: 3 }, () => w.document.createElement('div'));
  const target = w.document.createElement('button');
  w.document.body.append(...sources, target);
  let arrivals = 0;
  const flight = recyclingFlight(
    sources as unknown as Element[],
    target as unknown as Element,
    false,
    () => arrivals++,
  );
  try {
    const dots = [...w.document.querySelectorAll('.loot-reclaim-layer i')];
    assert.equal(dots.length, 3);
    assert.equal(flight.duration, 700);
    assert.notEqual(
      (dots[0] as unknown as HTMLElement).style.animationDelay,
      (dots[1] as unknown as HTMLElement).style.animationDelay,
    );
    dots[0].dispatchEvent(new w.Event('animationend'));
    dots[0].dispatchEvent(new w.Event('animationend'));
    assert.equal(arrivals, 1);
    dots[1].dispatchEvent(new w.Event('animationend'));
    assert.equal(arrivals, 2);
    flight.cleanup();
    dots[2].dispatchEvent(new w.Event('animationend'));
    assert.equal(arrivals, 2);
    assert.equal(w.document.querySelector('.loot-reclaim-layer'), null);
    assert.ok(sources.every((source) => !source.classList.contains('loot-dissolving')));
  } finally {
    flight.cleanup();
    Object.assign(globalThis, { document: previousDocument });
    w.happyDOM.close();
  }
});
