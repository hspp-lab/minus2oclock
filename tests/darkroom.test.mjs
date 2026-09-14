import test from 'node:test';
import assert from 'node:assert/strict';
import {createDarkRoom,darkRoomAction,clearStamp} from '../script/worlds-darkroom.js';
const base=(extra={})=>({...createDarkRoom(),turns:1,room:3,score:6,...extra});
test('initial zero is safe; only first collection receives +3..5',()=>{
 const s=createDarkRoom();assert.equal(s.phase,'playing');assert.equal(darkRoomAction(s,'forward'),null);assert.equal(darkRoomAction(s,'back'),null);
 for(const [r,expected]of [[0,3],[.4,4],[.99,5]]){const out=darkRoomAction(s,'collect',()=>r);assert.equal(out.state.score,expected);assert.equal(out.state.room,1);assert.equal(s.score,0);}
});
test('collection has exactly ten outcomes and no additional advance roll',()=>{
 const deltas=[];for(let i=0;i<10;i++){let calls=0;const out=darkRoomAction(base(),'collect',()=>{calls++;return(i+.1)/10;});assert.equal(calls,1);assert.equal(out.state.room,4);deltas.push(out.delta);}assert.deepEqual(deltas,[-5,-4,-3,-2,-1,1,2,3,4,5]);
});
test('back stops at room one, revisits can collect, no immunity',()=>{
 const out=darkRoomAction(base({room:2,score:3}),'back');assert.equal(out.state.room,1);assert.equal(out.state.score,2);assert.equal(darkRoomAction(out.state,'back'),null);
 assert.equal(darkRoomAction(out.state,'collect',()=>0).state.phase,'dead');
 assert.equal(darkRoomAction(base({room:2,score:1}),'back').state.phase,'dead');
});
test('arrival is not exit; final choice cannot return or exceed room count',()=>{
 const arrival=darkRoomAction(base({room:7,score:9}),'forward',()=>.5).state;assert.equal(arrival.room,8);assert.equal(arrival.phase,'playing');assert.equal(darkRoomAction(arrival,'back'),null);
 const exit=darkRoomAction(arrival,'forward',()=>0).state;assert.equal(exit.room,8);assert.equal(exit.score,8);assert.equal(exit.phase,'cleared');assert.equal(darkRoomAction(exit,'collect'),null);
});
test('final choice distinguishes death, failure, success, with death first',()=>{
 assert.equal(darkRoomAction(base({room:8,score:1}),'forward',()=>0).state.phase,'dead');
 assert.equal(darkRoomAction(base({room:8,score:8}),'forward',()=>0).state.phase,'failed');
 assert.equal(darkRoomAction(base({room:8,score:3}),'collect',()=>.99).state.phase,'cleared');
 assert.equal(darkRoomAction(base({room:7,score:1}),'forward',()=>0).state.phase,'dead');
});
test('configuration limits and local clear timestamp',()=>{
 for(const n of [0,3,21,NaN,8.5])assert.throws(()=>createDarkRoom(n,8),RangeError);
 assert.equal(clearStamp(new Date(2026,0,2,3,4,5)),'20260102030405');
});

import { darkRoomNumbers, darkRoomLogParts, darkRoomRunSettings } from '../script/worlds-darkroom.js';
test('each hidden denominator is masked independently, then revealed on the same snapshot',()=>{
 const entry={turn:3,action:'collect',delta:3,roomDelta:1,score:7,room:3};
 for(const showTarget of [true,false])for(const showRooms of [true,false]){
  const run={target:8,rooms:12,showTarget,showRooms};
  const active=darkRoomLogParts(entry,run);
  assert.equal(active.prefix+active.delta+'  COR '+active.corDelta+active.suffix,`#ACT_003 収集 PT +3  COR +1 | PT 7 / ${showTarget?8:'?'} | COR 3 / ${showRooms?12:'?'} |`);
  const ended=darkRoomLogParts(entry,run,true);
  assert.equal(ended.prefix+ended.delta+'  COR '+ended.corDelta+ended.suffix,'#ACT_003 収集 PT +3  COR +1 | PT 7 / 8 | COR 3 / 12 |');
  assert.deepEqual(darkRoomNumbers(entry,run,true),{pt:'7/8',cor:'3/12'});
  assert.equal(entry.score,7);assert.equal(entry.room,3);
 }
});
test('zero and negative deltas retain explicit console notation',()=>{
 const run={target:8,rooms:8,showTarget:true,showRooms:true};
 assert.equal(darkRoomLogParts({turn:2,action:'forward',delta:0,score:4,room:2},run).delta,'±0');
 assert.equal(darkRoomLogParts({turn:3,action:'back',delta:-1,score:3,room:1},run).delta,'-1');
});
test('retry rerolls only hidden fields; a normal start uses the already selected values',()=>{
 for(const showTarget of [true,false])for(const showRooms of [true,false]){
  const settings={target:8,rooms:9,showTarget,showRooms};let calls=0;
  const rng=()=>{calls++;return .99;};
  assert.deepEqual(darkRoomRunSettings(settings,false,rng),settings);assert.equal(calls,0);
  const retry=darkRoomRunSettings(settings,true,rng);
  assert.equal(retry.target,showTarget?8:20);assert.equal(retry.rooms,showRooms?9:20);
  assert.equal(calls,Number(!showTarget)+Number(!showRooms));
  assert.deepEqual(settings,{target:8,rooms:9,showTarget,showRooms});
 }
});

import { chooseDarkRoomLine } from '../script/worlds-darkroom.js';
test('dialogue arrays accept added choices, empty lists and missing settings',()=>{
 const config={start:['first',null,'second','third'],playing:[]};
 assert.equal(chooseDarkRoomLine(config,'start',()=>0),'first');
 assert.equal(chooseDarkRoomLine(config,'start',()=>.5),'second');
 assert.equal(chooseDarkRoomLine(config,'start',()=>.99),'third');
 assert.equal(chooseDarkRoomLine(config,'playing'),'');
 assert.equal(chooseDarkRoomLine(undefined,'cleared'),'');
});

test('log reports actual corridor movement including final verdict with no movement',()=>{
 const run={target:8,rooms:8,showTarget:true,showRooms:true};
 for(const [room,action,expected] of [[3,'forward',1],[3,'back',-1],[3,'collect',1],[8,'forward',0],[8,'collect',0]]){
  const result=darkRoomAction({...createDarkRoom(),score:10,room,turns:3},action,()=>.9);
  assert.equal(result.roomDelta,expected);
  const parts=darkRoomLogParts({turn:4,action,delta:result.delta,roomDelta:result.roomDelta,score:result.state.score,room:result.state.room},run);
  assert.equal(parts.corDelta,expected>0?'+1':expected<0?'-1':'±0');
 }
});
