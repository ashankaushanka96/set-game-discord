import test from 'node:test';
import assert from 'node:assert/strict';
import {cardGestureMode} from '../src/components/game/cardGesture.js';

test('small finger movement remains a tap', () => {
  assert.equal(cardGestureMode(4,3,'touch',true),'pending');
});
test('an unselected card supports sideways hand scrolling in both directions', () => {
  assert.equal(cardGestureMode(25,3,'touch',false),'scroll');
  assert.equal(cardGestureMode(-25,3,'touch',false),'scroll');
});
test('a selected card can start dragging horizontally without scrolling the hand', () => {
  assert.equal(cardGestureMode(25,3,'touch',true),'drag');
  assert.equal(cardGestureMode(-25,3,'touch',true),'drag');
});
test('upward dragging and mouse dragging start a pass', () => {
  assert.equal(cardGestureMode(2,-25,'touch',false),'drag');
  assert.equal(cardGestureMode(25,2,'mouse',false),'drag');
});
