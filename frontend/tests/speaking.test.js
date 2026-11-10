import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeakingActions } from '../src/utils/speaking.js';
function setup() {
  let state = { speakingUsers:{} };
  const actions = createSpeakingActions(update => { state = {...state,...update(state)}; });
  return { actions, get:() => state.speakingUsers };
}
test('long speech stays highlighted until Discord sends stop', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const {actions,get}=setup();
  actions.startSpeaking('one');
  t.mock.timers.tick(60000);
  assert.equal(get().one,true);
  actions.stopSpeaking('one');
  assert.equal(get().one,undefined);
});
test('speakers are tracked independently and can speak again',()=>{
  const {actions,get}=setup();
  actions.startSpeaking('one');actions.startSpeaking('two');
  actions.startSpeaking('one');actions.stopSpeaking('one');
  assert.deepEqual(get(),{two:true});
  actions.startSpeaking('one');
  assert.deepEqual(get(),{two:true,one:true});
});
