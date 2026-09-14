// Self-contained falling-block game. Pure state helpers are exported for validation.
export const SHAPES = [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[2,0,0],[2,2,2],[0,0,0]], [[0,0,3],[3,3,3],[0,0,0]],
    [[4,4],[4,4]], [[0,5,5],[5,5,0],[0,0,0]],
    [[0,6,0],[6,6,6],[0,0,0]], [[7,7,0],[0,7,7],[0,0,0]]
];
const COLORS=['#111827','#72e4ef','#758df7','#fbb263','#ffe88b','#9be497','#db9aff','#f589a4'];
export function createGame(random = Math.random) {
    const game={board:Array.from({length:20},()=>Array(10).fill(0)),queue:[],piece:null,hold:null,held:false,score:0,lines:0,level:1,over:false,random};
    spawn(game);return game;
}
function refill(g) {
    while(g.queue.length<7){const bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=Math.floor(g.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}g.queue.push(...bag);}
}
function piece(type){return {type,matrix:SHAPES[type].map(row=>[...row]),x:type===3?4:3,y:0};}
function spawn(g,type){refill(g);g.piece=piece(type??g.queue.shift());refill(g);g.over=collides(g,g.piece);}
export function collides(g,p) {
    return p.matrix.some((row,y)=>row.some((v,x)=>v&&(p.x+x<0||p.x+x>=10||p.y+y>=20||(p.y+y>=0&&g.board[p.y+y][p.x+x]))));
}
export function movePiece(g,dx,dy) {if(g.over)return false;const next={...g.piece,x:g.piece.x+dx,y:g.piece.y+dy};if(collides(g,next))return false;g.piece=next;return true;}
export function rotatePiece(g) {
    if(g.over)return false;
    const m=g.piece.matrix,rotated=m[0].map((_,i)=>m.map(row=>row[i]).reverse());
    // Small wall/floor kicks. O piece does not need rotation.
    if(g.piece.type===3)return true;
    for(const [dx,dy] of [[0,0],[-1,0],[1,0],[-2,0],[2,0],[0,-1],[0,-2]]){
        const p={...g.piece,matrix:rotated,x:g.piece.x+dx,y:g.piece.y+dy};if(!collides(g,p)){g.piece=p;return true;}
    }return false;
}
export function lockPiece(g) {
    if(g.over)return;
    for(let y=0;y<g.piece.matrix.length;y++)for(let x=0;x<g.piece.matrix[y].length;x++){
        const v=g.piece.matrix[y][x];if(v){if(g.piece.y+y<0){g.over=true;return;}g.board[g.piece.y+y][g.piece.x+x]=v;}
    }
    const remaining=g.board.filter(row=>row.some(v=>!v)),count=20-remaining.length;
    while(remaining.length<20)remaining.unshift(Array(10).fill(0));g.board=remaining;
    g.score+=([0,100,300,500,800][count]||0)*g.level;g.lines+=count;g.level=1+Math.floor(g.lines/10);g.held=false;spawn(g);
}
export function hardDrop(g){if(g.over)return;let distance=0;while(movePiece(g,0,1))distance++;g.score+=distance*2;lockPiece(g);}
export function holdPiece(g){if(g.over||g.held)return false;const current=g.piece.type,previous=g.hold;g.hold=current;spawn(g,previous??undefined);g.held=true;return true;}
export function ghostPiece(g){const ghost={...g.piece};while(!collides(g,{...ghost,y:ghost.y+1}))ghost.y++;return ghost;}

export function mountTetris(c) {
    const {el,stage,button,bar,listen,say}=c;
    const cabinet=el('div','wx-tetris'),field=el('div','wx-tetris-field'),canvas=el('canvas'),side=el('aside','wx-tetris-side');
    canvas.width=300;canvas.height=600;canvas.setAttribute('aria-label','テトリスの盤面');canvas.setAttribute('role','img');
    cabinet.tabIndex=0;cabinet.setAttribute('aria-label','テトリス操作エリア');
    const overlay=el('div','wx-tetris-overlay','READY'),score=el('strong'),lines=el('strong'),level=el('strong'),best=el('strong');
    const next=el('canvas'),hold=el('canvas');next.width=120;next.height=240;hold.width=120;hold.height=70;next.setAttribute('aria-label','次の4ピース');hold.setAttribute('aria-label','ホールド');
    field.append(canvas,overlay);for(const [name,node] of [['SCORE',score],['LINES',lines],['LEVEL',level],['BEST',best],['HOLD / C',hold],['NEXT',next]])side.append(el('span','wx-micro',name),node);
    cabinet.append(field,side);let game=createGame(),running=false,started=false,elapsed=0,high=0;
    try{high=Number(localStorage.getItem('minus2-tetris-best'))||0;}catch{}
    const start=button('▶ START',()=>{if(game.over){game=createGame();started=false;}running=!running;started=true;elapsed=0;sync();cabinet.focus({preventScroll:true});});
    const reset=button('NEW GAME',()=>{game=createGame();running=false;started=false;elapsed=0;sync();});
    function cell(ctx,x,y,size,value,ghost=false){ctx.fillStyle=COLORS[value];ctx.globalAlpha=ghost?.25:1;ctx.fillRect(x+1,y+1,size-2,size-2);ctx.globalAlpha=1;if(!ghost){ctx.fillStyle='#ffffff55';ctx.fillRect(x+2,y+2,size-4,3);}}
    function drawPiece(ctx,p,size,ghost=false){p.matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v&&p.y+y>=0)cell(ctx,(p.x+x)*size,(p.y+y)*size,size,v,ghost);}));}
    function miniature(target,types){const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);types.forEach((type,i)=>{if(type===null)return;const p=piece(type);p.x=.6;p.y=i*3.2+.3;drawPiece(ctx,p,18);});}
    function sync(){const ctx=canvas.getContext('2d');ctx.fillStyle=COLORS[0];ctx.fillRect(0,0,300,600);ctx.strokeStyle='#ffffff0b';for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*30,0);ctx.lineTo(x*30,600);ctx.stroke();}for(let y=0;y<=20;y++){ctx.beginPath();ctx.moveTo(0,y*30);ctx.lineTo(300,y*30);ctx.stroke();}game.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)cell(ctx,x*30,y*30,30,v);}));if(!game.over){drawPiece(ctx,ghostPiece(game),30,true);drawPiece(ctx,game.piece,30);}score.textContent=String(game.score).padStart(6,'0');lines.textContent=game.lines;level.textContent=game.level;if(game.score>high){high=game.score;try{localStorage.setItem('minus2-tetris-best',String(high));}catch{}}best.textContent=high;miniature(next,game.queue.slice(0,4));miniature(hold,[game.hold]);overlay.hidden=running&&!game.over;overlay.textContent=game.over?'GAME OVER':started?'PAUSED':'READY';start.textContent=game.over?'↻ RETRY':running?'Ⅱ PAUSE':started?'▶ RESUME':'▶ START';if(game.over){running=false;say(`GAME OVER / SCORE ${game.score} / ${game.lines} LINES`);}canvas.setAttribute('aria-label',`盤面。スコア ${game.score}、消去ライン ${game.lines}、レベル ${game.level}`);}
    function action(key){if(!running||game.over)return;if(key==='left')movePiece(game,-1,0);if(key==='right')movePiece(game,1,0);if(key==='rotate')rotatePiece(game);if(key==='down'){if(movePiece(game,0,1))game.score++;else lockPiece(game);}if(key==='drop'){hardDrop(game);elapsed=0;}if(key==='hold')holdPiece(game);sync();}
    listen(cabinet,'keydown',e=>{const key={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',ArrowDown:'down',' ':'drop',c:'hold',C:'hold'}[e.key];if(key){e.preventDefault();if(e.repeat&&['drop','rotate','hold'].includes(key))return;action(key);}else if(e.key.toLowerCase()==='p'){e.preventDefault();if(!game.over){running=!running;started=true;sync();}}});
    // On-screen controls are real buttons, working with touch, keyboard and mouse.
    const controls=bar(...[['←','left'],['↻','rotate'],['→','right'],['↓','down'],['DROP','drop'],['HOLD','hold']].map(([label,key])=>button(label,()=>{action(key);cabinet.focus({preventScroll:true});})));
    stage.append(bar(start,reset),cabinet,controls);
    listen(document,'visibilitychange',()=>{if(document.hidden&&running){running=false;sync();}});
    c.interval(()=>{if(!running)return;elapsed+=50;if(elapsed>=Math.max(90,800*Math.pow(.82,game.level-1))){elapsed=0;if(!movePiece(game,0,1))lockPiece(game);sync();}},50);sync();
}
