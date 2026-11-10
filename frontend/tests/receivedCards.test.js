import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeReceivedCards,removePassedCards} from '../src/components/game/receivedCards.js';
const a={suit:'hearts',rank:'2'},b={suit:'hearts',rank:'3'},c={suit:'spades',rank:'A'};
test('sequential single passes create the same fan as a multi-card pass',()=>{
  let fan=[];for(const card of [a,b,c])fan=mergeReceivedCards(fan,[card]);
  assert.deepEqual(fan,mergeReceivedCards([],[a,b,c]));
});
test('overlapping passes do not duplicate cards',()=>assert.deepEqual(mergeReceivedCards([a,b],[b,c]),[a,b,c]));
test('passing cards onward removes them from the received fan without losing others',()=>assert.deepEqual(removePassedCards([a,b,c],[b]),[a,c]));
