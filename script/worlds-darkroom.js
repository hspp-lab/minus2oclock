// State transitions are independent of animation/audio, so each command resolves once.
export function createDarkRoom(target = 8, rooms = 8) {
    if (!Number.isInteger(target) || target < 4 || target > 20 || !Number.isInteger(rooms) || rooms < 4 || rooms > 20) throw new RangeError('Invalid game settings');
    return { target, rooms, score: 0, room: 0, turns: 0, phase: 'playing' };
}
export function darkRoomAction(state, action, random = Math.random) {
    if (state.phase !== 'playing' || !['forward', 'back', 'collect'].includes(action)) return null;
    if (state.turns === 0 && action !== 'collect') return null;
    if (action === 'back' && (state.room <= 1 || state.room === state.rooms)) return null;
    const final = state.room === state.rooms;
    const outcomes = state.turns === 0 ? [3,4,5] : action === 'back' ? [-1] : action === 'forward' ? [-1,0,1] : [-5,-4,-3,-2,-1,1,2,3,4,5];
    const delta = outcomes[Math.floor(random() * outcomes.length)];
    const next = { ...state, score: state.score + delta, turns: state.turns + 1 };
    if (!final) next.room += action === 'back' ? -1 : 1;
    if (next.score <= 0) next.phase = 'dead';
    else if (final) next.phase = next.score >= next.target ? 'cleared' : 'failed';
    return { state: next, action, delta, roomDelta: next.room - state.room };
}
export function clearStamp(date) {
    return String(date.getFullYear()) + [date.getMonth()+1,date.getDate(),date.getHours(),date.getMinutes(),date.getSeconds()].map(v=>String(v).padStart(2,'0')).join('');
}

// Procedural foley: three short footsteps or collection rustling.
// Everything uses a single master gain, which also silences already scheduled sounds.
function createSound() {
    let audio, master, muted = false;
    const active = new Set();
    function hush() { for (const source of active) { try { source.stop(); } catch {} } active.clear(); }
    async function unlock() {
        try {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) return;
            audio ||= new Audio();
            if (!master) { master = audio.createGain(); master.connect(audio.destination); master.gain.value = muted ? 0 : .3; }
            await audio.resume();
        } catch { /* Gameplay remains available without sound. */ }
    }
    function play(action) {
        if (!audio || audio.state !== 'running' || muted) return;
        hush();
        const now = audio.currentTime;
        function noise(offset, duration, frequency) {
            const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * Math.pow(1-i/data.length,2);
            const source = audio.createBufferSource(), filter = audio.createBiquadFilter();
            active.add(source); source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = frequency;
            source.connect(filter).connect(master); source.start(now+offset);
            source.onended = () => { active.delete(source); source.disconnect(); filter.disconnect(); };
        }
        if (action === 'collect') { for (let i=0;i<5;i++) noise(i*.1,.14,1800+i*250); }
        else {
            // Three dry heel taps: kotsu, kotsu, kotsu.
            for (const offset of [0, .32, .64]) {
                noise(offset, .09, 1800);
                noise(offset + .015, .12, 450);
            }
        }
    }
    return { unlock, play, hush, mute(value) { muted=value; if(master)master.gain.value=value?0:.3; }, stop() { hush(); if(audio && audio.state!=='closed') void audio.close().catch(()=>{}); } };
}

const ACTION_NAMES = { forward: '進む', back: '戻る', collect: '収集' };
// Empty or missing arrays intentionally suppress a line; ignore non-string entries.
export function chooseDarkRoomLine(config, key, random = Math.random) {
    const candidates = Array.isArray(config?.[key]) ? config[key].filter(value => typeof value === 'string') : [];
    return candidates.length ? candidates[Math.floor(random() * candidates.length)] : '';
}

// These formatters are the only path from private game settings to the HUD/log.
// Historical rows keep their own numerators; only the denominators are revealed.
export function darkRoomNumbers(snapshot, run, reveal = false) {
    return {
        pt: `${snapshot.score}/${reveal || run.showTarget ? run.target : '?'}`,
        cor: `${snapshot.room}/${reveal || run.showRooms ? run.rooms : '?'}`
    };
}
export function darkRoomLogParts(entry, run, reveal = false, labels = {}) {
    const pt = labels.pt ?? 'PT', cor = labels.cor ?? 'COR';
    const numbers = darkRoomNumbers(entry, run, reveal);
    return {
        prefix: `#ACT_${String(entry.turn).padStart(3, '0')} ${ACTION_NAMES[entry.action]} ${pt} `,
        delta: entry.delta === 0 ? '±0' : entry.delta > 0 ? `+${entry.delta}` : String(entry.delta),
        corDelta: entry.roomDelta > 0 ? '+' + entry.roomDelta : entry.roomDelta < 0 ? String(entry.roomDelta) : '±0',
        suffix: ` | ${pt} ${numbers.pt.replace('/', ' / ')} | ${cor} ${numbers.cor.replace('/', ' / ')} |`
    };
}
export function darkRoomRunSettings(settings, retry = false, random = Math.random) {
    return {
        ...settings,
        target: retry && !settings.showTarget ? 4 + Math.floor(random() * 17) : settings.target,
        rooms: retry && !settings.showRooms ? 4 + Math.floor(random() * 17) : settings.rooms
    };
}

export function mountDarkRoom(c) {
    const { el, button, bar, listen, stage } = c;
    const randomSetting = () => 4 + Math.floor(Math.random() * 17);
    const shell = el('div', 'dr-shell');
    const setup = el('section', 'dr-setup');
    const game = el('section', 'dr-game');
    game.hidden = true;
    shell.dataset.view = 'setup';

    // Hidden values never live in option values, aria labels or DOM data attributes.
    const settings = { target: 8, rooms: 8, showTarget: true, showRooms: true };
    let state = null, run = null, busy = false, disposed = false, generation = 0;
    let history = [], counts = {}, resultText = '', lines = {}, stamp = '';
    let muted = false;
    const timers = new Set();
    const sound = createSound();
    function cancelPending() {
        generation++;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        sound.hush();
    }
    function delay(callback, duration) {
        const token = generation;
        const id = setTimeout(() => {
            timers.delete(id);
            if (!disposed && token === generation) callback();
        }, duration);
        timers.add(id);
    }
    c.cleanups.push(() => { disposed = true; cancelPending(); sound.stop(); });

    const config = c.darkroomConfig || {};
    const labels = Object.fromEntries(Object.entries({target:'目標', rooms:'全回廊数', pt:'PT', cor:'COR', acts:'ACTS', breakdown:'BD.', parameter:'PARAMETER', result:'RESULT'}).map(([key, fallback]) => [key, typeof config.labels?.[key] === 'string' ? config.labels[key] : fallback]));
    const buttonText = (key, fallback) => typeof config.buttons?.[key] === 'string' ? config.buttons[key] : fallback;
    const titleText = c.pageTitle ?? 'dark room';
    const titlePattern = Number.isInteger(config.title_pattern) && config.title_pattern >= 0 && config.title_pattern <= 4 ? config.title_pattern : 0;
    const title = el('h1', 'dr-title');
    const titleLetters = el('span', '', titleText);
    titleLetters.setAttribute('aria-hidden', 'true');
    title.setAttribute('aria-label', titleText);
    title.dataset.effect = String(titlePattern);
    title.append(titleLetters);
    // Measure at the preferred size, then shrink to the available width.
    // A separate probe keeps the decoding animation from changing the title size.
    const titleProbe = el('span', 'dr-title-probe', titleText);
    titleProbe.setAttribute('aria-hidden', 'true');
    title.append(titleProbe);
    function fitTitle() {
        if (disposed || !title.clientWidth) return;
        const preferred = parseFloat(getComputedStyle(titleProbe).fontSize);
        titleProbe.textContent = titleText;
        let width = titleProbe.getBoundingClientRect().width;
        if (titlePattern === 3) {
            titleProbe.textContent = Array.from(titleText, letter => /\s/.test(letter) ? letter : '#').join('');
            width = Math.max(width, titleProbe.getBoundingClientRect().width);
        }
        if (width > 0) title.style.fontSize = `${preferred * Math.min(1, Math.max(1, title.clientWidth - 8) / width)}px`;
    }
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(fitTitle);
        observer.observe(title);
        c.cleanups.push(() => observer.disconnect());
    }
    listen(window, 'resize', fitTitle);
    c.later(fitTitle, 0);
    if (document.fonts) void document.fonts.ready.then(fitTitle);

    // Short decoding bursts, only on the setup screen. The accessible title stays fixed.
    if (titlePattern === 3 && !c.reduced) {
        let tick = 0;
        c.interval(() => {
            if (setup.hidden) { titleLetters.textContent = titleText; tick = 0; return; }
            const phase = tick++ % 48;
            if (phase >= 10) { titleLetters.textContent = titleText; return; }
            const glyphs = '01/+=:#?';
            const letters = Array.from(titleText);
            const settled = Math.floor(letters.length * phase / 9);
            titleLetters.textContent = letters.map((letter, index) => /\s/.test(letter) || index < settled ? letter : glyphs[Math.floor(Math.random() * glyphs.length)]).join('');
        }, 100);
    }
    const rules = el('div', 'dr-rules');
    rules.id = 'darkroom-rules';
    rules.hidden = true;
    rules.textContent = Array.isArray(config.ruletext) ? config.ruletext.filter(line => typeof line === 'string').join('\n') : '';
    const mute = button(buttonText('sound_on', 'sound : ON'), () => {
        muted = !muted;
        sound.mute(muted || document.hidden);
        mute.textContent = muted ? buttonText('sound_off', 'sound : OFF') : buttonText('sound_on', 'sound : ON');
        mute.setAttribute('aria-pressed', String(!muted));
    });
    mute.setAttribute('aria-pressed', 'true');
    const rule = button(buttonText('rule', 'rule'), () => {
        rules.hidden = !rules.hidden;
        rule.setAttribute('aria-expanded', String(!rules.hidden));
    });
    rule.setAttribute('aria-expanded', 'false');
    rule.setAttribute('aria-controls', rules.id);
    const ruleTools = el('div', 'dr-setting dr-setting-control');
    ruleTools.append(rule);
    const soundTools = el('div', 'dr-setting dr-setting-control');
    soundTools.append(mute);

    function field(label, key, visibilityKey) {
        const group = el('div', 'dr-setting');
        const labelNode = el('label', '', label);
        const select = el('select');
        select.id = `darkroom-${key}`;
        labelNode.htmlFor = select.id;
        const toggle = button('', () => {
            settings[visibilityKey] = !settings[visibilityKey];
            if (!settings[visibilityKey]) settings[key] = randomSetting();
            refresh();
        });
        listen(select, 'change', () => {
            const value = Number(select.value);
            if (settings[visibilityKey] && Number.isInteger(value) && value >= 4 && value <= 20) settings[key] = value;
        });
        function refresh() {
            select.replaceChildren();
            const visible = settings[visibilityKey];
            if (visible) {
                for (let n = 4; n <= 20; n++) {
                    const option = el('option', '', String(n));
                    option.value = String(n);
                    select.append(option);
                }
                select.value = String(settings[key]);
            } else {
                const option = el('option', '', '?');
                option.value = '?';
                select.append(option);
                select.value = '?';
            }
            select.disabled = !visible;
            toggle.textContent = visible ? buttonText('show', 'show') : buttonText('hide', 'hide');
            toggle.setAttribute('aria-label', `${label}：${toggle.textContent}。クリックで切り替え`);
            toggle.setAttribute('aria-pressed', String(visible));
        }
        group.append(labelNode, select, toggle);
        refresh();
        return { group, refresh };
    }
    const target = field(labels.target, 'target', 'showTarget');
    const rooms = field(labels.rooms, 'rooms', 'showRooms');
    const randomize = button(buttonText('random', 'rnd'), () => {
        settings.target = randomSetting(); settings.rooms = randomSetting();
        target.refresh(); rooms.refresh();
    });
    const randomTools = el('div', 'dr-setting dr-setting-control');
    randomTools.append(randomize);
    setup.append(title, ruleTools, rules, target.group, rooms.group, randomTools, soundTools, button(buttonText('start', '開始'), () => start(false), 'dr-start'));

    const hud = el('div', 'dr-hud');
    const score = el('strong'), position = el('strong');
    const scoreBox = el('div'), roomBox = el('div');
    scoreBox.append(el('span', '', labels.pt), score);
    roomBox.append(el('span', '', labels.cor), position);
    hud.append(scoreBox, roomBox);
    const message = el('p', 'dr-message');
    message.setAttribute('role', 'status');
    message.setAttribute('tabindex', '-1');
    const buttons = Object.fromEntries(Object.entries(ACTION_NAMES).map(([action, label]) => [action, button(buttonText(action, label), () => act(action))]));
    const commands = bar(buttons.forward, buttons.back, buttons.collect);
    commands.classList.add('dr-commands');
    const log = el('ol', 'dr-log');
    log.setAttribute('aria-label', '行動履歴（最新が上）');
    log.tabIndex = 0;
    const reward = el('figure', 'dr-reward'); reward.hidden = true;
    const record = el('section', 'dr-record'); record.hidden = true;
    record.setAttribute('aria-label', '今回の記録');
    const endControls = bar(
        button(buttonText('retry', '同じ設定でもう一度始める'), () => start(true)),
        button(buttonText('settings', '設定へ戻る'), () => {
            cancelPending(); busy = false; state = null;
            game.hidden = true; setup.hidden = false; shell.dataset.view = 'setup';
            reward.replaceChildren(); reward.hidden = true; record.replaceChildren(); record.hidden = true;
            log.replaceChildren(); history = [];
            target.refresh(); rooms.refresh();
        })
    );
    endControls.classList.add('dr-end-controls'); endControls.hidden = true;

    function logNode(entry, reveal) {
        const parts = darkRoomLogParts(entry, run, reveal, labels);
        const row = el('li');
        const deltaClass = value => value > 0 ? 'dr-plus' : value < 0 ? 'dr-minus' : 'dr-neutral';
        row.append(
            el('span', '', parts.prefix), el('span', deltaClass(entry.delta), parts.delta),
            el('span', '', `  ${labels.cor} `), el('span', deltaClass(entry.roomDelta), parts.corDelta),
            el('span', '', parts.suffix)
        );
        return row;
    }
    function draw() {
        const finished = state.phase !== 'playing';
        const numbers = darkRoomNumbers(state, run, finished);
        score.textContent = numbers.pt; position.textContent = numbers.cor;
        for (const [action, b] of Object.entries(buttons)) {
            b.disabled = busy || finished || (state.turns === 0 && action !== 'collect') || (action === 'back' && (state.room <= 1 || state.room === state.rooms));
        }
        if (busy) message.textContent = lines.pending;
        else if (finished) message.textContent = resultText;
        else if (state.turns === 0) message.textContent = lines.start;
        else if (state.room === state.rooms) {
            message.textContent = [run.showRooms ? lines.last_room : lines.last_room_hidden, run.showTarget ? '' : lines.target_hidden].filter(Boolean).join('\n');
        } else message.textContent = lines.playing;
        commands.hidden = finished;
        endControls.hidden = !finished;
    }
    function showRecord() {
        const text = [
            `[${labels.parameter}]`,
            `${labels.pt.padEnd(6)}: ${run.showTarget ? run.target : 'HIDDEN'}`,
            `${labels.cor.padEnd(6)}: ${run.showRooms ? run.rooms : 'HIDDEN'}`,
            '',
            `[${labels.result}]`,
            `${labels.pt.padEnd(6)}: ${state.score} / ${run.target}`,
            `${labels.cor.padEnd(6)}: ${state.room} / ${run.rooms}`,
            `${labels.acts.padEnd(6)}: ${state.turns}    ${labels.breakdown}: 進む ${counts.forward} / 戻る ${counts.back} / 収集 ${counts.collect}`
        ].join('\n');
        record.replaceChildren(el('pre', 'dr-record-console', text));
        record.hidden = false;
    }

    function revealPhoto() {
        reward.replaceChildren();
        if (c.files.length) {
            const image = c.photo(Math.floor(Math.random() * c.files.length)); image.loading = 'eager';
            const fallback = el('p', 'dr-photo-fallback', '写真を読み込めませんでした。脱出の記録はここに残っています。');
            fallback.hidden = true;
            // c.photo has already registered its preview→original fallback handler.
            listen(image, 'error', () => {
                if (image.dataset.originalRetried === 'true') { image.hidden = true; fallback.hidden = false; }
                else image.dataset.originalRetried = 'true';
            });
            reward.append(image, fallback);
        } else reward.append(el('p', 'dr-photo-fallback', 'ここには写真が残っていない。脱出の記録だけが残った。'));
        reward.append(el('figcaption', '', `dark room cleared ${stamp}`));
        reward.hidden = false; showRecord();
    }
    function start(retry) {
        cancelPending(); busy = false;
        const source = retry && run ? run : settings;
        run = darkRoomRunSettings(source, retry);
        Object.assign(settings, run);
        target.refresh(); rooms.refresh();
        state = createDarkRoom(run.target, run.rooms);
        history = []; counts = { forward: 0, back: 0, collect: 0 }; resultText = ''; stamp = '';
        lines = { start: chooseDarkRoomLine(config, 'start') };
        setup.hidden = true; rules.hidden = true; rule.setAttribute('aria-expanded', 'false');
        game.hidden = false; shell.dataset.view = 'playing';
        reward.hidden = true; reward.replaceChildren(); record.hidden = true; record.replaceChildren();
        log.replaceChildren(); draw();
        sound.mute(muted || document.hidden);
        void sound.unlock().then(() => { if (disposed) sound.stop(); });
        buttons.collect.focus({ preventScroll: true });
    }
    function act(action) {
        if (busy || !state) return;
        const result = darkRoomAction(state, action);
        if (!result) return;
        lines.pending = chooseDarkRoomLine(config, 'pending');
        busy = true; draw(); sound.play(action);
        delay(() => {
            state = result.state; busy = false; counts[action]++;
            history.push({ turn: state.turns, action, delta: result.delta, roomDelta: result.roomDelta, score: state.score, room: state.room });
            const finished = state.phase !== 'playing';
            if (finished) {
                // Fix the timestamp and prose at the verdict, not when the image loads.
                stamp = clearStamp(new Date()); resultText = chooseDarkRoomLine(config, state.phase);
                shell.dataset.view = 'result';
                log.replaceChildren(...history.slice().reverse().map(entry => logNode(entry, true)));
            } else {
                // Sample when the situation occurs, not during a redraw.
                if (state.room === state.rooms) {
                    const key = run.showRooms ? 'last_room' : 'last_room_hidden';
                    lines[key] = chooseDarkRoomLine(config, key);
                    lines.target_hidden = run.showTarget ? '' : chooseDarkRoomLine(config, 'target_hidden');
                } else lines.playing = chooseDarkRoomLine(config, 'playing');
                log.prepend(logNode(history[history.length - 1], false));
            }
            log.scrollTop = 0;
            draw();
            if (finished) {
                message.focus({ preventScroll: true });
                if (state.phase === 'cleared') {
                    delay(revealPhoto, c.reduced ? 0 : 1000);
                } else showRecord();
            }
        }, c.reduced ? 250 : action === 'collect' ? 850 : 900);
    }
    listen(document, 'visibilitychange', () => sound.mute(muted || document.hidden));
    game.append(hud, message, commands, reward, record, log, endControls);
    shell.append(setup, game); stage.append(shell);
}
