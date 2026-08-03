/* eslint-disable */
/**
 * GIF 만들기 — **브라우저 안에서** 돈다.
 *
 * 이 저장소에는 이미지 라이브러리가 없다(sharp·pngjs·canvas 전부 없음). 그런데 우리는
 * 이미 Chromium 을 CDP 로 몰고 있으므로, PNG 디코드·축소·둥근 모서리·그림자는 canvas 가
 * 공짜로 해 준다. 그래서 프레임을 Node 로 도로 꺼내지 않고 여기서 끝까지 만든 뒤
 * **완성된 GIF 하나만** 돌려준다 — 프레임을 왕복시키면 클립 하나에 수십 MB 가 오간다.
 *
 * 인코딩에서 값을 하는 것은 하나다: 전역 팔레트 + 투명 인덱스 차분(dispose 1).
 * IDE 화면은 프레임 사이가 99% 같아서, 안 바뀐 픽셀을 투명으로 두면 LZW 가 긴 반복을
 * 통째로 먹는다. docs/record-demo.md 에 적힌 2054KB → 121KB 가 이 한 줄에서 나온다.
 *
 * 쓰는 쪽은 scripts/record-gif.mjs.
 */
(function () {
  "use strict";

  /** 프레임을 모아 두는 곳. addFrame 이 채우고 finish 가 비운다. */
  const state = { frames: [], w: 0, h: 0 };

  /** 캡처 한 장을 "창처럼" 만든다 — 배경 위에 여백을 두고, 모서리를 둥글리고, 그림자를 깐다.
   *  생 캡처는 화면 사진처럼 읽힌다. 배경은 앱보다 **밝아야** 창이 물체로 보인다. */
  function compose(img, o) {
    const scale = o.width / img.width;
    const winW = o.width, winH = Math.round(img.height * scale);
    const W = winW + o.margin * 2, H = winH + o.margin * 2;

    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });

    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, o.bg[0]); grad.addColorStop(1, o.bg[1]);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    g.save();
    g.shadowColor = o.shadow; g.shadowBlur = o.margin * 0.9; g.shadowOffsetY = o.margin * 0.28;
    g.fillStyle = "#000";
    roundRect(g, o.margin, o.margin, winW, winH, o.radius); g.fill();
    g.restore();

    g.save();
    roundRect(g, o.margin, o.margin, winW, winH, o.radius); g.clip();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(img, o.margin, o.margin, winW, winH);
    g.restore();

    return g.getImageData(0, 0, W, H);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** 전역 팔레트 — 미디언 컷. 프레임마다 팔레트를 새로 쓰면 차분을 못 쓴다(전부 새 색이 된다). */
  function buildPalette(frames, want) {
    const seen = new Map();
    for (const f of frames) {
      const d = f.data;
      // 전 프레임 전 픽셀을 세면 느리다 — 고르게 성기게 뽑아도 색 분포는 같다.
      for (let i = 0; i < d.length; i += 4 * 17) {
        const k = (d[i] >> 2 << 12) | (d[i + 1] >> 2 << 6) | (d[i + 2] >> 2);
        seen.set(k, (seen.get(k) || 0) + 1);
      }
    }
    let box = [];
    for (const [k, n] of seen) box.push([(k >> 12 & 63) << 2, (k >> 6 & 63) << 2, (k & 63) << 2, n]);
    let boxes = [box];
    while (boxes.length < want) {
      // 가장 넓은 상자를 가장 긴 축에서 가른다
      let bi = -1, bs = -1;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.length < 2) continue;
        const s = spread(b);
        if (s.range > bs) { bs = s.range; bi = i; }
      }
      if (bi < 0) break;
      const b = boxes[bi], ax = spread(b).axis;
      b.sort((p, q) => p[ax] - q[ax]);
      boxes.splice(bi, 1, b.slice(0, b.length >> 1), b.slice(b.length >> 1));
    }
    const pal = [];
    for (const b of boxes) {
      let r = 0, g = 0, bl = 0, n = 0;
      for (const p of b) { r += p[0] * p[3]; g += p[1] * p[3]; bl += p[2] * p[3]; n += p[3]; }
      pal.push(n ? [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] : [0, 0, 0]);
    }
    while (pal.length < want) pal.push([0, 0, 0]);
    return pal.slice(0, want);
  }

  function spread(b) {
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (const p of b) for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
    let axis = 0, range = -1;
    for (let a = 0; a < 3; a++) { const d = hi[a] - lo[a]; if (d > range) { range = d; axis = a; } }
    return { axis, range };
  }

  /** 색 → 팔레트 인덱스. 8비트로 잘라 캐시한다(같은 색이 수만 번 나온다). */
  function makeMapper(pal) {
    const cache = new Map();
    return (r, g, b) => {
      const k = (r >> 1 << 14) | (g >> 1 << 7) | (b >> 1);
      const hit = cache.get(k);
      if (hit !== undefined) return hit;
      let best = 0, bd = 1e9;
      for (let i = 0; i < pal.length; i++) {
        const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
        const d = dr * dr * 3 + dg * dg * 6 + db * db;   // 눈이 초록에 민감하다
        if (d < bd) { bd = d; best = i; }
      }
      cache.set(k, best);
      return best;
    };
  }

  // ── GIF 바이트 ───────────────────────────────────────────────────────────
  function lzw(indices, minCodeSize) {
    const out = [];
    let cur = 0, curBits = 0;
    const put = (code, bits) => {
      cur |= code << curBits; curBits += bits;
      while (curBits >= 8) { out.push(cur & 255); cur >>= 8; curBits -= 8; }
    };
    const clear = 1 << minCodeSize, eoi = clear + 1;
    let dict = new Map(), next = eoi + 1, size = minCodeSize + 1;
    const reset = () => { dict = new Map(); next = eoi + 1; size = minCodeSize + 1; };
    put(clear, size); reset();
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = prefix * 4096 + k;
      const found = dict.get(key);
      if (found !== undefined) { prefix = found; continue; }
      put(prefix, size);
      dict.set(key, next++);
      if (next - 1 === (1 << size) && size < 12) size++;
      if (next >= 4096) { put(clear, size); reset(); }
      prefix = k;
    }
    put(prefix, size); put(eoi, size);
    if (curBits > 0) out.push(cur & 255);
    return out;
  }

  function bytes(str) { const a = []; for (let i = 0; i < str.length; i++) a.push(str.charCodeAt(i)); return a; }
  function u16(n) { return [n & 255, (n >> 8) & 255]; }

  function encode(frames, pal, transIdx, w, h, loop) {
    const out = [];
    const push = a => { for (const b of a) out.push(b); };
    // 팔레트는 2의 거듭제곱이어야 한다
    let bits = 1; while ((1 << bits) < pal.length) bits++;
    push(bytes("GIF89a"));
    push(u16(w)); push(u16(h));
    push([0xF0 | (bits - 1), 0, 0]);
    for (let i = 0; i < (1 << bits); i++) { const p = pal[i] || [0, 0, 0]; push([p[0], p[1], p[2]]); }
    // 무한 반복
    push([0x21, 0xFF, 11]); push(bytes("NETSCAPE2.0")); push([3, 1]); push(u16(loop)); push([0]);

    for (const f of frames) {
      const delay = Math.max(2, Math.round(f.delay / 10));   // 1/100초
      // dispose 1 = 그대로 두기. 투명 인덱스를 쓰려면 이래야 앞 프레임이 비쳐 보인다.
      push([0x21, 0xF9, 4, (1 << 2) | (f.trans ? 1 : 0), delay & 255, (delay >> 8) & 255, f.trans ? transIdx : 0, 0]);
      push([0x2C]); push(u16(0)); push(u16(0)); push(u16(w)); push(u16(h)); push([0]);
      const min = Math.max(2, bits);
      push([min]);
      const data = lzw(f.idx, min);
      for (let i = 0; i < data.length; i += 255) {
        const chunk = data.slice(i, i + 255);
        push([chunk.length]); push(chunk);
      }
      push([0]);
    }
    push([0x3B]);
    return out;
  }

  // ── 공개 API ─────────────────────────────────────────────────────────────
  window.__gifkit = {
    reset() { state.frames = []; state.w = 0; state.h = 0; },

    /** 캡처 한 장을 더한다. dataUrl 은 screencast 가 준 PNG. */
    async add(dataUrl, delay, opts) {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const data = compose(img, opts);
      state.w = data.width; state.h = data.height;
      state.frames.push({ data: data.data, delay });
      return state.frames.length;
    },

    /** 팔레트를 만들고 차분해 GIF 를 짓는다. base64 로 돌려준다. */
    finish(colors) {
      const fs = state.frames;
      if (!fs.length) return null;
      const want = Math.min(255, colors || 200);            // 한 칸은 투명용으로 남긴다
      const pal = buildPalette(fs, want);
      const transIdx = pal.length;                          // 팔레트 바로 뒤
      const map = makeMapper(pal);
      const n = state.w * state.h;
      const out = [];
      let prev = null;
      for (let fi = 0; fi < fs.length; fi++) {
        const d = fs[fi].data;
        const idx = new Uint8Array(n);
        let anyTrans = false;
        for (let i = 0, p = 0; i < n; i++, p += 4) {
          const v = map(d[p], d[p + 1], d[p + 2]);
          if (prev && prev[i] === v && fi > 0) { idx[i] = transIdx; anyTrans = true; }
          else idx[i] = v;
        }
        // 다음 프레임의 기준은 **실제로 보이는 것** — 투명 자리는 앞 값이 그대로 남는다
        const shown = new Uint8Array(n);
        for (let i = 0; i < n; i++) shown[i] = idx[i] === transIdx ? prev[i] : idx[i];
        prev = shown;
        out.push({ idx, delay: fs[fi].delay, trans: anyTrans });
      }
      const bin = encode(out, pal, transIdx, state.w, state.h, 0);
      let s = "";
      for (let i = 0; i < bin.length; i += 8192) s += String.fromCharCode.apply(null, bin.slice(i, i + 8192));
      return btoa(s);
    },
  };
})();
