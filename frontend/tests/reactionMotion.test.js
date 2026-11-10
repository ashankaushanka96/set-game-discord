import test from 'node:test';
import assert from 'node:assert/strict';
import { reactionMotion } from '../src/components/game/reactionMotion.js';
test('hammer faces its target for left, right and vertical throws', () => {
  const right = reactionMotion('🔨',{x:100,y:100},{x:500,y:100});
  const left = reactionMotion('🔨',{x:500,y:100},{x:100,y:100});
  assert.equal(right.direction,1);
  assert.equal(left.direction,-1);
  assert.match(right.frames.at(-1).transform,/rotate\(45deg\)/);
  assert.match(left.frames.at(-1).transform,/rotate\(225deg\)/);
  assert.equal(reactionMotion('🔨',{x:0,y:0},{x:0,y:100}).angle,90);
});
test('reaction types have distinct flight paths and durations', () => {
  const from={x:100,y:300},to={x:500,y:300};
  const tomato=reactionMotion('🍅',from,to), bolt=reactionMotion('⚡',from,to), heart=reactionMotion('❤️',from,to);
  assert.ok(bolt.duration<tomato.duration);
  assert.notEqual(tomato.frames[8].transform,heart.frames[8].transform);
  assert.match(tomato.frames.at(-1).transform,/translate3d\(500px,300px,0\)/);
});
