// Secret worlds: DOM-only experiences. No dependencies or remote data.
// Each mount owns its listeners/timers. Calling dispose tears down the whole world.
import { mountTetris } from './worlds-tetris.js';
import { mountDarkRoom } from './worlds-darkroom.js';
// 実装済みの体験ID。表示文言はsettings.jsのsecret.pagesで管理する。
export const WORLD_IDS = [...Array.from({ length: 20 }, (_, i) => i + 1), 88, 99];
export const isWorldPattern = value => WORLD_IDS.includes(value);
export function code(seed, length = 7) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let n = Math.imul(seed + 1, 19349663), out = '';
    for (let i = 0; i < length; i++) { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; out += alphabet[(n >>> 0) % 36]; }
    return out;
}
// Each image advances one minute; the rightmost frame is always −02:00.
export function timelineTime(index, count) {
    const minutes=120+Math.max(0,count-1-index);
    return `−${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
}
function el(tag, className = '', text = '') {
    const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
export function mountWorld(root, pattern, files, changeWorld, pages = {}) {
    const abort = new AbortController(), cleanups = [];
    const listen = (node, event, fn, options = {}) => node.addEventListener(event, fn, { ...options, signal: abort.signal });
    const button = (text, fn, className = '') => { const b = el('button', `wx-button ${className}`, text); b.type = 'button'; listen(b, 'click', fn); return b; };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bar = (...items) => { const b = el('div', 'wx-controls'); b.append(...items); return b; };
    const status = el('p', 'wx-status'); status.setAttribute('role', 'status');
    const say = text => { status.textContent = text; };
    const wrap = n => ((n % files.length) + files.length) % files.length;
    function photo(index, className = '', full = false) {
        const n = wrap(index), img = el('img', `wx-photo ${className}`);
        const original = files[n];
        img.alt = `写真 ${String(n + 1).padStart(3, '0')}`; img.loading = 'lazy'; img.decoding = 'async';
        if (original) {
            img.src = full ? original : original.replace(/\/([^/]+)$/, '/vw/$1');
            listen(img, 'error', () => { if (img.getAttribute('src') !== original) img.src = original; });
        }
        img.draggable = false; return img;
    }
    function slider(label, min, max, value, fn, step = 1) {
        const group = el('label', 'wx-slider'), text = el('span', '', label), input = el('input');
        input.type = 'range'; Object.assign(input, { min, max, value, step });
        listen(input, 'input', () => fn(Number(input.value))); group.append(text, input); return group;
    }
    function interval(fn, ms) { const id = setInterval(() => { if (!document.hidden) fn(); }, ms); cleanups.push(() => clearInterval(id)); return id; }
    function later(fn, ms) { const id = setTimeout(fn, reduced ? Math.min(ms, 300) : ms); cleanups.push(() => clearTimeout(id)); }
    function shuffle(list) { const copy = [...list]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
    const stage = el('div', 'wx-stage');
    root.classList.add('wx'); root.dataset.pattern = pattern;
    const page = pages[pattern] || {};
    const mast = el('header', 'wx-mast'), identity = el('div', 'wx-identity');
    identity.append(el('span', 'wx-kicker', `−02:00 / ${String(pattern).padStart(2, '0')}`), el('h1', '', page.title ?? code(pattern * 71)));
    const select = el('select', 'wx-select'); select.setAttribute('aria-label', '体験を切り替える');
    for (const id of WORLD_IDS) { const option = el('option', '', pages[id]?.select_label ?? String(id).padStart(2, '0')); option.value = String(id); select.append(option); }
    select.value = String(pattern); listen(select, 'change', () => changeWorld(Number(select.value)));
    if (pattern === 88) {
        mast.append(select);
        status.hidden = true;
    } else mast.append(identity, select);
    root.append(mast, stage, status);
    const hint = text => stage.append(el('p', 'wx-hint', text));
    if (page.description && pattern !== 88) hint(page.description);
    const heading = (subtitle = '') => { const h = el('div', 'wx-title'); h.append(el('h2', '', code(pattern * 97, 9)), el('span', '', subtitle || code(pattern * 83, 16))); stage.append(h); };
    const ctx = { darkroomConfig: page.darkroom_config, pageTitle: page.title, el, listen, button, bar, say, slider, interval, later, photo, hint, heading, wrap, shuffle, stage, files, cleanups, reduced };
    if (pattern === 99) mountTetris(ctx);
    else if (pattern === 88) mountDarkRoom(ctx);
    else if (!files.length) hint('有効なギャラリーに写真がありません。');
    else builders[pattern](ctx);
    return () => { abort.abort(); for (const cleanup of cleanups.reverse()) cleanup(); };
}

const builders = {
    // 01 / Risograph poster press: photo and oversized type become a single print.
    1(c) {
        const {el, stage, photo, button, bar, slider, wrap} = c;
        
        let index = 0; const poster = el('article', 'wx-print'), title = el('h2', '', code(18, 9));
        const image = el('div', 'wx-print-image'); image.append(photo(index));
        poster.append(el('span', 'wx-micro', code(300, 20)), title, image, el('p', 'wx-print-bottom', code(401, 14)));
        const update = delta => { index = wrap(index + delta); image.replaceChildren(photo(index)); title.textContent = code(index + 18, 9); };
        c.listen(image, 'click', () => poster.classList.toggle('original'));
        stage.append(bar(button('← 前の版', () => update(-1)), button('次の版 →', () => update(1)), button('BLUE', () => poster.style.setProperty('--ink', '#234bbb')), button('GREEN', () => poster.style.setProperty('--ink', '#34704a')), button('RUST', () => poster.style.setProperty('--ink', '#a24b2c')), slider('網点', 0, 70, 22, v => poster.style.setProperty('--dots', v / 100))), poster);
    },
    // 02 / A visual record player. Playback advances photographs, no fake audio.
    2(c) {
        const {el, stage, photo, button, bar, wrap, interval, slider} = c;
        
        let index = 0, playing = false, elapsed = 0; const deck = el('div', 'wx-player'), cover = el('div', 'wx-cover'), info = el('h2'), progress = el('progress'); progress.max = 100;
        const play = button('▶ 再生', () => { playing = !playing; play.textContent = playing ? 'Ⅱ 一時停止' : '▶ 再生'; });
        const seek = slider('TRACK', 1, c.files.length, 1, v => show(v - 1));
        const list = el('div', 'wx-playlist');
        function show(n) { index = wrap(n); elapsed = 0; progress.value = 0; cover.replaceChildren(photo(index)); info.textContent = code(index + 41); seek.querySelector('input').value = index + 1; [...list.children].forEach((b,i) => b.setAttribute('aria-pressed', String(i === index))); }
        c.files.forEach((_, i) => list.append(button(`${String(i + 1).padStart(2,'0')}   ${code(i + 41)}`, () => show(i))));
        deck.append(cover, info, progress, bar(button('⏮', () => show(index - 1)), play, button('⏭', () => show(index + 1))), seek);
        stage.append(deck, list); show(0); interval(() => { if (playing) { elapsed += 100; progress.value = elapsed / 50; if (elapsed >= 5000) show(index + 1); } }, 100);
    },
    // 03 / Perspective carousel, manipulable with drag, range or buttons.
    3(c) {
        const {el, stage, photo, slider, button, bar} = c; 
        const view = el('div','wx-orbit-view'), ring = el('div','wx-orbit'); view.append(ring);
        let angle = 0, set = 0, start = null;
        const turn = value => { angle = value; ring.style.setProperty('--turn', `${angle}deg`); };
        function fill() { ring.replaceChildren(); for (let i=0;i<6;i++) { const card=el('figure','wx-orbit-card'); card.style.setProperty('--angle',`${i*60}deg`); card.append(photo(set*6+i),el('figcaption','',code(set*6+i))); ring.append(card); } }
        c.listen(view,'pointerdown', e => { start = {x:e.clientX,angle}; view.setPointerCapture(e.pointerId); });
        c.listen(view,'pointermove', e => { if(start) turn(start.angle+(e.clientX-start.x)*.5); });
        c.listen(view,'pointerup',()=>start=null); c.listen(view,'pointercancel',()=>start=null);
        stage.append(bar(button('← 回転',()=>turn(angle-60)),button('回転 →',()=>turn(angle+60)),button('次の展示',()=>{set=(set+1)%Math.ceil(c.files.length/6);fill();}),slider('奥行き',180,440,280,v=>ring.style.setProperty('--depth',`${v}px`))),view); fill();
    },
    // 04 / A small vaporwave desktop with movable and minimizable photo windows.
    4(c) {
        const {el, stage, button, bar, photo, listen} = c; 
        const viewport=el('div','wx-desktop-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','作業机。余白をスワイプして移動');
        const desk=el('div','wx-desktop'), icons=el('div','wx-icons'), tasks=el('div','wx-taskbar'); let z=1;
        const windows=new Map();
        function reveal(win){viewport.scrollTo({left:Math.max(0,win.offsetLeft-20),top:Math.max(0,win.offsetTop-20),behavior:c.reduced?'instant':'smooth'});}
        function open(i) {
            if(windows.has(i)){const w=windows.get(i); w.hidden=false;w.style.zIndex=++z;reveal(w);return;}
            const win=el('article','wx-window'), head=el('div','wx-window-head'), move=button(code(i),()=>{},'wx-drag-handle');
            // Keyboard users move the focused title bar with arrow keys.
            let x=20+(i%4)*28,y=20+(i%3)*32,start;
            const place=()=>{win.style.left=`${x}px`;win.style.top=`${y}px`;};
            const shift=(dx,dy)=>{x=Math.max(0,Math.min(desk.clientWidth-win.offsetWidth,x+dx));y=Math.max(0,Math.min(desk.clientHeight-win.offsetHeight,y+dy));place();};
            listen(head,'pointerdown',e=>{if(e.target.closest('.wx-minimize'))return;start={x:e.clientX,y:e.clientY};head.setPointerCapture(e.pointerId);win.style.zIndex=++z;});
            listen(head,'pointermove',e=>{if(start){shift(e.clientX-start.x,e.clientY-start.y);start={x:e.clientX,y:e.clientY};}});
            listen(head,'pointerup',()=>start=null);listen(head,'pointercancel',()=>start=null);
            listen(move,'keydown',e=>{const d={ArrowLeft:[-15,0],ArrowRight:[15,0],ArrowUp:[0,-15],ArrowDown:[0,15]}[e.key];if(d){e.preventDefault();shift(...d);}});
            head.append(move,button('−',()=>win.hidden=true,'wx-minimize'));win.append(head,photo(i));desk.append(win);place();reveal(win);windows.set(i,win);tasks.append(button(code(i,4),()=>open(i)));
        }
        // Limit simultaneous windows, while the file slider can reach every image.
        let selected=0; stage.append(bar(c.slider('FILE',1,c.files.length,1,v=>selected=v-1),button('開く',()=>{if(windows.size>=8&&!windows.has(selected)){c.say('同時に開けるのは8枚です。「机を片付ける」でリセットできます。');return;}open(selected);}),button('机を片付ける',()=>{windows.forEach(w=>w.remove());windows.clear();tasks.replaceChildren();})));
        for(let i=0;i<Math.min(4,c.files.length);i++) icons.append(button(`▧ ${code(i,4)}`,()=>open(i)));
        desk.append(icons);viewport.append(desk);stage.append(viewport,tasks); c.later(()=>open(0),30);
    },
    // 05 / Terminal commands perform real navigation and palette changes.
    5(c) {
        const {el,stage,photo,button,bar} = c;
        const screen=el('div','wx-terminal-screen'), log=el('pre','wx-log'), form=el('form','wx-command'), input=el('input');input.placeholder='open 01';input.setAttribute('aria-label','コマンド');input.autocomplete='off';
        let index=0; const history=[];let h=0;
        function run(value){ const cmd=value.trim().toLowerCase();history.push(cmd);h=history.length;log.textContent+=`\n> ${cmd}\n`;if(cmd==='help')log.textContent+='list / open N / next / prev / clear';else if(cmd==='list')log.textContent+=c.files.map((_,i)=>`${i+1} ${code(i)}`).join('  ');else if(cmd==='clear')log.textContent='';else if(cmd==='next'||cmd==='prev'||/^open \d+$/.test(cmd)){const n=cmd==='next'?index+1:cmd==='prev'?index-1:Number(cmd.split(' ')[1])-1;if(cmd.startsWith('open')&&(n<0||n>=c.files.length)){log.textContent+='OUT OF RANGE';return;}index=c.wrap(n);screen.replaceChildren(photo(index));log.textContent+=`${code(index)} / LOADED`; }else log.textContent+='UNKNOWN COMMAND / type help';log.scrollTop=log.scrollHeight;input.value='';}
        const submit=button('↵ 実行',()=>run(input.value)); form.append(el('span','','$'),input,submit);c.listen(form,'submit',e=>{e.preventDefault();run(input.value);});c.listen(input,'keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();input.value=history[Math.max(0,--h)]||'';}});
        stage.append(screen,bar(button('HELP',()=>run('help')),button('LIST',()=>run('list')),button('NEXT',()=>run('next'))),log,form);run('open 1');
    },
    // 06 / Contact-sheet curation: select, filter, reorder a personal edit.
    6(c) {
        const {el,stage,photo,button,bar} = c;
        const selected=[], grid=el('div','wx-contact');let only=false;
        function draw(){grid.replaceChildren();const indices=only?selected:c.files.map((_,i)=>i);for(const i of indices){const card=el('article','wx-contact-card'), pick=button('',()=>{const j=selected.indexOf(i);j<0?selected.push(i):selected.splice(j,1);draw();});pick.setAttribute('aria-label',`写真 ${i+1} を選択`);pick.setAttribute('aria-pressed',String(selected.includes(i)));pick.append(photo(i),el('span','',`${String(i+1).padStart(3,'0')} / ${code(i,4)}`));card.append(pick);if(only)card.append(bar(button('←',()=>move(i,-1)),button('→',()=>move(i,1))));grid.append(card);}c.say(`${selected.length}枚を選択${only?' / 編集版':''}`);}
        function move(i,d){const at=selected.indexOf(i),to=at+d;if(to>=0&&to<selected.length){[selected[at],selected[to]]=[selected[to],selected[at]];draw();}}
        stage.append(bar(button('全写真',()=>{only=false;draw();}),button('編集版',()=>{only=true;draw();}),button('選択解除',()=>{selected.length=0;draw();})),grid);draw();
    },
    // 07 / Runway: full-height looks, quiet type and a contact index overlay.
    7(c) {
        const {el,stage,photo,button,bar} = c;
        const runway=el('div','wx-runway'), visual=el('div','wx-look'), caption=el('h2','wx-look-code'), index=el('div','wx-look-index');index.hidden=true;let n=0;
        const show=i=>{n=c.wrap(i);visual.replaceChildren(photo(n));caption.textContent=code(n+700);c.say(`${n+1} / ${c.files.length}`);};
        c.files.forEach((_,i)=>{const b=button(String(i+1).padStart(2,'0'),()=>{show(i);index.hidden=true;});index.append(b);});
        runway.append(visual,caption);stage.append(bar(button('←',()=>show(n-1)),button('LOOK INDEX',()=>index.hidden=!index.hidden),button('→',()=>show(n+1))),index,runway);show(0);
    },
    // 08 / An oversize atlas with native pan and explicit scale controls.
    8(c) {
        const {el,stage,photo,bar,button} = c;
        const viewport=el('div','wx-atlas-view'), map=el('div','wx-atlas');viewport.tabIndex=0;viewport.setAttribute('aria-label','写真地図。縦横にスクロールできます');
        c.files.forEach((_,i)=>{const tile=el('figure','wx-map-tile');tile.append(el('figcaption','',`${String(i%8).padStart(2,'0')}:${String(Math.floor(i/8)).padStart(2,'0')}`),photo(i));map.append(tile);});viewport.append(map);
        stage.append(bar(c.slider('地図の密度',140,340,240,v=>map.style.setProperty('--tile',`${v}px`)),button('未踏の座標へ',()=>{const tile=map.children[Math.floor(Math.random()*map.children.length)];viewport.scrollTo({left:tile.offsetLeft-map.offsetLeft,top:tile.offsetTop-map.offsetTop,behavior:c.reduced?'instant':'smooth'});}),button('原点',()=>viewport.scrollTo(0,0))),viewport);
    },
    // 09 / Memory: six pairs, deterministic round progression through the collection.
    9(c) {
        const {el,stage,photo,button,bar} = c;
        const board=el('div','wx-memory');let round=0,opened=[],matched=new Set(),moves=0,locked=false,version=0;
        function deal(){version++;opened=[];matched=new Set();moves=0;locked=false;board.replaceChildren();const ids=c.shuffle([...Array(6).keys()].flatMap(i=>[i,i]));ids.forEach((id,i)=>{const b=button('',()=>flip(i,id,b));b.dataset.pair=id;b.setAttribute('aria-label',`カード ${i+1} をめくる`);const img=photo(round*6+id);img.hidden=true;b.append(el('span','',code(i+round,3)),img);board.append(b);});c.say('0 / 6 ペア · 0 手');}
        function flip(i,id,b){if(locked||matched.has(id)||opened.some(x=>x.i===i))return;b.classList.add('open');b.querySelector('img').hidden=false;b.querySelector('span').hidden=true;b.setAttribute('aria-label',`写真 ${c.wrap(round*6+id)+1}`);opened.push({i,id,b});if(opened.length<2)return;moves++;if(opened[0].id===id){matched.add(id);opened.forEach(x=>{x.b.disabled=true;x.b.classList.add('matched');});opened=[];c.say(`${matched.size} / 6 ペア · ${moves} 手${matched.size===6?' / COMPLETE!':''}`);}else{locked=true;const token=version;c.later(()=>{if(version!==token)return;opened.forEach(x=>{x.b.classList.remove('open');x.b.querySelector('img').hidden=true;x.b.querySelector('span').hidden=false;});opened=[];locked=false;},850);c.say(`${matched.size} / 6 ペア · ${moves} 手`);}}
        stage.append(bar(button('やり直す',deal),button('次のセット',()=>{round++;deal();})),board);deal();
    },
    // 10 / Solvable 8-puzzle: shuffle is a sequence of legal blank moves.
    10(c) {
        const {el,stage,button,bar} = c;
        const board=el('div','wx-puzzle'), preview=el('div','wx-puzzle-preview');preview.hidden=true;let tiles=[],moves=0,index=0;
        const neighbors=blank=>[blank-3,blank+3,...(blank%3?[blank-1]:[]),...(blank%3<2?[blank+1]:[])].filter(n=>n>=0&&n<9);
        function draw(){board.replaceChildren();tiles.forEach((tile,position)=>{const b=button('',()=>{const blank=tiles.indexOf(8);if(!neighbors(blank).includes(position))return;[tiles[blank],tiles[position]]=[tiles[position],tiles[blank]];moves++;draw();});b.disabled=tile===8;if(tile!==8){const img=c.photo(index);img.style.left=`${-(tile%3)*100}%`;img.style.top=`${-Math.floor(tile/3)*100}%`;b.append(img);}b.setAttribute('aria-label',`タイル ${tile+1}`);if(tile!==8)b.append(el('span','',String(tile+1)));board.append(b);});c.say(`${moves} 手${tiles.every((v,i)=>v===i)?' / COMPLETE!':''}`);}
        function reset(){tiles=[0,1,2,3,4,5,6,7,8];let previous=-1;for(let i=0;i<120;i++){const blank=tiles.indexOf(8),options=neighbors(blank).filter(n=>n!==previous),n=options[Math.floor(Math.random()*options.length)];[tiles[blank],tiles[n]]=[tiles[n],tiles[blank]];previous=blank;}moves=0;preview.replaceChildren(c.photo(index));draw();}
        stage.append(bar(button('混ぜる',reset),button('完成図',()=>preview.hidden=!preview.hidden),button('次の写真',()=>{index++;reset();})),preview,board);reset();
    },
    // 11 / Darkroom: exposure/contrast/development with a reversible original.
    11(c) {
        const {el,stage,photo,button,bar,slider} = c;
        const tray=el('div','wx-darkroom'), image=photo(0);let index=0;tray.append(image);
        stage.append(bar(slider('露光',40,180,100,v=>tray.style.setProperty('--exposure',v/100)),slider('コントラスト',50,200,100,v=>tray.style.setProperty('--contrast',v/100)),slider('現像',0,100,100,v=>tray.style.setProperty('--develop',v/100))),bar(button('原色 / モノクロ',()=>tray.classList.toggle('color')),button('次のネガ',()=>{index++;tray.replaceChildren(photo(index));}),button('リセット',()=>{tray.removeAttribute('style');tray.classList.remove('color');stage.querySelectorAll('input').forEach(i=>i.value=100);})),tray);
    },
    // 12 / A/B wipe: one photo, two processing states, slider and drag.
    12(c) {
        const {el,stage,photo,bar,button,slider} = c;
        const compare=el('div','wx-compare'), base=el('div','wx-compare-base'), top=el('div','wx-compare-top');let index=0;
        const range=slider('境界',0,100,50,v=>compare.style.setProperty('--split',`${v}%`));
        function show(){base.replaceChildren(photo(index));top.replaceChildren(photo(index));}
        compare.append(base,top);let dragging=false;const move=e=>{if(!dragging)return;const r=compare.getBoundingClientRect(),v=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));compare.style.setProperty('--split',`${v}%`);range.querySelector('input').value=v;};
        c.listen(compare,'pointerdown',e=>{dragging=true;compare.setPointerCapture(e.pointerId);move(e);});c.listen(compare,'pointermove',move);c.listen(compare,'pointerup',()=>dragging=false);c.listen(compare,'pointercancel',()=>dragging=false);
        stage.append(bar(button('前へ',()=>{index=c.wrap(index-1);show();}),range,button('次へ',()=>{index=c.wrap(index+1);show();})),compare);show();
    },
    // 13 / Time specimens: horizontal film journey with selectable chapter markers.
    13(c) {
        const {el,stage,photo,button} = c;
        const rail=el('div','wx-timeline'), markers=el('div','wx-time-markers');rail.tabIndex=0;
        c.files.forEach((_,i)=>{const card=el('figure','wx-time-frame');card.append(el('span','wx-time',timelineTime(i,c.files.length)),photo(i),el('figcaption','',code(i+130)));rail.append(card);markers.append(button(String(i+1).padStart(2,'0'),()=>rail.scrollTo({left:card.offsetLeft-rail.offsetLeft,behavior:c.reduced?'instant':'smooth'})));});stage.append(rail,markers);
    },
    // 14 / Zine: actual two-page spreads, switch binding and turn pages.
    14(c) {
        const {el,stage,photo,button,bar} = c;
        const book=el('div','wx-book'),jump=el('nav','wx-zine-jump');
        jump.setAttribute('aria-label','見開きへジャンプ');
        const total=Math.ceil(c.files.length/2);let page=0,reverse=false,busy=false;
        const previous=button('← 戻る',()=>turn(page-1));
        const next=button('めくる →',()=>turn(page+1));
        const binding=button('綴じ方向',()=>turn(page,true));
        const controls=bar(previous,binding,next);
        function sync(){
            previous.disabled=busy||page===0;next.disabled=busy||page===total-1;binding.disabled=busy;
            [...jump.children].forEach((b,i)=>{b.disabled=busy;b.setAttribute('aria-current',i===page?'page':'false');});
        }
        function draw(){
            book.replaceChildren();
            for(let j=0;j<2;j++){
                const index=page*2+(reverse?1-j:j),sheet=el('article','wx-sheet');
                sheet.dataset.layout=String((page+j*2)%4);
                if(index<c.files.length)sheet.append(el('h2','',code(index+140,6)),photo(index),el('p','',`${code(index+340,24)} / ${String(index+1).padStart(3,'0')}`));
                else sheet.append(el('p','','— END —'));
                book.append(sheet);
            }
            c.say(`${page+1} / ${total} 見開き`);sync();
        }
        function turn(destination,changeBinding=false){
            if(busy||destination<0||destination>=total||(!changeBinding&&destination===page))return;
            const direction=destination>=page?1:-1;
            const old=c.reduced?null:book.children[direction>0?1:0].cloneNode(true);
            if(changeBinding)reverse=!reverse;
            page=destination;draw();
            if(old){
                busy=true;sync();
                old.classList.add('wx-turn-leaf');old.dataset.direction=direction>0?'next':'previous';old.setAttribute('aria-hidden','true');book.append(old);
                c.later(()=>{old.remove();busy=false;sync();},720);
            }
        }
        for(let i=0;i<total;i++){
            const first=i*2+1,last=Math.min(first+1,c.files.length);
            const item=button('',()=>turn(i));
            item.setAttribute('aria-label',`ページ ${first}〜${last} へ`);
            item.append(photo(i*2),el('span','',`${first}–${last}`));jump.append(item);
        }
        let gesture=null;
        c.listen(book,'pointerdown',e=>{if(e.isPrimary===false||busy)return;gesture={x:e.clientX,y:e.clientY};book.setPointerCapture(e.pointerId);});
        c.listen(book,'pointerup',e=>{if(!gesture)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.4)turn(page+(dx<0?1:-1));});
        c.listen(book,'pointercancel',()=>gesture=null);
        stage.append(controls,book,jump);draw();
    },
    // 15 / Constellation: photograph nodes and a live map linking nearby memories.
    15(c) {
        const {el,stage,photo,button,bar} = c;
        const viewport=el('div','wx-sky-viewport');
        const layout=el('div','wx-observatory'), sky=el('div','wx-sky'), detail=el('div','wx-star-detail');let angle=0;
        const points=c.files.map((_,i)=>{const theta=i*2.39996,r=10+34*Math.sqrt((i+1)/c.files.length);return {x:50+Math.cos(theta)*r,y:50+Math.sin(theta)*r};});
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('aria-hidden','true');
        points.forEach((p,i)=>{if(i){const line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1',points[i-1].x);line.setAttribute('y1',points[i-1].y);line.setAttribute('x2',p.x);line.setAttribute('y2',p.y);svg.append(line);}});sky.append(svg);
        points.forEach((p,i)=>{const b=button(String(i+1),()=>{detail.replaceChildren(photo(i),el('h2','',code(i+150)));c.say(`座標 ${p.x.toFixed(1)} / ${p.y.toFixed(1)}`);});b.style.left=`${p.x}%`;b.style.top=`${p.y}%`;sky.append(b);});
        // Keep the gesture surface stationary. Rotating content is clipped so it
        // cannot cover the right-hand rotation button and intercept later clicks.
        let start=null,dragged=false;
        const rotate=delta=>{angle+=delta;sky.style.setProperty('--sky-angle',`${angle}deg`);};
        c.listen(viewport,'pointerdown',e=>{if(e.isPrimary===false)return;start={x:e.clientX,last:e.clientX};dragged=false;});
        c.listen(viewport,'pointermove',e=>{
            if(!start)return;
            if(!dragged&&Math.abs(e.clientX-start.x)>8){dragged=true;viewport.setPointerCapture(e.pointerId);}
            if(dragged)rotate((e.clientX-start.last)*.4);
            start.last=e.clientX;
        });
        c.listen(viewport,'pointerup',()=>start=null);
        c.listen(viewport,'pointercancel',()=>{start=null;dragged=false;});
        c.listen(viewport,'click',e=>{if(dragged){e.preventDefault();e.stopPropagation();dragged=false;}},{capture:true});
        viewport.append(sky);layout.append(viewport,detail);
        stage.append(bar(button('左へ回転',()=>rotate(-15)),button('右へ回転',()=>rotate(15))),layout);
        detail.append(photo(0),el('h2','',code(150)));
    },
    // 16 / Chance triptych: lock individual reels, reroll the rest.
    16(c) {
        const {el,stage,photo,button,bar} = c;
        const reels=el('div','wx-reels'),indices=[0,1,2],locks=[false,false,false];
        function draw(){reels.replaceChildren();indices.forEach((n,i)=>{const reel=el('article','wx-reel'),lock=button(locks[i]?'UNLOCK':'LOCK',()=>{locks[i]=!locks[i];draw();});lock.setAttribute('aria-pressed',String(locks[i]));reel.append(photo(n),el('h2','',code(n+160,5)),lock);reels.append(reel);});}
        stage.append(bar(button('↻ 組み合わせる',()=>{indices.forEach((n,i)=>{if(!locks[i])indices[i]=Math.floor(Math.random()*c.files.length);});draw();c.say(indices.map(i=>String(c.wrap(i)+1).padStart(3,'0')).join(' / '));}),button('全ロック解除',()=>{locks.fill(false);draw();})),reels);draw();
    },
    // 17 / Swiss type laboratory: movable caption and typography controls.
    17(c) {
        const {el,stage,photo,button,bar,slider} = c;
        const sheet=el('div','wx-typesheet'), words=el('h2','wx-type-word',code(170,8));words.tabIndex=0;sheet.append(photo(0),words);let index=0;
        const x=slider('横位置',0,65,6,v=>sheet.style.setProperty('--tx',`${v}%`)),y=slider('縦位置',0,80,8,v=>sheet.style.setProperty('--ty',`${v}%`));let drag=false;
        c.listen(words,'pointerdown',e=>{drag=true;words.setPointerCapture(e.pointerId);});c.listen(words,'pointermove',e=>{if(!drag)return;const r=sheet.getBoundingClientRect(),a=Math.max(0,Math.min(65,(e.clientX-r.left)/r.width*100)),b=Math.max(0,Math.min(80,(e.clientY-r.top)/r.height*100));sheet.style.setProperty('--tx',`${a}%`);sheet.style.setProperty('--ty',`${b}%`);x.querySelector('input').value=a;y.querySelector('input').value=b;});c.listen(words,'pointerup',()=>drag=false);c.listen(words,'pointercancel',()=>drag=false);
        stage.append(bar(slider('文字サイズ',30,140,80,v=>sheet.style.setProperty('--type-size',`${v}px`)),x,y),bar(button('SERIF / SANS',()=>sheet.classList.toggle('serif')),button('文字を生成',()=>words.textContent=code(Math.floor(Math.random()*100000),8)),button('次の写真',()=>{index++;sheet.querySelector('img').replaceWith(photo(index));})),sheet);
    },
    // 18 / Museum corridor: front and side walls in perspective, room navigation.
    18(c) {
        const {el,stage,photo,button,bar} = c;
        const room=el('div','wx-room'),inspection=el('div','wx-inspection');inspection.hidden=true;let n=0;
        const close=button('展示室へ戻る',()=>inspection.hidden=true);
        function draw(){room.replaceChildren();['left','front','right'].forEach((side,i)=>{const b=button('',()=>{inspection.replaceChildren(close,photo(n*3+i));inspection.hidden=false;});b.classList.add(`wx-wall-${side}`);b.setAttribute('aria-label',`作品 ${c.wrap(n*3+i)+1} を鑑賞`);b.append(photo(n*3+i),el('span','',code(n*3+i+180,5)));room.append(b);});c.say(`ROOM ${n+1} / ${Math.ceil(c.files.length/3)}`);}
        stage.append(bar(button('← 前の部屋',()=>{n=(n-1+Math.ceil(c.files.length/3))%Math.ceil(c.files.length/3);draw();}),button('次の部屋 →',()=>{n=(n+1)%Math.ceil(c.files.length/3);draw();})),room,inspection);draw();
    },
    // 19 / Eight-step synthesizer. Audio is created only after explicit playback.
    19(c) {
        const {el,stage,photo,button,bar,slider} = c;
        const matrix=el('div','wx-sequencer'),screen=el('div','wx-sequence-image'),notes=Array.from({length:6},()=>Array(8).fill(false));let audio=null,running=false,step=-1,bpm=100,last=0,muted=false,master=null,volume=.7;
        // Six voices over eight steps. Timbre and harmony can be changed independently.
        const timbres = {
            warm: { name: 'WARM / 柔らかな鍵盤', wave: 'triangle', attack: .01, decay: .25, cutoff: 2200, peak: .22 },
            round: { name: 'ROUND / 丸いベル', wave: 'sine', attack: .004, decay: .55, cutoff: 6000, peak: .28 },
            pluck: { name: 'PLUCK / 弾くシンセ', wave: 'sawtooth', attack: .006, decay: .16, cutoff: 1300, peak: .16 }
        };
        let timbre = 'warm';
        const toneLabel=el('label','wx-slider'),tone=el('select','wx-select');
        toneLabel.append(el('span','','音色'),tone);
        for(const [id,preset] of Object.entries(timbres)){const option=el('option','',preset.name);option.value=id;tone.append(option);}
        c.listen(tone,'change',()=>{timbre=tone.value;});
        // Keep D as the root so changing presets changes harmony, not key.
        // add9 uses a major triad plus the ninth, without a seventh.
        const chords = {
            major: { label: 'メジャー / D', midi: [50,54,57,62,66,69], names: ['D3','F♯3','A3','D4','F♯4','A4'] },
            minor: { label: 'マイナー / Dm', midi: [50,53,57,62,65,69], names: ['D3','F3','A3','D4','F4','A4'] },
            add9: { label: 'add9 / Dadd9', midi: [50,54,57,62,64,69], names: ['D3','F♯3','A3','D4','E4','A4'] }
        };
        let pitches=[],voiceNames=[];
        const chordLabel=el('label','wx-slider'),chord=el('select','wx-select');
        chordLabel.append(el('span','','和音'),chord);
        for(const [id,preset] of Object.entries(chords)){const option=el('option','',preset.label);option.value=id;chord.append(option);}
        chord.value='minor';
        function applyChord(){
            const preset=chords[chord.value] || chords.minor;
            pitches=preset.midi.map(note=>440*Math.pow(2,(note-69)/12));voiceNames=preset.names;
        }
        applyChord();
        const phone=matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
        const boost=phone?2:1;
        const cells=[];for(let row=0;row<6;row++){cells[row]=[];for(let col=0;col<8;col++){const b=button('',()=>{notes[row][col]=!notes[row][col];b.setAttribute('aria-pressed',String(notes[row][col]));});b.setAttribute('aria-label',`${voiceNames[row]} / 拍 ${col+1}`);b.setAttribute('aria-pressed','false');matrix.append(b);cells[row].push(b);}}
        c.listen(chord,'change',()=>{
            applyChord();
            cells.forEach((row,r)=>row.forEach((b,step)=>b.setAttribute('aria-label',`${voiceNames[r]} / 拍 ${step+1}`)));
        });
        notes[0][0]=notes[1][2]=notes[2][4]=notes[3][6]=notes[4][3]=notes[5][7]=true;cells.forEach((row,r)=>row.forEach((b,s)=>b.setAttribute('aria-pressed',String(notes[r][s]))));
        const play=button('▶ 音を再生',async()=>{if(running){running=false;play.textContent='▶ 音を再生';return;}const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio){c.say('このブラウザでは音声合成を利用できません。');return;}try{audio ||= new Audio();
            if(!master){master=audio.createGain();const compressor=audio.createDynamicsCompressor();compressor.threshold.value=-12;compressor.ratio.value=6;master.gain.value=muted?0:volume;const output=audio.createGain();output.gain.value=boost;master.connect(compressor).connect(output).connect(audio.destination);}
            await audio.resume();if(!stage.isConnected){audio.close();return;}running=true;last=0;play.textContent='Ⅱ 停止';}catch{c.say('音声を開始できませんでした。');}});
        c.cleanups.push(()=>{running=false;if(audio&&audio.state!=='closed')audio.close();});
        c.listen(document,'visibilitychange',()=>{if(document.hidden){running=false;play.textContent='▶ 音を再生';}});
        c.interval(()=>{if(!running)return;const now=performance.now();if(now-last<60000/bpm/2)return;last=now;step=(step+1)%8;screen.replaceChildren(photo(step));cells.forEach((row,r)=>{row.forEach((b,s)=>b.classList.toggle('current',s===step));if(notes[r][step]&&!muted){const preset=timbres[timbre],osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();
            osc.type=preset.wave;osc.frequency.value=pitches[r];filter.type='lowpass';filter.frequency.value=preset.cutoff;
            gain.gain.setValueAtTime(.0001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(preset.peak,audio.currentTime+preset.attack);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+preset.decay);
            osc.connect(filter).connect(gain).connect(master);osc.start();osc.stop(audio.currentTime+preset.decay+.02);osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();};}});},25);
        stage.append(bar(play,toneLabel,chordLabel,slider('BPM',60,180,100,v=>bpm=v),slider('音量',0,100,70,v=>{volume=v/100;if(master)master.gain.value=muted?0:volume;}),button('ミュート',e=>{muted=!muted;if(master)master.gain.value=muted?0:volume;e.currentTarget.setAttribute('aria-pressed',String(muted));}),button('クリア',()=>{notes.forEach(row=>row.fill(false));cells.flat().forEach(b=>b.setAttribute('aria-pressed','false'));})),screen,matrix);screen.append(photo(0));
    },
    // 20 / Branching journey: choose images, collect a trail, undo and replay.
    20(c) {
        const {el,stage,photo,button,bar} = c;
        const paths=el('div','wx-paths'),trail=el('div','wx-trail');let choices=[],seed=1;
        function draw(){paths.replaceChildren();trail.replaceChildren();if(choices.length===8){const finish=el('h2','wx-journey-title',code(choices.reduce((a,b)=>a*3+b,1),10));paths.append(finish);c.say('旅が完成しました。下の写真があなたの道順です。');}else{[0,1].forEach(branch=>{const n=c.wrap(seed*7+choices.length*11+branch*17),b=button('',()=>{choices.push(n);seed=seed*2+branch;draw();});b.append(photo(n),el('span','',`${branch?'RIGHT':'LEFT'} / ${code(n+200,5)}`));paths.append(b);});c.say(`${choices.length} / 8 回の選択`);}choices.forEach((n,i)=>{const card=el('figure');card.append(photo(n),el('figcaption','',String(i+1).padStart(2,'0')));trail.append(card);});}
        stage.append(bar(button('一歩戻る',()=>{if(choices.length){choices.pop();seed=Math.floor(seed/2);draw();}}),button('新しい旅',()=>{choices=[];seed=1;draw();})),paths,trail);draw();
    }
};
