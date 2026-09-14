// =============================================================================
// script.js : settings.js を読み込み、URLパラメータに応じて画面を組み立てる本体
// -----------------------------------------------------------------------------
// - 非同期のデータ取得は行わない（画像はブラウザが遅延ロード）
// - 画面は全て JS で生成し、#app に描画する
// - サイト演出（animation_type / power / enable）は body の data 属性経由で CSS に伝える
// =============================================================================
import { siteSettings } from "../settings.js";
import { mountWorld } from "./worlds.js";

// -----------------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------------

// アニメーションタイプ番号 → CSS 用の名前
const ANIMATION_TYPE_NAMES = ["none", "fade", "glitch", "parallax", "ripple", "cosmic"];

// 有効範囲(animation_enable) → 対象スコープ集合
// スコープ名: "top" | "overview" | "unit" | "information"
// 4スコープの全組み合わせ（15通り）を「単一→2個→3個→全部」の順で 0〜14 に割り当てる。
const ENABLE_SCOPES = {
    // 単一（1個）
    0: ["top"],
    1: ["overview"],
    2: ["unit"],
    3: ["information"],
    // 2個組み合わせ
    4: ["top", "overview"],
    5: ["top", "unit"],
    6: ["top", "information"],
    7: ["overview", "unit"],
    8: ["overview", "information"],
    9: ["unit", "information"],
    // 3個組み合わせ
    10: ["top", "overview", "unit"],
    11: ["top", "overview", "information"],
    12: ["top", "unit", "information"],
    13: ["overview", "unit", "information"],
    // 全部（4個）
    14: ["top", "overview", "unit", "information"]
};

// object-fit 番号 → CSS 値
const OBJECT_FIT_VALUES = ["cover", "contain", "fill", "scale-down"];

// レイアウト番号 → CSS 用の名前
const LAYOUT_NAMES = ["grid", "masonry", "justified", "carousel"];

// 表示順を適用する
function applyDisplayOrder(list, order) {
    const arr = list.slice();
    if (order === 0) return arr;                 // asc
    if (order === 1) return arr.reverse();       // desc
    if (order === 2) {                           // random（Fisher-Yates）
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
    return arr;
}

// "001,052" のような from,to から連番のファイル名（拡張子付き）を作る
function buildImageList(imgfromto, parentFolder) {
    const [fromStr, toStr] = imgfromto.split(",").map(s => s.trim());
    const width = fromStr.length;               // ゼロ埋め桁数（"001" → 3）
    const from = parseInt(fromStr, 10);
    const to = parseInt(toStr, 10);
    const files = [];
    for (let i = from; i <= to; i++) {
        const name = String(i).padStart(width, "0");
        files.push(`./img/${parentFolder}/${name}.jpg`);
    }
    return files;
}

// 比率はそのまま、配信用の縮小版へ差し替える。
// ov = 一覧、vw = 単体・背景。ファイルが無いときは original に戻す。
function toWebPath(src, sub) {
    const i = src.lastIndexOf("/");
    if (i < 0) return src;
    return `${src.slice(0, i)}/${sub}${src.slice(i)}`;
}

function bindImgSrc(img, webSrc, originalSrc) {
    img.src = webSrc;
    if (webSrc === originalSrc) return;
    const onErr = () => {
        img.removeEventListener("error", onErr);
        img.src = originalSrc;
    };
    img.addEventListener("error", onErr);
}

function preloadUrl(url) {
    if (!url) return;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
}

// enabled なページ定義を URLパラメータ → 定義 の Map にまとめる
function collectPages(settings) {
    const pages = {};              // urlparam -> { key, category, def }
    const menu = settings.index.menu;
    for (const category of Object.keys(menu)) {
        const group = menu[category];
        for (const key of Object.keys(group)) {
            const def = group[key];
            if (def && def.enabled === 1) {
                pages[def.urlparam] = { key, category, def };
            }
        }
    }
    return pages;
}

// 現在のスコープに対しサイト演出を有効化するか判定
function isEffectEnabledForScope(effect, scope) {
    if (effect.animation_power === 0) return false;
    if (effect.animation_type === 0) return false;
    const scopes = ENABLE_SCOPES[effect.animation_enable] || [];
    return scopes.includes(scope);
}

// body にサイト演出用の data 属性を設定（CSS 側がこれを見て演出する）
function applyEffectAttributes(effect, scope) {
    const body = document.body;
    const active = isEffectEnabledForScope(effect, scope);
    body.dataset.anim = active ? ANIMATION_TYPE_NAMES[effect.animation_type] : "none";
    body.dataset.power = active ? String(effect.animation_power) : "0";
    body.dataset.scope = scope;
}

// -----------------------------------------------------------------------------
// サイト名エフェクト（時計スロット）
// -----------------------------------------------------------------------------
// site_name の想定は "-02:00"（±HH:MM の UTC オフセット風表記）。
// これに ":ss" を足して1秒ごとに秒を繰り上げ、59→00 の瞬間だけ分を繰り上げる。
// 数字はスロット状に下から新しい桁が出現する（CSS のトランジションで演出）。
let clockTimer = null;

function startSiteNameClock(el, baseName) {
    // baseName 例: "-02:00" → 符号/時/分を取り出す。":" 区切りでなければそのまま扱う。
    const m = baseName.match(/^([+-]?)(\d{1,2}):(\d{2})$/);
    if (!m) {
        // 想定書式でなければエフェクトなしで表示
        el.textContent = baseName;
        return;
    }
    const sign = m[1] || "";
    let baseHH = parseInt(m[2], 10);
    let baseMM = parseInt(m[3], 10);

    // スロット表示用に「符号 HH : MM : SS」の各桁を span で構築
    el.classList.add("clock");
    el.textContent = "";

    const signSpan = document.createElement("span");
    signSpan.className = "clock-sign";
    signSpan.textContent = sign;
    el.appendChild(signSpan);

    // HH, :, MM, :, SS を桁 span で作る
    const digitRefs = {}; // 位置キー -> span
    function addGroup(label) {
        const group = document.createElement("span");
        group.className = "clock-group";
        const d0 = document.createElement("span");
        const d1 = document.createElement("span");
        d0.className = "clock-digit";
        d1.className = "clock-digit";
        group.appendChild(d0);
        group.appendChild(d1);
        el.appendChild(group);
        digitRefs[label] = [d0, d1];
    }
    function addColon() {
        const c = document.createElement("span");
        c.className = "clock-colon";
        c.textContent = ":";
        el.appendChild(c);
    }

    addGroup("hh");
    addColon();
    addGroup("mm");
    addColon();
    addGroup("ss");

    // 桁を更新。value が変わったとき、または force 指定時に slot アニメーションを付ける。
    // force は「値は同じでも繰り上がり演出を出したい」場合に使う（例: 分が 00→00）。
    function setDigit(spanPair, value, force) {
        const s = String(value).padStart(2, "0");
        [0, 1].forEach(i => {
            const span = spanPair[i];
            const ch = s[i];
            const changed = span.textContent !== ch;
            span.textContent = ch;
            if (changed || force) {
                // 再トリガーのため一旦クラスを外して付け直す
                span.classList.remove("tick");
                // 強制リフロー
                void span.offsetWidth;
                span.classList.add("tick");
            }
        });
    }

    // 前回描画時の秒。59→00 の巻き戻り検知に使う。
    let prevSS = null;

    function render() {
        const now = new Date();
        const ss = now.getSeconds();
        // 時・分は起点（site_name）の値で固定。実時間には同期させない。
        // 秒だけリアルタイムで動き、59→00 に戻る瞬間に「分が繰り上がろうとするが
        // 同じ 00 に戻る」スロット演出を出す（＝進むようで進まない時計）。
        const hh = baseHH;
        const mm = baseMM;

        // 秒が巻き戻った（59→00 など前回より小さくなった）瞬間だけ分を繰り上げ演出。
        // 分の値は変わらないが、force でスロットアニメーションを発火させる。
        const minuteRollover = prevSS !== null && ss < prevSS;

        setDigit(digitRefs.hh, hh);
        setDigit(digitRefs.mm, mm, minuteRollover);
        setDigit(digitRefs.ss, ss);

        prevSS = ss;
    }

    render();
    if (clockTimer) clearInterval(clockTimer);
    // 秒の変わり目を取りこぼさないよう短めの間隔でポーリング
    clockTimer = setInterval(render, 200);
}

function renderSiteName(el, settings, effect) {
    const baseName = settings.site_info.site_name;
    if (effect.site_effect === 1) {
        startSiteNameClock(el, baseName);
    } else {
        if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
        el.textContent = baseName;
    }
}

// -----------------------------------------------------------------------------
// 共通レイアウト（ヘッダー / ナビ / フッター）
// -----------------------------------------------------------------------------
function buildHeader(settings, pages, currentParam) {
    const header = document.createElement("header");
    header.className = "site-header";

    // サイト名（クリックでトップへ）
    const brand = document.createElement("a");
    brand.className = "site-brand";
    brand.href = "./";
    // クライアント側ルーティングでトップへ（再読み込みしない）
    brand.addEventListener("click", (e) => navigateTo(e, "./"));
    header.appendChild(brand);
    renderSiteName(brand, settings, settings.index.effect);

    // Secret keeps only the animated home mark; no navigation bar is created.
    if (pages[currentParam]?.def?.pagetype === 2) {
        header.className = "secret-home";
        brand.setAttribute("aria-label", "トップへ戻る");
        return header;
    }

    // ナビ（カテゴリ名クリックで子メニューを開閉するドロップダウン）
    const nav = document.createElement("nav");
    nav.className = "site-nav";
    const menu = settings.index.menu;
    for (const category of Object.keys(menu)) {
        const group = menu[category];

        // enabled な子だけ抽出
        const children = Object.keys(group)
            .map(key => ({ key, def: group[key] }))
            .filter(item => item.def.enabled === 1);
        if (children.length === 0) continue;

        const groupWrap = document.createElement("div");
        groupWrap.className = "nav-group";

        // カテゴリ見出し（クリックで開閉するトグル）
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "nav-group-toggle";
        // 表示はスネークケースの大文字
        toggle.textContent = toSnakeUpper(category);
        // 現在ページがこのカテゴリ配下なら active
        const containsCurrent = children.some(c => c.def.urlparam === currentParam);
        if (containsCurrent) toggle.classList.add("active");
        groupWrap.appendChild(toggle);

        // ドロップダウン（子リンク）
        const dropdown = document.createElement("div");
        dropdown.className = "nav-dropdown";
        for (const { key, def } of children) {
            const a = document.createElement("a");
            a.className = "nav-link";
            a.href = `?${def.urlparam}`;
            // 表示はスネークケース（キーをそのままスネーク化）
            a.textContent = toSnakeLower(key);
            if (def.urlparam === currentParam) a.classList.add("active");
            // クライアント側ルーティング（ページ再読み込みを避け、ローディングを再表示させない）
            a.addEventListener("click", (e) => navigateTo(e, `?${def.urlparam}`));
            dropdown.appendChild(a);
        }
        groupWrap.appendChild(dropdown);

        // 開閉制御：クリックで自身をトグルし、他は閉じる
        toggle.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = groupWrap.classList.contains("open");
            nav.querySelectorAll(".nav-group.open").forEach(g => g.classList.remove("open"));
            if (!isOpen) groupWrap.classList.add("open");
        });

        nav.appendChild(groupWrap);
    }

    // ナビ外クリックで全ドロップダウンを閉じる
    document.addEventListener("click", () => {
        nav.querySelectorAll(".nav-group.open").forEach(g => g.classList.remove("open"));
    });

    header.appendChild(nav);
    return header;
}

// 文字列をスネークケースへ変換するヘルパ
// camelCase / space / ハイフンなどを _ に統一する。
function toSnakeLower(str) {
    return String(str)
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase 境界
        .replace(/[\s\-]+/g, "_")                // 空白・ハイフン
        .toLowerCase();
}
function toSnakeUpper(str) {
    return toSnakeLower(str).toUpperCase();
}

function buildFooter(settings) {
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    const year = new Date().getFullYear();
    footer.textContent = `© ${year} ${settings.site_info.allrightsresearved}. All Rights Reserved.`;
    return footer;
}

// -----------------------------------------------------------------------------
// トップページ
// -----------------------------------------------------------------------------
// ホバー時テキストエフェクトを要素に適用する。
// type: 0:none 1:glow 2:glitch 3:wave 4:shuffle 5:spread
const HOVER_NAMES = ["none", "glow", "glitch", "wave", "shuffle", "spread"];
function applyHoverText(el, text, type) {
    const name = HOVER_NAMES[type] || "none";
    el.dataset.hover = name;

    // glitch は ::before/::after で複製表示するため data-text に元テキストを持たせる
    if (name === "glitch") {
        el.dataset.text = text;
        el.textContent = text;
        return;
    }

    // wave / shuffle は1文字ずつ span に分割
    if (name === "wave" || name === "shuffle") {
        el.textContent = "";
        const chars = Array.from(text);
        chars.forEach((ch, i) => {
            const span = document.createElement("span");
            span.className = "hover-char";
            span.textContent = ch === " " ? "\u00a0" : ch;
            span.style.setProperty("--ci", String(i));
            el.appendChild(span);
        });

        // shuffle：ホバー中に各文字をランダム記号へ一瞬置換してから戻す
        if (name === "shuffle") {
            const glyphs = "!<>-_\\/[]{}=+*^?#";
            let running = false;
            el.addEventListener("mouseenter", () => {
                if (running) return;
                running = true;
                const spans = el.querySelectorAll(".hover-char");
                spans.forEach((span, i) => {
                    const original = chars[i] === " " ? "\u00a0" : chars[i];
                    let ticks = 0;
                    const max = 6 + i; // 文字ごとに戻るタイミングをずらす
                    const iv = setInterval(() => {
                        if (ticks >= max) {
                            span.textContent = original;
                            clearInterval(iv);
                            if (i === spans.length - 1) running = false;
                            return;
                        }
                        span.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
                        ticks++;
                    }, 30);
                });
            });
        }
        return;
    }

    // none / glow / spread はテキストのみ（CSS で完結）
    el.textContent = text;
}

// 要素を一列に保ったまま、親幅を超える場合はフォントサイズを縮めて収める。
// CSS の clamp で決まったサイズを上限とし、はみ出す分だけ下げる。
function fitOneLine(el) {
    const fit = () => {
        // いったん上限（CSS 由来）に戻してから測る
        el.style.fontSize = "";
        const parent = el.parentElement;
        if (!parent) return;
        const available = parent.clientWidth;
        if (available <= 0) return;

        // 現在の実サイズを取得し、はみ出していれば比率で縮める
        let size = parseFloat(getComputedStyle(el).fontSize);
        // 余白ぶんの安全マージン（左右で少し空ける）
        const target = available * 0.96;
        // scrollWidth が収まるまで数回に分けて調整
        let guard = 0;
        while (el.scrollWidth > target && size > 10 && guard < 40) {
            size *= target / el.scrollWidth;
            el.style.fontSize = `${size}px`;
            guard++;
        }
    };
    fit();
    // 画像や字形の読み込み・レイアウト確定後にもう一度
    requestAnimationFrame(fit);
    // リサイズ追従（トップ表示中のみ有効。再描画で要素は作り直される）
    if (heroFitHandler) window.removeEventListener("resize", heroFitHandler);
    heroFitHandler = fit;
    window.addEventListener("resize", heroFitHandler);
}
let heroFitHandler = null;

function buildTop(settings) {
    const section = document.createElement("section");
    section.className = "page page-top";

    const top = settings.index.top || {};

    const hero = document.createElement("div");
    hero.className = "hero anim-item";

    // サイト名（大きな見出し）。show_site_name が1のときのみ表示。
    // 表示文言は top.site_name_text（空なら site_info.site_name にフォールバック）。
    // 時計エフェクトはヘッダーで動いているため、ここは静的テキストを表示する。
    if (top.show_site_name === 1) {
        const h = document.createElement("h1");
        h.className = "hero-title";
        const text = top.site_name_text || settings.site_info.site_name;
        applyHoverText(h, text, top.site_name_hover || 0);
        hero.appendChild(h);
        // 一列を保ったまま、画面幅を超える場合はフォントサイズを縮めて収める
        fitOneLine(h);
    }

    // welcome テキスト。show_welcome が1のときのみ表示。
    if (top.show_welcome === 1) {
        const sub = document.createElement("p");
        sub.className = "hero-sub";
        applyHoverText(sub, top.welcome_text || "welcome", top.welcome_hover || 0);
        hero.appendChild(sub);
    }

    section.appendChild(hero);
    return section;
}

// -----------------------------------------------------------------------------
// ギャラリー：一覧（overview）
// -----------------------------------------------------------------------------
function buildGalleryOverview(def) {
    const g = def.gstyle;
    const ov = g.overview;

    const section = document.createElement("section");
    section.className = "page page-gallery";

    const grid = document.createElement("div");
    grid.className = `gallery layout-${LAYOUT_NAMES[ov.layout]}`;
    grid.dataset.aspect = String(ov.aspect_ratio);
    grid.dataset.fit = OBJECT_FIT_VALUES[ov.object_fit];

    // 列数を CSS 変数へ（grid で直接使用。masonry でも列数指定に流用する）
    grid.style.setProperty("--columns", String(ov.columns));

    // 画像リストを作成し、表示順を適用
    let files = buildImageList(def.imgfromto, def.imgparentfoldername);
    files = applyDisplayOrder(files, ov.display_order);

    files.forEach((src, idx) => {
        const cell = document.createElement("figure");
        cell.className = "gallery-cell anim-item";
        cell.style.setProperty("--i", String(idx));

        const img = document.createElement("img");
        img.loading = idx < 4 ? "eager" : "lazy";
        img.decoding = "async";
        img.alt = "";
        bindImgSrc(img, toWebPath(src, "ov"), src);
        img.style.objectFit = OBJECT_FIT_VALUES[ov.object_fit];
        // 画像の色（0:そのまま 1:モノクロ）
        if (ov.imgcolor === 1) img.classList.add("img-mono");
        cell.appendChild(img);

        // クリックで単体表示
        cell.addEventListener("click", () => openUnit(files, idx, def));
        grid.appendChild(cell);
    });

    section.appendChild(grid);
    return section;
}

// 有効な通常ギャラリーの原寸画像だけを集める。ov / vw は生成しない。
function collectSpecialGalleryFiles(settings) {
    const files = [];
    const gallery = settings.index.menu.gallery || {};
    for (const key of Object.keys(gallery)) {
        const def = gallery[key];
        if (!def || def.enabled !== 1 || def.pagetype !== 0) continue;
        if (!def.imgparentfoldername || !def.imgfromto) continue;
        files.push(...buildImageList(def.imgfromto, def.imgparentfoldername));
    }
    return files;
}

let specialGalleryUnlocked = false;
let specialGalleryPatternOverride = null;
let lastRenderedParam = null;

let disposeWorld = null;

function buildSpecialGallery(settings, def) {
    const section = document.createElement("section");
    section.className = "page page-special-gallery";
    const config = settings.index.menu.information?.special_gallery || def || {};

    if (!specialGalleryUnlocked) {
        section.dataset.state = "gate";
        const gate = document.createElement("div");
        gate.className = "special-gallery-gate anim-item";

        const heading = document.createElement("h1");
        heading.className = "info-heading";
        heading.textContent = config.heading || "Special Gallery";
        gate.appendChild(heading);

        const description = document.createElement("p");
        description.className = "info-paragraph special-gallery-description";
        description.textContent = config.description || "Enter the password to open this edition.";
        gate.appendChild(description);

        const form = document.createElement("form");
        form.className = "special-gallery-form";
        const input = document.createElement("input");
        input.type = "password";
        input.name = "password";
        input.autocomplete = "current-password";
        input.placeholder = config.placeholder || "password";
        input.setAttribute("aria-label", "password");
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.textContent = config.submit_label || "OPEN";
        const error = document.createElement("p");
        error.className = "special-gallery-error";
        error.setAttribute("role", "alert");

        form.appendChild(input);
        form.appendChild(submit);
        form.appendChild(error);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            const value = input.value;
            // パスワードは設定値との完全一致のみ。体験の選択は入場後に行う。
            if (value === String(config.password ?? "")) {
                specialGalleryPatternOverride = null;
                specialGalleryUnlocked = true;
                render();
                return;
            }
            error.textContent = config.error_message || "Password does not match.";
            input.select();
        });
        gate.appendChild(form);
        section.appendChild(gate);
        requestAnimationFrame(() => input.focus());
        return section;
    }

    const pattern = specialGalleryPatternOverride ?? 1;
    section.dataset.state = "world";
    section.dataset.pattern = String(pattern);

    const files = pattern === 99 ? [] : collectSpecialGalleryFiles(settings);
    disposeWorld = mountWorld(section, pattern, files, next => {
        specialGalleryPatternOverride = next;
        render();
        window.scrollTo(0, 0);
    }, config.pages);
    return section;
}

// -----------------------------------------------------------------------------
// ギャラリー：単体表示（unit）
// -----------------------------------------------------------------------------
let unitState = null;

function openUnit(files, index, def) {
    const g = def.gstyle;
    const mode = g.unit.display_mode;      // 0:fullscreen 1:modal
    const trans = g.transition;            // mode:0 fade / 1 slide, duration

    // unit スコープ用のエフェクト属性を一時適用
    applyEffectAttributes(siteSettings.index.effect, "unit");

    const overlay = document.createElement("div");
    overlay.className = `unit-overlay unit-${mode === 0 ? "fullscreen" : "modal"} trans-${trans.mode === 0 ? "fade" : "slide"}`;
    overlay.style.setProperty("--duration", `${trans.duration}ms`);

    const stage = document.createElement("div");
    stage.className = "unit-stage";

    const img = document.createElement("img");
    img.className = "unit-img";
    img.decoding = "async";
    bindImgSrc(img, toWebPath(files[index], "vw"), files[index]);
    img.alt = "";
    // 画像の色（0:そのまま 1:モノクロ）
    if (g.unit.imgcolor === 1) img.classList.add("img-mono");
    stage.appendChild(img);

    // 表示比率の決定。
    // match_overview_aspect が1なら overview の aspect_ratio 枠に cover で合わせる（画像は切れる）。
    // 0なら imgsize_unify に従い、画像を歪めず・切らずに辺だけ揃える。
    if (g.unit.match_overview_aspect === 1) {
        stage.dataset.aspect = String(g.overview.aspect_ratio ?? 0);
        img.style.objectFit = "cover"; // 枠を埋める（トリミング）
    } else {
        stage.dataset.unify = String(g.unit.imgsize_unify ?? 0);
    }

    // 閉じるボタン
    const closeBtn = document.createElement("button");
    closeBtn.className = "unit-close";
    closeBtn.setAttribute("aria-label", "close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeUnit);

    // 前後ナビ
    const prev = document.createElement("button");
    prev.className = "unit-nav unit-prev";
    prev.setAttribute("aria-label", "previous");
    prev.textContent = "‹";
    const next = document.createElement("button");
    next.className = "unit-nav unit-next";
    next.setAttribute("aria-label", "next");
    next.textContent = "›";

    prev.addEventListener("click", () => stepUnit(-1));
    next.addEventListener("click", () => stepUnit(1));

    const navs = document.createElement("div");
    navs.className = "unit-navs";
    navs.appendChild(prev);
    navs.appendChild(next);

    const frame = document.createElement("div");
    frame.className = "unit-frame";
    frame.appendChild(stage);
    frame.appendChild(navs);

    overlay.appendChild(frame);
    overlay.appendChild(closeBtn);

    // 背景クリックで閉じる（modal時）
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeUnit();
    });

    let touchStartX = 0;
    let touchStartY = 0;
    overlay.addEventListener("touchstart", (e) => {
        const t = e.changedTouches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
    }, { passive: true });
    overlay.addEventListener("touchend", (e) => {
        if (e.target.closest("button")) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
        stepUnit(dx < 0 ? 1 : -1);
    }, { passive: true });

    document.body.appendChild(overlay);
    document.body.classList.add("unit-open");

    unitState = { files, index, img, def, overlay };

    // 表示アニメーション起動
    requestAnimationFrame(() => overlay.classList.add("show"));
    preloadUnitNeighbors(files, index);

    // キーボード操作
    document.addEventListener("keydown", onUnitKey);
}

function preloadUnitNeighbors(files, index) {
    const len = files.length;
    if (len < 2) return;
    preloadUrl(toWebPath(files[(index + 1) % len], "vw"));
    preloadUrl(toWebPath(files[(index - 1 + len) % len], "vw"));
}

function stepUnit(delta) {
    if (!unitState) return;
    const len = unitState.files.length;
    unitState.index = (unitState.index + delta + len) % len;
    const trans = unitState.def.gstyle.transition;

    // 遷移アニメーション（fade / slide）
    const img = unitState.img;
    img.classList.remove("enter-fade", "enter-slide-left", "enter-slide-right");
    void img.offsetWidth;
    img.src = toWebPath(unitState.files[unitState.index], "vw");
    preloadUnitNeighbors(unitState.files, unitState.index);
    if (trans.mode === 0) {
        img.classList.add("enter-fade");
    } else {
        img.classList.add(delta > 0 ? "enter-slide-left" : "enter-slide-right");
    }
}

function onUnitKey(e) {
    if (e.key === "Escape") closeUnit();
    else if (e.key === "ArrowLeft") stepUnit(-1);
    else if (e.key === "ArrowRight") stepUnit(1);
}

function closeUnit() {
    if (!unitState) return;
    const { overlay } = unitState;
    overlay.classList.remove("show");
    document.removeEventListener("keydown", onUnitKey);
    document.body.classList.remove("unit-open");
    const remove = () => overlay.remove();
    overlay.addEventListener("transitionend", remove, { once: true });
    // 念のためのフォールバック
    setTimeout(remove, 800);
    unitState = null;
    // スコープを元の overview に戻す
    applyEffectAttributes(siteSettings.index.effect, "overview");
}

// -----------------------------------------------------------------------------
// 情報ページ（about / special_thx など pagetype:1）
// -----------------------------------------------------------------------------
// SNS アイコンの SVG パス（モノクロ。currentColor で塗るのでCSSから色を制御できる）
const SOCIAL_ICONS = {
    // X（旧 Twitter）
    twitter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    // YouTube
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z"/></svg>'
};

function buildInformation(key, def) {
    const section = document.createElement("section");
    section.className = "page page-info";

    const wrap = document.createElement("div");
    wrap.className = "info-wrap anim-item";

    const d = def.display || {};

    // プロフィール画像（正方形）。見出しより前に表示。
    if (d.profile_image) {
        const figure = document.createElement("div");
        figure.className = "info-profile";
        const pimg = document.createElement("img");
        pimg.className = "info-profile-img";
        pimg.src = `./${d.profile_image}`;
        pimg.alt = "";
        figure.appendChild(pimg);
        wrap.appendChild(figure);
    }

    const heading = document.createElement("h1");
    heading.className = "info-heading";
    heading.textContent = d.heading || key;
    wrap.appendChild(heading);

    // 段落型（about など）
    if (Array.isArray(d.paragraphs)) {
        d.paragraphs.forEach(text => {
            const p = document.createElement("p");
            p.className = "info-paragraph";
            p.textContent = text;
            wrap.appendChild(p);
        });
    }

    // 名前一覧型（special_thx）：「 / 」区切り、見切れる場合は折り返す
    if (Array.isArray(d.names)) {
        const names = document.createElement("p");
        names.className = "info-names";
        names.textContent = d.names.join(" / ");
        wrap.appendChild(names);
    }

    // SNSリンク（モノクロアイコン。クリックで新しいタブ）
    if (Array.isArray(d.social) && d.social.length > 0) {
        const social = document.createElement("div");
        social.className = "info-social";
        d.social.forEach(item => {
            const icon = SOCIAL_ICONS[item.type];
            if (!icon || !item.url) return;
            const a = document.createElement("a");
            a.className = "info-social-link";
            a.href = item.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer"; // 新しいタブでの安全なリンク
            a.setAttribute("aria-label", item.type);
            a.innerHTML = icon;
            social.appendChild(a);
        });
        wrap.appendChild(social);
    }

    section.appendChild(wrap);
    return section;
}

// -----------------------------------------------------------------------------
// パララックス（animation_type:3）用のマウス追従
// -----------------------------------------------------------------------------
let parallaxHandler = null;
function setupParallax(active) {
    if (parallaxHandler) {
        window.removeEventListener("mousemove", parallaxHandler);
        parallaxHandler = null;
    }
    if (!active) return;
    parallaxHandler = (e) => {
        const cx = (e.clientX / window.innerWidth - 0.5) * 2;
        const cy = (e.clientY / window.innerHeight - 0.5) * 2;
        document.body.style.setProperty("--px", cx.toFixed(3));
        document.body.style.setProperty("--py", cy.toFixed(3));
    };
    window.addEventListener("mousemove", parallaxHandler);
}

// -----------------------------------------------------------------------------
// cosmic（animation_type:5）用の星屑パーティクル背景
// -----------------------------------------------------------------------------
function setupCosmic(active, power) {
    const existing = document.getElementById("cosmic-layer");
    if (existing) existing.remove();
    if (!active) return;

    const layer = document.createElement("div");
    layer.id = "cosmic-layer";
    layer.className = "cosmic-layer";
    // 強度に応じて粒子数を変える
    const count = power === 3 ? 120 : power === 2 ? 70 : 35;
    for (let i = 0; i < count; i++) {
        const star = document.createElement("span");
        star.className = "cosmic-star";
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.setProperty("--delay", `${(Math.random() * 4).toFixed(2)}s`);
        star.style.setProperty("--size", `${(Math.random() * 2 + 1).toFixed(1)}px`);
        star.style.setProperty("--dur", `${(Math.random() * 3 + 2).toFixed(2)}s`);
        layer.appendChild(star);
    }
    document.body.appendChild(layer);
}

// ripple（animation_type:4）用：クリック位置に波紋を出す
let rippleHandler = null;
function setupRipple(active) {
    if (rippleHandler) {
        document.removeEventListener("click", rippleHandler, true);
        rippleHandler = null;
    }
    if (!active) return;
    rippleHandler = (e) => {
        const r = document.createElement("span");
        r.className = "ripple-fx";
        r.style.left = `${e.clientX}px`;
        r.style.top = `${e.clientY}px`;
        document.body.appendChild(r);
        r.addEventListener("animationend", () => r.remove(), { once: true });
    };
    document.addEventListener("click", rippleHandler, true);
}

// タイプ別の追加演出をまとめてセットアップ
function setupTypeEffects(effect, scope) {
    const active = isEffectEnabledForScope(effect, scope);
    const type = active ? effect.animation_type : 0;
    setupParallax(type === 3);
    setupCosmic(type === 5, effect.animation_power);
    setupRipple(type === 4);
}

// -----------------------------------------------------------------------------
// マウスカーソルエフェクト（cursor_effect）
// animation_type とは独立。ページ遷移をまたいで継続する（初期化時に1度だけ起動）。
// -----------------------------------------------------------------------------
const CURSOR_NAMES = ["none", "ring", "trail", "glow", "magnetic", "particles"];
let cursorRAF = null;         // requestAnimationFrame ID
let cursorCleanup = null;     // 破棄用ハンドラ

function setupCursorEffect(effect) {
    // タッチ主体の端末や、標準指定/無効時は何もしない
    const type = effect.cursor_effect || 0;
    const power = effect.animation_power || 1;

    // 既存のカーソル演出を破棄
    if (cursorCleanup) { cursorCleanup(); cursorCleanup = null; }
    if (cursorRAF) { cancelAnimationFrame(cursorRAF); cursorRAF = null; }
    document.body.dataset.cursor = CURSOR_NAMES[type] || "none";

    if (type === 0) return;
    // 粗いポインタ（タッチ）では無効化
    if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        document.body.dataset.cursor = "none";
        return;
    }

    // 強度パラメータ
    const scale = power === 3 ? 1.6 : power === 2 ? 1.25 : 1;
    const trailCount = power === 3 ? 14 : power === 2 ? 9 : 5;
    const particleRate = power === 3 ? 4 : power === 2 ? 2 : 1;

    // カーソル座標（追従はイージングで滑らかに）
    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let cx = mx, cy = my;
    let hovering = false;

    // レイヤー生成
    const layer = document.createElement("div");
    layer.className = "cursor-layer";
    document.body.appendChild(layer);

    const dots = [];          // trail/particles 用の要素プール
    const nodes = [];         // ring/glow のメイン要素

    // メイン要素（ring / glow / magnetic）
    let main = null;
    if (type === 1 || type === 3 || type === 4) {
        main = document.createElement("div");
        main.className = "cursor-main";
        main.style.setProperty("--scale", String(scale));
        layer.appendChild(main);
        nodes.push(main);
    }

    // trail 用の残像要素をプールしておく
    if (type === 2) {
        for (let i = 0; i < trailCount; i++) {
            const d = document.createElement("div");
            d.className = "cursor-trail-dot";
            d.style.setProperty("--scale", String(scale));
            d.style.opacity = String(1 - i / trailCount);
            layer.appendChild(d);
            dots.push({ el: d, x: mx, y: my });
        }
    }

    // マウス移動
    function onMove(e) {
        mx = e.clientX;
        my = e.clientY;
        // particles: 移動時に粒子を散らす
        if (type === 5) {
            for (let i = 0; i < particleRate; i++) spawnParticle(mx, my, scale);
        }
    }
    window.addEventListener("mousemove", onMove, { passive: true });

    // ホバー対象（a, button, 画像セル）に近づいたら反応
    function onOver(e) {
        if (e.target.closest("a, button, .gallery-cell, .nav-group-toggle")) {
            hovering = true;
            if (main) main.classList.add("hover");
        }
    }
    function onOut(e) {
        if (e.target.closest("a, button, .gallery-cell, .nav-group-toggle")) {
            hovering = false;
            if (main) main.classList.remove("hover");
        }
    }
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);

    // particles 用の使い捨て要素
    function spawnParticle(x, y, s) {
        const p = document.createElement("div");
        p.className = "cursor-particle";
        const ang = Math.random() * Math.PI * 2;
        const dist = (Math.random() * 24 + 8) * s;
        p.style.left = `${x}px`;
        p.style.top = `${y}px`;
        p.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
        p.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
        p.style.setProperty("--s", (Math.random() * 0.6 + 0.6).toFixed(2));
        layer.appendChild(p);
        p.addEventListener("animationend", () => p.remove(), { once: true });
    }

    // アニメーションループ（イージング追従）
    function loop() {
        // magnetic は吸着で強めに、それ以外は普通に追従
        const ease = type === 4 && hovering ? 0.28 : 0.18;
        cx += (mx - cx) * ease;
        cy += (my - cy) * ease;

        if (main) {
            main.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
        }

        // trail: 残像を数珠つなぎに追従させる
        if (type === 2) {
            let px = mx, py = my;
            for (const dot of dots) {
                dot.x += (px - dot.x) * 0.35;
                dot.y += (py - dot.y) * 0.35;
                dot.el.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0) translate(-50%, -50%)`;
                px = dot.x;
                py = dot.y;
            }
        }

        cursorRAF = requestAnimationFrame(loop);
    }
    loop();

    // 破棄処理
    cursorCleanup = () => {
        window.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseover", onOver, true);
        document.removeEventListener("mouseout", onOut, true);
        layer.remove();
    };
}

// -----------------------------------------------------------------------------
// トップページ body 背景スライドshow（body_bg_effect）
// 全画像を全面背景に敷き、指定速度で切り替える。演出は値で分岐。
// トップページ表示中だけ動かし、他ページでは停止・非表示にする。
// -----------------------------------------------------------------------------
const BG_NAMES = ["none", "cut", "fade", "zoom", "glitch", "flash", "slide"];
let bgTimer = null;
let bgLayer = null;
let bgFiles = [];
let bgIndex = 0;

// img配下のフォルダ名 → そのフォルダの imgfromto を引く索引を作る。
// gallery の各ページ定義（imgparentfoldername と imgfromto）を再利用するため、
// 背景専用に画像範囲を別途持つ必要がない。
function buildFolderRangeMap(settings) {
    const map = {};
    const gallery = (settings.index.menu && settings.index.menu.gallery) || {};
    for (const key of Object.keys(gallery)) {
        const def = gallery[key];
        // 有効（enabled:1）なギャラリーページ（pagetype:0）で親フォルダと範囲が
        // 揃っているものだけ登録。enabled:0 のフォルダは bg_img_folder に
        // 書かれていても対象外になる。
        if (def && def.enabled === 1 && def.pagetype === 0 && def.imgparentfoldername && def.imgfromto) {
            map[def.imgparentfoldername] = def.imgfromto;
        }
    }
    return map;
}

// bg_img_folder（カンマ区切り）で指定された各フォルダの全画像パスを作る。
// 各フォルダの画像範囲は gallery 定義の imgfromto から引くため、
// フォルダごとに枚数が異なっても正しく対象化できる。
function buildBgFiles(effect, settings) {
    const folders = String(effect.bg_img_folder || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    const rangeMap = buildFolderRangeMap(settings);

    let files = [];
    for (const folder of folders) {
        const imgfromto = rangeMap[folder];
        // 対応する gallery 定義が無いフォルダはスキップ（存在しない画像を読まない）
        if (!imgfromto) continue;
        files = files.concat(buildImageList(imgfromto, folder).map(src => toWebPath(src, "vw")));
    }
    // 表示順
    return effect.bg_order === 1 ? applyDisplayOrder(files, 2) : files;
}

// 起動時に温めるのは背景の「今」と「次」だけ。ギャラリー原寸は読まない。
function collectWarmImages(settings) {
    const effect = settings.index.effect;
    if ((effect.body_bg_effect || 0) === 0) return [];
    return buildBgFiles(effect, settings).slice(0, 2);
}

// プリロード済み画像を保持（GC で破棄されないよう参照を残す）
let bgPreloaded = [];
let bgReady = false;

// 全背景画像をプリロード＋デコードする。進捗を onProgress(done, total) で通知。
function preloadBgImages(files, onProgress) {
    let done = 0;
    const total = files.length;
    const tasks = files.map(src => {
        const img = new Image();
        img.src = src;
        bgPreloaded.push(img); // 参照保持
        // decode() でデコードまで完了させる（切替時の白抜けを防ぐ）
        const p = (img.decode ? img.decode() : Promise.resolve())
            .catch(() => { /* decode 非対応/失敗は onload にフォールバック */
                return new Promise(res => { img.onload = img.onerror = res; });
            })
            .then(() => { done++; if (onProgress) onProgress(done, total); });
        return p;
    });
    return Promise.all(tasks);
}

// ローディング画面を表示。完了で解決する Promise を返す。
const LOADING_NAMES = ["", "ring", "bar", "counter", "tiles", "glitch"];

// ローディング画面を表示。type(1〜5) と 総枚数 total に応じて構造を変える。
function showLoader(type, total) {
    const t = LOADING_NAMES[type] ? type : 1; // 不正値は ring にフォールバック
    const name = LOADING_NAMES[t];

    const loader = document.createElement("div");
    loader.className = "loader";
    loader.id = "site-loader";
    loader.dataset.loading = name;

    const siteName = siteSettings.site_info.site_name;

    if (t === 1) {
        // ring：円形プログレス＋％
        loader.innerHTML = `
            <div class="loader-inner">
                <div class="loader-ring"></div>
                <div class="loader-count"><span class="loader-pct">0</span><span class="loader-unit">%</span></div>
            </div>`;
    } else if (t === 2) {
        // bar：横棒プログレスバー＋％
        loader.innerHTML = `
            <div class="loader-bar-wrap">
                <div class="loader-bar"><div class="loader-bar-fill"></div></div>
                <div class="loader-count"><span class="loader-pct">0</span><span class="loader-unit">%</span></div>
            </div>`;
    } else if (t === 3) {
        // counter：大きな数字のみ
        loader.innerHTML = `
            <div class="loader-big"><span class="loader-pct">0</span><span class="loader-unit">%</span></div>`;
    } else if (t === 4) {
        // tiles：総枚数ぶんのタイルを生成し、進捗で埋める。列数は総数から正方形に近づける
        const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
        const cells = Array.from({ length: total }, () => `<span class="loader-tile"></span>`).join("");
        loader.innerHTML = `
            <div class="loader-tiles" style="--cols:${cols}">${cells}</div>
            <div class="loader-count"><span class="loader-pct">0</span><span class="loader-unit">%</span></div>`;
    } else if (t === 5) {
        // glitch：サイト名がグリッチ＋％
        loader.innerHTML = `
            <div class="loader-glitch" data-text="${siteName}">${siteName}</div>
            <div class="loader-count"><span class="loader-pct">0</span><span class="loader-unit">%</span></div>`;
    }

    document.body.appendChild(loader);
    return loader;
}

// 表示する進捗率（0〜100）を直接セットする。
function updateLoader(loader, pct) {
    if (!loader) return;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    loader.querySelectorAll(".loader-pct").forEach(el => el.textContent = String(p));
    loader.style.setProperty("--pct", String(p));

    // tiles：進捗率に応じた枚数ぶんのタイルを filled にする
    if (loader.dataset.loading === "tiles") {
        const tiles = loader.querySelectorAll(".loader-tile");
        const fillCount = Math.round((p / 100) * tiles.length);
        tiles.forEach((tile, i) => {
            tile.classList.toggle("filled", i < fillCount);
        });
    }
}

function hideLoader(loader) {
    if (!loader) return;
    loader.classList.add("done");
    loader.addEventListener("transitionend", () => loader.remove(), { once: true });
    setTimeout(() => loader.remove(), 1200); // フォールバック
}

// 背景を破棄
function teardownBackground() {
    if (bgTimer) { cancelAnimationFrame(bgTimer); bgTimer = null; }
    if (bgLayer) { bgLayer.remove(); bgLayer = null; }
    document.body.removeAttribute("data-bg");
    document.body.style.removeProperty("--bg-overlay");
}

// 背景スライドショーを起動（トップ表示時に呼ぶ）。
// スロットは今と次の2枚。切替演出（cut/fade/zoom 等）は settings のまま。
function setupBackground(effect) {
    teardownBackground();

    const type = effect.body_bg_effect || 0;
    if (type === 0) return;
    if (bgFiles.length === 0) return;

    const reduce = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.body.dataset.bg = BG_NAMES[type] || "none";
    document.body.style.setProperty("--bg-overlay", String(effect.bg_overlay ?? 0.35));

    bgLayer = document.createElement("div");
    bgLayer.className = "bg-layer";

    const slotA = document.createElement("div");
    const slotB = document.createElement("div");
    slotA.className = "bg-slot show";
    slotB.className = "bg-slot";
    slotA.style.backgroundImage = `url("${bgFiles[0]}")`;
    slotB.style.backgroundImage = `url("${bgFiles[bgFiles.length > 1 ? 1 : 0]}")`;
    bgLayer.appendChild(slotA);
    bgLayer.appendChild(slotB);

    const flash = document.createElement("div");
    flash.className = "bg-flash";
    bgLayer.appendChild(flash);

    const overlay = document.createElement("div");
    overlay.className = "bg-overlay";
    bgLayer.appendChild(overlay);

    document.body.prepend(bgLayer);

    const slots = [slotA, slotB];
    let visible = 0;
    bgIndex = 0;

    function advance() {
        if (bgFiles.length < 2) return;
        const hidden = 1 - visible;
        bgIndex = (bgIndex + 1) % bgFiles.length;

        if (type === 5 && !reduce) {
            flash.classList.remove("fire");
            void flash.offsetWidth;
            flash.classList.add("fire");
        }

        slots[hidden].classList.add("show");
        slots[visible].classList.remove("show");
        visible = hidden;

        const upcoming = (bgIndex + 1) % bgFiles.length;
        slots[1 - visible].style.backgroundImage = `url("${bgFiles[upcoming]}")`;
    }

    let interval = Math.max(30, effect.speed || 100);
    if (reduce) interval = Math.max(interval, 900);

    let lastTime = performance.now();
    function tick(now) {
        if (now - lastTime >= interval) {
            lastTime = now;
            advance();
        }
        bgTimer = requestAnimationFrame(tick);
    }
    bgTimer = requestAnimationFrame(tick);
}

// -----------------------------------------------------------------------------
// スクロール連動でのアイテム出現（IntersectionObserver）
// -----------------------------------------------------------------------------
let io = null;
function observeAnimItems(root) {
    if (io) io.disconnect();
    io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08 });

    const vh = window.innerHeight || document.documentElement.clientHeight;
    root.querySelectorAll(".anim-item").forEach(el => {
        // 既に初期ビューポート内にある要素は、Observer のコールバック（次フレーム以降）を
        // 待たずに即 in-view にする。これで一覧を開いた瞬間に画面内の画像が即表示される。
        const rect = el.getBoundingClientRect();
        if (rect.top < vh && rect.bottom > 0) {
            el.classList.add("in-view");
        } else {
            io.observe(el);
        }
    });
}

// -----------------------------------------------------------------------------
// ルーティング & 描画
// -----------------------------------------------------------------------------
function getCurrentParam() {
    // ?domain26 のような「値なしパラメータ」を拾う。先頭のキーを採用。
    const search = window.location.search.replace(/^\?/, "");
    if (!search) return null;
    const first = search.split("&")[0];
    return first.split("=")[0] || null;
}

function render() {
    if (disposeWorld) { disposeWorld(); disposeWorld = null; }
    const app = document.getElementById("app");
    const settings = siteSettings;
    const effect = settings.index.effect;
    const pages = collectPages(settings);
    const param = getCurrentParam();

    // 特別空間へ再入場したときは、前回の認証状態を引き継がない。
    if (param !== lastRenderedParam && param && pages[param]?.def?.pagetype === 2) {
        specialGalleryUnlocked = false;
        specialGalleryPatternOverride = null;
    }
    lastRenderedParam = param;

    // タイトル
    document.title = settings.site_info.site_name;

    // 対象ページ決定 & スコープ判定
    let scope = "top";
    let content;
    if (param && pages[param]) {
        const { key, def } = pages[param];
        if (def.pagetype === 0) {
            scope = "overview";
            content = buildGalleryOverview(def);
        } else if (def.pagetype === 2) {
            scope = "information";
            content = buildSpecialGallery(settings, def);
        } else {
            scope = "information";
            content = buildInformation(key, def);
        }
    } else {
        scope = "top";
        content = buildTop(settings);
    }

    // 演出属性・タイプ別演出を適用
    const secretActive = pages[param]?.def?.pagetype === 2;
    document.body.classList.toggle("secret-active", secretActive);
    const worldActive = content.dataset.state === "world";
    document.body.classList.toggle("world-active", worldActive);
    // Each world owns its motion; global distortion must not transform its photos.
    const pageEffect = worldActive ? { ...effect, animation_type: 0, animation_power: 0 } : effect;
    applyEffectAttributes(pageEffect, scope);
    setupTypeEffects(pageEffect, scope);

    // body 背景スライドショーはトップページのときだけ起動。他ページでは停止・撤去。
    // プリロードが済むまでは起動しない（初期化フローが完了後に render を再実行する）。
    if (scope === "top" && bgReady) {
        setupBackground(effect);
    } else {
        teardownBackground();
    }

    // 描画
    app.innerHTML = "";
    app.appendChild(buildHeader(settings, pages, param));

    const main = document.createElement("main");
    main.className = "site-main";
    main.appendChild(content);
    app.appendChild(main);

    if (!secretActive) app.appendChild(buildFooter(settings));

    // アイテム出現監視
    observeAnimItems(app);
}

// クライアント側ルーティング：ページ再読み込みを避け、URL だけ書き換えて再描画する。
// これによりローディングは初回の index 表示時のみとなる。
function navigateTo(e, url) {
    // 修飾キー付きクリック（新規タブ等）はブラウザ標準動作に任せる
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    history.pushState(null, "", url);
    render();
    window.scrollTo(0, 0);
}

// popstate（戻る/進む）にも対応
window.addEventListener("popstate", render);

// -----------------------------------------------------------------------------
// 画像保存・保存導線の抑止（常時有効）
// 注意: OS のスクリーンショットやブラウザ開発者ツール経由の取得は Web からは
// 完全には防げない。ここでは右クリック/ドラッグ/長押し/主要ショートカット等の
// 「保存への導線」を可能な限り塞ぐ抑止策を実装する。
// -----------------------------------------------------------------------------
function setupSaveGuard() {
    // 右クリック（コンテキストメニュー）禁止
    document.addEventListener("contextmenu", (e) => e.preventDefault());

    // 画像・背景のドラッグ禁止
    document.addEventListener("dragstart", (e) => {
        if (e.target && (e.target.tagName === "IMG" || e.target.closest(".gallery-cell, .bg-layer, .unit-stage"))) {
            e.preventDefault();
        }
    });

    // 主要な保存/開発者ツール系ショートカットを抑止（気休め程度）
    document.addEventListener("keydown", (e) => {
        const k = (e.key || "").toLowerCase();
        // Ctrl/Cmd + S（保存）, P（印刷）, U（ソース表示）
        if ((e.ctrlKey || e.metaKey) && ["s", "p", "u"].includes(k)) {
            e.preventDefault();
        }
        // F12（開発者ツール）
        if (k === "f12") e.preventDefault();
        // Ctrl/Cmd + Shift + I / J / C（開発者ツール系）
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) {
            e.preventDefault();
        }
    });
}

// -----------------------------------------------------------------------------
// 初期化フロー
// 背景演出が有効なら、全背景画像をプリロードしてからサイトを表示する。
// 読み込み中はローディングアニメーションを出す。
// -----------------------------------------------------------------------------
function boot() {
    const effect = siteSettings.index.effect;

    // 画像保存・保存導線の抑止（常時有効）
    setupSaveGuard();

    // まず画面を描画（背景はまだ起動しない：bgReady=false）
    render();
    setupCursorEffect(effect);

    // 背景スライドショー用の画像リスト（背景起動時に使う）
    const bgOn = (effect.body_bg_effect || 0) !== 0;
    bgFiles = bgOn ? buildBgFiles(effect, siteSettings) : [];

    // 初回に読むのは背景の今と次だけ。ギャラリーは一覧の lazy / 単体表示時に読む。
    const allImages = collectWarmImages(siteSettings);

    // 読み込む画像が無ければローディング不要
    if (allImages.length === 0) {
        bgReady = true;
        render();
        return;
    }

    // ローディング表示。
    // 表示%は「演出の進捗（時間ベース）」と「実読み込みの進捗」の小さい方を採用する。
    // これにより、読み込みが早く終わっても演出は最低 MIN_LOADING_MS かけて 0→100% を見せ、
    // 読み込みが遅ければ演出が 100% 手前で待機して嘘の 100% を出さない。
    const MIN_LOADING_MS = 400; // 背景2枚待ち。全枚プリロードはしない
    const loader = showLoader(effect.loading_effect || 1, allImages.length);
    updateLoader(loader, 0);

    let loadPct = 0;   // 実読み込みの進捗（0〜100）
    let loaded = false;
    preloadBgImages(allImages, (done, total) => {
        loadPct = (done / total) * 100;
    }).then(() => { loadPct = 100; loaded = true; });

    // 演出の進捗を時間ベースで進めつつ、実読み込みと小さい方を表示
    const startTime = performance.now();
    function progressLoop(now) {
        const animPct = Math.min(100, ((now - startTime) / MIN_LOADING_MS) * 100);
        const shown = Math.min(animPct, loadPct);
        updateLoader(loader, shown);

        // 演出が 100% に到達し、かつ実読み込みも完了したら終了
        if (animPct >= 100 && loaded) {
            updateLoader(loader, 100);
            bgReady = true;
            hideLoader(loader);
            render(); // トップページなら背景スライドショーが起動する
            return;
        }
        requestAnimationFrame(progressLoop);
    }
    requestAnimationFrame(progressLoop);
}

boot();
