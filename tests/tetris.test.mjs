// Run: node --test tests/tetris.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, SHAPES, movePiece, rotatePiece, lockPiece, hardDrop, holdPiece, ghostPiece, collides} from '../script/worlds-tetris.js';
test('seven-bag, dimensions and independent rows',()=>{
 const g=createGame();assert.equal(g.board.length,20);assert.equal(g.board[0].length,10);
 assert.equal(new Set([g.piece.type,...g.queue.slice(0,6)]).size,7);
 g.board[0][0]=1;assert.equal(g.board[1][0],0);
});
test('piece cannot cross walls; rotation remains valid',()=>{
 const g=createGame();while(movePiece(g,-1,0)){}assert.equal(movePiece(g,-1,0),false);
 rotatePiece(g);assert.equal(collides(g,g.piece),false);
 while(movePiece(g,1,0)){}assert.equal(movePiece(g,1,0),false);
});
test('ghost predicts hard drop and does not mutate active piece',()=>{
 const g=createGame(),before={...g.piece},ghost=ghostPiece(g);
 assert.equal(g.piece.y,before.y);assert.equal(collides(g,ghost),false);
 assert.ok(collides(g,{...ghost,y:ghost.y+1}));hardDrop(g);
 assert.equal(g.board.flat().filter(Boolean).length,4);assert.equal(g.score,ghost.y*2);
});
test('hold once per piece, then unlock after landing',()=>{
 const g=createGame(),type=g.piece.type;assert.ok(holdPiece(g));assert.equal(g.hold,type);
 assert.equal(holdPiece(g),false);hardDrop(g);assert.ok(holdPiece(g));assert.equal(g.piece.type,type);
});
test('four-line clear and level-up scoring',()=>{
 const g=createGame();g.lines=6;
 for(let y=16;y<20;y++)g.board[y]=Array.from({length:10},(_,x)=>x===4?0:2);
 g.piece={type:0,matrix:[[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],x:2,y:16};
 lockPiece(g);assert.equal(g.lines,10);assert.equal(g.level,2);assert.equal(g.score,800);
 assert.equal(g.board.flat().filter(Boolean).length,0);
});
test('blocked spawn ends game; further input cannot change it',()=>{
 const g=createGame();g.board[0].fill(2);g.board[1].fill(2);holdPiece(g);
 assert.equal(g.over,true);const saved=JSON.stringify(g.board);hardDrop(g);assert.equal(movePiece(g,1,0),false);assert.equal(JSON.stringify(g.board),saved);
});
test('many random games preserve the board and never lock out of bounds',()=>{
 for(let i=0;i<30;i++){const g=createGame();for(let n=0;n<200&&!g.over;n++){for(let r=0;r<n%4;r++)rotatePiece(g);for(let x=0;x<n%6;x++)movePiece(g,n%2?1:-1,0);hardDrop(g);assert.equal(g.board.length,20);assert.ok(g.board.every(row=>row.length===10&&row.every(v=>v>=0&&v<=7)));}}
});
