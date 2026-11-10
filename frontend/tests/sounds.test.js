import test from 'node:test';
import assert from 'node:assert/strict';
import sounds from '../src/utils/sounds.js';

test('stopping audio cancels active and locked playback and permits later playback', () => {
  const clones = [];
  const previousAudio = globalThis.Audio;
  globalThis.Audio = class {
    load() {}
    cloneNode() {
      const audio = { currentTime:12, paused:false, addEventListener() {}, play() { return Promise.resolve(); }, pause() { this.paused = true; } };
      clones.push(audio);
      return audio;
    }
  };
  try {
    sounds.playKey('pass'); // Browser audio has not been unlocked yet.
    sounds.stopKey('pass');
    sounds.markUnlocked();
    assert.equal(clones.length, 0);
    sounds.playKey('pass');
    sounds.playKey('pass');
    sounds.playKey('lay_success');
    sounds.stopKey('pass');
    assert.ok(clones[0].paused && clones[1].paused);
    assert.equal(clones[0].currentTime, 0);
    assert.equal(clones[2].paused, false);
    sounds.playKey('pass');
    assert.equal(clones.length, 4);
    assert.equal(clones[3].paused, false);
  } finally {
    sounds.stopKey('pass');
    sounds.stopKey('lay_success');
    globalThis.Audio = previousAudio;
  }
});

test('skip stops and disconnects every active card sound source', () => {
  let stopped = 0;
  let disconnected = 0;
  const source = () => ({stop() { stopped++; }, disconnect() { disconnected++; }});
  sounds._cardSources.add(source());
  sounds._cardSources.add(source());
  sounds.stopCardFoley();
  assert.equal(stopped, 2);
  assert.equal(disconnected, 2);
  assert.equal(sounds._cardSources.size, 0);
});

test('legacy shuffle and deal keys cannot load the old recordings', () => {
  const original = globalThis.Audio;
  let loads = 0;
  globalThis.Audio = class { constructor() { loads++; } };
  try {
    sounds.playKey('deal');
    sounds.playKey('shuffle');
    assert.equal(sounds.getSoundUrl('deal'), null);
    assert.equal(sounds.getSoundUrl('shuffle'), null);
    assert.equal(loads, 0);
  } finally { globalThis.Audio = original; }
});
