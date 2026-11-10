/* Hojalatería Lautaro — main.js (sin dependencias)
   1) Hero Hogar / Industria: capa que se hunde en la niebla (WebGL2) y cambia de escena.
   2) Fondo: el scroll controla el tiempo del video; fotogramas clave como respaldo.
   3) Navegación, revelado de títulos, formulario que arma el mensaje de WhatsApp. */
(() => {
  'use strict';
  const doc = document.documentElement, rs = doc.style;
  const $ = id => document.getElementById(id);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const portraitMq = matchMedia('(max-aspect-ratio: 4/5)');
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const smooth = (a, b, x) => { x = clamp((x - a) / (b - a)); return x * x * (3 - 2 * x); };

  /* ------------------------------------------------------------------ */
  /* 1. HERO                                                             */
  /* ------------------------------------------------------------------ */
  const hero = $('inicio'), cv = $('fog');
  const SINK = 240, RISE = 820, DEPTH = .27;
  let target = 0, from = 0, start = -1e9, queued = null, swapped = true, k = 0;
  let animating = false, clock = 0, heroOn = true, fogDirty = true;

  let gl = null; const U = {};
  try { gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false }); } catch (e) { gl = null; }
  if (gl) {
    const vs = `#version 300 es
    void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0,1);}`;
    const fs = `#version 300 es
    precision highp float;
    uniform vec2 R,G;uniform float T,S,K;out vec4 O;
    float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    float fbm(vec2 p){float a=.5,s=0.;mat2 m=mat2(1.6,1.2,-1.2,1.6);p=mat2(.8,.6,-.6,.8)*p+5.3;for(int i=0;i<5;i++){s+=a*n(p);p=m*p;a*=.5;}return s;}
    void main(){
      vec2 uv=gl_FragCoord.xy/R;uv.y=1.-uv.y;
      float asp=R.x/R.y;vec2 p=vec2(uv.x*asp,uv.y);
      float t=T*.05;
      vec2 w=vec2(fbm(p*1.3+vec2(t,-t*.6)),fbm(p*1.3+vec2(-t*.8,t)+7.));
      float d=fbm(p*1.9+w*1.7+vec2(t*1.6,-t*1.1+S*.5));
      float e=fbm(p*.9-w+vec2(-t,t*.5)+3.);
      float low=smoothstep(.70,1.04,uv.y+(d-.5)*.34);
      float side=smoothstep(.2,.0,uv.x+(e-.5)*.28)+smoothstep(.8,1.,uv.x+(e-.5)*.28);
      side*=smoothstep(.25,.6,uv.y)*.2;
      float wisps=smoothstep(.5,.78,d)*smoothstep(.22,.5,uv.y)*smoothstep(.86,.6,uv.y)*.18;
      float rest=clamp(low+side+wisps,0.,1.);
      float front=1.02-S*.68;
      float rise=smoothstep(front-.02,front+.26,uv.y+(d-.5)*.5);
      float haze=S*(.3+.46*d);
      float a=clamp(max(rest,max(rise*.97,haze)),0.,1.);
      vec3 hogA=vec3(.80,.66,.52),hogB=vec3(.17,.13,.11);   /* humo cálido de leña */
      vec3 indA=vec3(.50,.57,.68),indB=vec3(.09,.12,.17);   /* bruma fría de acero */
      vec3 c=mix(mix(hogB,hogA,d*1.12),mix(indB,indA,d*1.1),K);
      vec2 q=(uv-G)*vec2(1.7,2.6);
      float ember=exp(-dot(q,q)*3.2);
      c=mix(c,vec3(.95,.52,.20),(1.-K)*ember*.5*(1.-S));
      O=vec4(c*a,a);
    }`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
    const a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs);
    const pr = gl.createProgram();
    if (a && b) { gl.attachShader(pr, a); gl.attachShader(pr, b); gl.linkProgram(pr); }
    if (a && b && gl.getProgramParameter(pr, gl.LINK_STATUS)) {
      gl.useProgram(pr);
      for (const u of ['R', 'G', 'T', 'S', 'K']) U[u] = gl.getUniformLocation(pr, u);
    } else gl = null;
  }
  if (!gl) doc.classList.add('no-gl');

  function sizeFog() {
    if (!gl) return;
    const W = hero.clientWidth, H = hero.clientHeight;
    const w = Math.round(Math.min(W, 960)), h = Math.max(1, Math.round(w * H / W));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
    fogDirty = true;
  }

  /* escenas vivas del hero: estufa encendida (Hogar) y sala de ductos (Industria) */
  const WA = 'https://wa.me/56976363592?text=';
  const heroVids = [$('vidH'), $('vidI')], net = navigator.connection || {};
  const slowNet = !!net.saveData || /(^|-)2g$/.test(net.effectiveType || '');
  let allowVideo = !calm && !slowNet;           /* movimiento reducido o datos lentos: el video espera un toque en el botón */
  let userPaused = !allowVideo;
  let shown = 0, heroVidsArmed = false;
  const wanted = [true, false];                 /* qué escenas ya pueden descargar su video */
  const vbtn = $('vbtn');
  heroVids.forEach((v, i) => {
    v.addEventListener('playing', () => { v.classList.add('is-live'); paintBtn(); });
    v.addEventListener('pause', paintBtn);
  });
  /* El video se descarga completo y se reproduce desde memoria (blob):
     así funciona igual en servidores sin "Range" (Safari/iOS) y en vistas previas con CSP estricta. */
  const blobs = {};
  function srcFor(url) {
    if (!blobs[url]) blobs[url] = fetch(url).then(r => { if (!r.ok) throw 0; return r.blob(); })
      .then(b => URL.createObjectURL(b)).catch(() => url);
    return blobs[url];
  }
  function heroVideo() {
    if (!heroVidsArmed || !allowVideo) { paintBtn(); return; }
    heroVids.forEach((v, i) => {
      if (!wanted[i] && i !== shown) return;
      const src = v.dataset[portraitMq.matches ? 'm' : 'd'];
      if (v.dataset.cur !== src) {
        v.dataset.cur = src; v.classList.remove('is-live');
        srcFor(src).then(u => { if (v.dataset.cur !== src) return; v.src = u; v.load(); syncPlay(); });
      }
    });
    syncPlay();
  }
  function syncPlay() {
    heroVids.forEach((v, i) => {
      if (!v.getAttribute('src')) return;
      if (i === shown && heroOn && !document.hidden && !userPaused) {
        const p = v.play();
        if (p && p.catch) p.catch(() => { if (i === shown) { userPaused = true; paintBtn(); } });   /* p. ej. iPhone en modo ahorro */
      } else v.pause();
    });
    paintBtn();
  }
  function paintBtn() {
    const v = heroVids[shown], playing = v && !v.paused && !userPaused;
    vbtn.classList.toggle('is-paused', !playing);
    vbtn.setAttribute('aria-label', playing ? 'Pausar el video de fondo' : 'Reproducir el video de fondo');
  }
  vbtn.addEventListener('click', () => {
    if (!allowVideo) { allowVideo = true; userPaused = false; heroVideo(); return; }
    userPaused = !userPaused; syncPlay();
  });
  function wantOther() { if (!wanted[1]) { wanted[1] = true; heroVideo(); } }
  const tg = document.querySelector('.toggle');
  ['pointerenter', 'focusin', 'touchstart'].forEach(ev => tg.addEventListener(ev, wantOther, { once: true, passive: true }));
  document.addEventListener('visibilitychange', syncPlay);
  function show(n) {
    shown = n;
    $('setH').classList.toggle('is-on', !n); $('setI').classList.toggle('is-on', !!n);
    $('capH').setAttribute('aria-hidden', !!n); $('capI').setAttribute('aria-hidden', !n);
    $('heroCta').href = WA + encodeURIComponent('Hola Hojalatería Lautaro, quiero cotizar un trabajo para mi ' + (n ? 'empresa' : 'hogar'));
    heroVideo();
  }
  function setVars(kk, k2, dip, sinkPx) {
    rs.setProperty('--k', kk.toFixed(3)); rs.setProperty('--k2', k2.toFixed(3)); rs.setProperty('--dip', dip.toFixed(3));
    hero.style.setProperty('--sink', sinkPx.toFixed(1) + 'px');
  }
  function pick(n) {
    if (n === target && queued === null) return;
    $('bh').setAttribute('aria-pressed', !n); $('bi').setAttribute('aria-pressed', !!n);
    if (calm) { target = n; k = n; show(n); setVars(n, n, 0, 0); fogDirty = true; return; }
    if (animating) queued = n; else begin(n, clock);
  }
  function begin(n, now) { target = n; from = k; start = now; swapped = false; animating = true; }
  $('bh').addEventListener('click', () => pick(0));
  $('bi').addEventListener('click', () => pick(1));

  function heroFrame(now) {
    let y = 0, s = 0;
    if (animating) {
      const d = now - start; let dip = 0, k2 = k;
      if (d < SINK) { const x = d / SINK; y = x * x * (3 - 2 * x) * DEPTH; }
      else {
        if (!swapped) { swapped = true; show(target); }
        const x = clamp((d - SINK) / RISE); y = Math.pow(1 - x, 3.4) * DEPTH;
      }
      s = smooth(0, SINK * .92, d) * (1 - smooth(SINK + 70, SINK + RISE * .92, d));
      dip = smooth(30, 190, d) * (1 - smooth(330, 720, d));
      k = from + (target - from) * smooth(120, 520, d);
      k2 = from + (target - from) * smooth(340, 760, d);
      if (d >= SINK + RISE) {
        animating = false; k = k2 = target; y = s = dip = 0;
        if (queued !== null && queued !== target) { const q = queued; queued = null; begin(q, now); } else queued = null;
      }
      setVars(k, k2, dip, y * hero.clientHeight);
    }
    if (gl && heroOn && (!calm || fogDirty)) {
      fogDirty = false;
      const p = portraitMq.matches;
      gl.uniform2f(U.R, cv.width, cv.height);
      gl.uniform2f(U.G, .5, p ? .8 : .86);
      gl.uniform1f(U.T, calm ? 12 : now / 1000);
      gl.uniform1f(U.S, s); gl.uniform1f(U.K, k);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(e => { heroOn = e[0].isIntersecting; fogDirty = true; syncPlay(); }).observe(hero);

  /* ------------------------------------------------------------------ */
  /* 2. FONDO: video ↔ scroll                                            */
  /* ------------------------------------------------------------------ */
  const bg = document.querySelector('.bg'), video = $('bgv');
  const frames = [...document.querySelectorAll('#frames img')];
  const sections = [...document.querySelectorAll('[data-t]')];
  const DUR = 25, STEP = 5;
  let stops = [], maxScroll = 1, cur = 0, veil = .55, lastT = -1, lastVeil = -1;
  let videoOk = false, seeking = false, seekAt = 0, lag = [], lastSeek = -1;

  function frameSrc(i) { return 'assets/img/k' + i + (portraitMq.matches ? '-m' : '') + '.webp'; }
  function loadFrames(all) {
    frames.forEach((im, i) => { if (i === 0 || all) { const s = frameSrc(i + 1); if (im.getAttribute('src') !== s) im.src = s; } });
  }
  loadFrames(false);

  function measure() {
    const vh = innerHeight, y0 = scrollY;
    stops = [{ y: 0, t: 0, v: .5 }];
    for (const s of sections) {
      const r = s.getBoundingClientRect(), top = r.top + y0, ts = s.dataset.t.split(',').map(Number), v = +s.dataset.veil;
      ts.forEach((t, i) => stops.push({ y: Math.max(0, top + r.height * (i + 1) / (ts.length + 1) - vh / 2), t, v }));
    }
    stops.sort((a, b) => a.y - b.y);
    maxScroll = Math.max(1, doc.scrollHeight - vh);
  }
  function at(y) {
    let a = stops[0], b = stops[stops.length - 1];
    if (y <= a.y) return a; if (y >= b.y) return b;
    for (let i = 1; i < stops.length; i++) if (y <= stops[i].y) { a = stops[i - 1]; b = stops[i]; break; }
    const f = b.y === a.y ? 1 : (y - a.y) / (b.y - a.y);
    if (calm) return f < .5 ? a : b;
    return { t: a.t + (b.t - a.t) * f, v: a.v + (b.v - a.v) * f };
  }
  function paintFrames(t) {
    const f = clamp(t / STEP, 0, frames.length - 1), i0 = Math.floor(f), fr = f - i0;
    for (let i = 0; i < frames.length; i++) {
      const o = i === i0 ? 1 : (i === i0 + 1 ? fr : 0);
      if (frames[i]._o !== o) { frames[i]._o = o; frames[i].style.opacity = o.toFixed(3); }
    }
  }
  function bgFrame(now, dt) {
    const goal = at(scrollY);
    const ease = calm ? 1 : 1 - Math.pow(.0015, dt / 1000);   /* scrub suave */
    cur += (goal.t - cur) * ease; veil += (goal.v - veil) * ease;
    if (Math.abs(goal.t - cur) < .002) cur = goal.t;
    if (Math.abs(cur - lastT) > .004) {
      lastT = cur; paintFrames(cur);
    }
    if (Math.abs(veil - lastVeil) > .003) { lastVeil = veil; bg.style.setProperty('--veil', veil.toFixed(3)); }
    if (videoOk && !seeking) {
      const t = clamp(cur, 0, DUR - .05);
      if (Math.abs(t - lastSeek) > .015) { seeking = true; seekAt = now; lastSeek = t; video.currentTime = t; }
    }
  }
  video.addEventListener('seeked', () => {
    seeking = false;
    if (!bg.classList.contains('is-video')) bg.classList.add('is-video');
    lag.push(performance.now() - seekAt); if (lag.length > 12) lag.shift();
    if (lag.length === 12 && lag.reduce((a, b) => a + b, 0) / 12 > 380) dropVideo();   /* equipo lento: fotogramas */
  });
  video.addEventListener('error', dropVideo);
  function dropVideo() { videoOk = false; seeking = false; bg.classList.remove('is-video'); }

  function startVideo() {
    if (calm || slowNet || !video.canPlayType || !video.canPlayType('video/mp4')) return;
    const src = 'assets/video/' + (portraitMq.matches ? 'fondo-mobile.mp4' : 'fondo-desktop.mp4');
    const use = url => {
      video.addEventListener('loadeddata', () => { videoOk = true; lastSeek = -1; }, { once: true });
      video.src = url; video.load();
    };
    /* se descarga completo para que cada salto de tiempo sea local y sin tirones */
    fetch(src).then(r => { if (!r.ok) throw 0; return r.blob(); }).then(b => use(URL.createObjectURL(b))).catch(() => use(src));
  }
  /* iOS: un toque desbloquea la decodificación del video en pausa */
  addEventListener('touchstart', () => { if (video.src) { const p = video.play(); if (p && p.then) p.then(() => video.pause()).catch(() => {}); } }, { once: true, passive: true });

  /* ------------------------------------------------------------------ */
  /* 3. Navegación, revelado, formulario                                 */
  /* ------------------------------------------------------------------ */
  const top = $('top'), fab = $('fab'), ruler = document.querySelector('.ruler');
  const navLinks = [...document.querySelectorAll('.links a')];
  const targets = navLinks.map(a => document.querySelector(a.getAttribute('href')));
  let scrollDirty = true, activeId = '';
  function onScroll() {
    scrollDirty = false;
    const y = scrollY, vh = innerHeight;
    top.classList.toggle('is-stuck', y > 24);
    const fo = y > vh * .6; fab.classList.toggle('is-on', fo); doc.classList.toggle('fab-on', fo);
    ruler.style.setProperty('--p', clamp(y / maxScroll).toFixed(4));
    let id = '';
    targets.forEach(s => { if (s && s.getBoundingClientRect().top <= vh * .45) id = s.id; });
    if (id !== activeId) {
      activeId = id;
      navLinks.forEach(a => { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
  }
  addEventListener('scroll', () => { scrollDirty = true; }, { passive: true });

  const burger = $('burger');
  function menu(open) {
    doc.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }
  burger.addEventListener('click', () => menu(!doc.classList.contains('menu-open')));
  navLinks.forEach(a => a.addEventListener('click', () => menu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && doc.classList.contains('menu-open')) { menu(false); burger.focus(); } });

  const reveal = [...document.querySelectorAll('[data-fold],[data-rise]')];
  if (calm || !('IntersectionObserver' in window)) reveal.forEach(el => el.classList.add('in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px', threshold: .15 });
    reveal.forEach(el => io.observe(el));
  }

  const form = $('cotiza');
  form.addEventListener('submit', e => {
    const que = $('f-que'), com = $('f-com'), med = $('f-med').value.trim();
    let bad = null;
    [[que, 'e-que'], [com, 'e-com']].forEach(([f, id]) => {
      const ok = !!f.value; $(id).hidden = ok;
      if (ok) f.removeAttribute('aria-invalid'); else { f.setAttribute('aria-invalid', 'true'); bad = bad || f; }
    });
    if (bad) { e.preventDefault(); bad.focus(); return; }
    $('f-text').value = 'Hola Hojalatería Lautaro, quiero cotizar: ' + que.value + '.' + (med ? ' Medidas o diámetro: ' + med + '.' : '') + ' Comuna: ' + com.value + '.';
  });
  ['f-que', 'f-com'].forEach(id => $(id).addEventListener('change', e => { e.target.removeAttribute('aria-invalid'); $(id === 'f-que' ? 'e-que' : 'e-com').hidden = true; }));

  /* ------------------------------------------------------------------ */
  /* Bucle único                                                         */
  /* ------------------------------------------------------------------ */
  let prev = 0;
  function loop(now) {
    const dt = Math.min(64, now - (prev || now)); prev = now; clock = now;
    if (scrollDirty) onScroll();
    if (heroOn || animating) heroFrame(now);
    bgFrame(now, dt || 16);
    requestAnimationFrame(loop);
  }
  function relayout() { sizeFog(); measure(); scrollDirty = true; }
  addEventListener('resize', relayout);
  portraitMq.addEventListener('change', () => { heroVideo(); loadFrames(frames.some((im, i) => i > 0 && im.getAttribute('src'))); relayout(); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); scrollDirty = true; }).observe(document.body);
  relayout(); cur = at(scrollY).t; veil = at(scrollY).v;
  requestAnimationFrame(loop);
  let bgArmed = false;
  function armBg() {
    if (bgArmed) return; bgArmed = true;
    removeEventListener('scroll', armBg); loadFrames(true); startVideo();
  }
  const idle = (fn, ms) => ('requestIdleCallback' in window) ? setTimeout(() => requestIdleCallback(fn, { timeout: 3000 }), ms) : setTimeout(fn, ms);
  /* el video del hero parte apenas se pinta la página, sin esperar al resto */
  requestAnimationFrame(() => setTimeout(() => { heroVidsArmed = true; heroVideo(); }, 60));
  const late = () => {
    if (scrollY > 40) armBg(); else addEventListener('scroll', armBg, { passive: true });
    if (!slowNet) idle(wantOther, 3500);
    if (!slowNet && !portraitMq.matches) idle(armBg, 6000);   /* en el teléfono, el video de 8 MB solo si el visitante baja */
  };
  if (document.readyState === 'complete') late(); else addEventListener('load', late, { once: true });
})();
