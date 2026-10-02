#!/usr/bin/env node
/**
 * Renders a production script into a 9:16 animatic MP4.
 *
 * The scripts in brands/<brand>/output/videos are production briefs — scene
 * timing, visual direction, voiceover and on-screen text — and were never
 * rendered, because RUNWAY_API_KEY / KLING_API_KEY / PIKA_API_KEY are all empty.
 *
 * This produces no generated footage and does not pretend to. It builds a timed
 * animatic: one card per scene at the scene's real duration, carrying the visual
 * direction, the on-screen text and the voiceover line, with the voiceover
 * spoken by the system TTS. That is enough to judge pacing, message order and
 * whether the copy holds up before anyone shoots or pays for an API.
 *
 * Cards are rasterised with headless Chrome: this Homebrew ffmpeg has neither
 * the drawtext filter nor an SVG decoder, and Chrome gives exact 1080x1920
 * output with real typography.
 *
 * Usage:
 *   node scripts/render-animatic.mjs <script.md> [out.mp4]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename, resolve } from 'node:path';

const W = 1080;
const H = 1920;
const FPS = 30;
const VOICE = process.env.ANIMATIC_VOICE ?? 'Aman'; // en_IN
const CHROME =
  process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── Parse ────────────────────────────────────────────────────────────────────

function parseScript(md) {
  const meta = {
    title: md.match(/^# Video Production Script — (.+)$/m)?.[1]?.trim() ?? 'Untitled',
    format: md.match(/\*\*Format:\*\*\s*([^|]+)/)?.[1]?.trim() ?? '',
    duration: md.match(/\*\*Duration:\*\*\s*([^|]+)/)?.[1]?.trim() ?? '',
    ratio: md.match(/\*\*Ratio:\*\*\s*([^|]+)/)?.[1]?.trim() ?? '',
    language: md.match(/\*\*Language:\*\*\s*(.+)$/m)?.[1]?.trim() ?? '',
    music: md.match(/\*\*Music:\*\*\s*(.+)$/m)?.[1]?.trim() ?? '',
    hook: md.match(/\*\*Hook \(first 3s\):\*\*\s*(.+)$/m)?.[1]?.trim() ?? '',
    cta: md.match(/## CTA\n+(.+)$/m)?.[1]?.trim() ?? '',
    hashtags: md.match(/## Hashtags\n+(.+)$/m)?.[1]?.trim() ?? '',
  };

  const scenes = [];
  for (const block of md.split(/^### /m).slice(1)) {
    const header = block.split('\n')[0];
    const field = (name) => {
      // [ \t]* not \s*: \s matches newlines, so an empty field swallowed the
      // line break and captured the NEXT field's line instead.
      const m = block.match(new RegExp(`\\*\\*${name}:\\*\\*[ \\t]*(.*)$`, 'm'));
      const v = (m?.[1] ?? '').trim();
      // The generator writes the literal string "undefined" when a template
      // variable did not resolve. Record that it happened rather than printing it.
      return v === 'undefined' ? '' : v;
    };
    scenes.push({
      n: Number(header.match(/Scene\s+(\d+)/)?.[1] ?? scenes.length + 1),
      seconds: Number(header.match(/\((\d+)s\)/)?.[1] ?? 5),
      visual: field('Visual'),
      voiceover: field('Voiceover').replace(/^"|"$/g, ''),
      onScreen: field('On-screen text'),
    });
  }

  return { meta, scenes };
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Cards ────────────────────────────────────────────────────────────────────

const CSS = `
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${W}px; height:${H}px; }
  body {
    background: linear-gradient(180deg,#0E1B2A 0%,#07101A 100%);
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color:#fff; position:relative; overflow:hidden;
  }
  .safe { position:absolute; inset:180px 60px 280px; border:2px dashed #1E3550; }
  .row { position:absolute; left:60px; right:60px; display:flex; justify-content:space-between;
         font-size:32px; letter-spacing:4px; color:#4F7CA8; }
  .top { top:80px; } .bottom { bottom:70px; font-size:28px; color:#3D5A78; letter-spacing:0; }
  .label { font-size:28px; letter-spacing:6px; color:#5C7C9C; margin-bottom:18px; }
  .visual { position:absolute; left:100px; right:100px; top:300px; }
  .visual p { font-size:42px; line-height:1.35; color:#9DBBD6; }
  .screen { position:absolute; left:100px; right:100px; top:760px; }
  .screen p { font-size:84px; line-height:1.15; font-weight:700; }
  .vo { position:absolute; left:100px; right:100px; bottom:380px; }
  .vo p { font-size:40px; line-height:1.4; color:#C8DCEC; font-style:italic; }
  .missing { color:#A96A6A; font-style:italic; font-size:40px; font-weight:400; }
  .bar { position:absolute; left:0; right:0; bottom:0; height:10px; background:#122537; }
  .bar span { display:block; height:100%; background:#2E6FA8; }
`;

function card({ top, body, progress }) {
  return `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
<div class="safe"></div>
<div class="row top"><span>${top.left}</span><span>${top.right}</span></div>
${body}
<div class="bar"><span style="width:${progress}%"></span></div>`;
}

function sceneHtml(scene, meta, idx, total) {
  const progress = Math.round(((idx + 1) / (total + 1)) * 100);
  const body = `
<div class="visual">
  <div class="label">VISUAL</div>
  <p>${esc(scene.visual)}</p>
</div>
<div class="screen">
  ${
    scene.onScreen
      ? `<div class="label">ON-SCREEN</div><p>${esc(scene.onScreen)}</p>`
      : `<p class="missing">no on-screen text in script</p>`
  }
</div>
<div class="vo">
  <div class="label">VOICEOVER</div>
  ${
    scene.voiceover
      ? `<p>“${esc(scene.voiceover)}”</p>`
      : `<p class="missing">silent — no voiceover line in script</p>`
  }
</div>
<div class="row bottom"><span>${esc(meta.title)}</span><span>ANIMATIC — NOT FINAL FOOTAGE</span></div>`;

  return card({
    top: {
      left: `SCENE ${scene.n} / ${total} · ${scene.seconds}s`,
      right: `${esc(meta.format.toUpperCase())} · ${esc(meta.ratio)}`,
    },
    body,
    progress,
  });
}

function endHtml(meta) {
  const body = `
<div class="visual" style="top:620px">
  <div class="label">CALL TO ACTION</div>
  <p style="font-size:76px;font-weight:700;color:#fff;line-height:1.2">${esc(meta.cta)}</p>
  <p style="margin-top:60px;font-size:40px;color:#7FA8CC">${esc(meta.hashtags)}</p>
  <p style="margin-top:40px;font-size:32px;color:#4F7CA8">${esc(meta.music)}</p>
</div>
<div class="row bottom"><span>${esc(meta.title)}</span><span>ANIMATIC — NOT FINAL FOOTAGE</span></div>`;
  return card({ top: { left: 'OUTRO', right: esc(meta.ratio) }, body, progress: 100 });
}

// ── Render ───────────────────────────────────────────────────────────────────

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

function shoot(html, htmlPath, pngPath, tmp) {
  writeFileSync(htmlPath, html);
  // --headless=new is required on current Chrome; the legacy --headless flag
  // hangs indefinitely. --virtual-time-budget makes it exit once the page has
  // settled rather than waiting on the event loop.
  //
  // Chrome on macOS logs CVDisplayLink errors and exits non-zero even when the
  // screenshot was written, so the file on disk is the success test, not the
  // exit code.
  try {
    execFileSync(
      CHROME,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--virtual-time-budget=2000',
        `--window-size=${W},${H}`,
        `--screenshot=${pngPath}`,
        `--user-data-dir=${join(tmp, 'chrome')}`,
        `file://${htmlPath}`,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'], timeout: 60_000 },
    );
  } catch {
    // fall through to the existence check
  }
  if (!existsSync(pngPath)) throw new Error(`Chrome produced no screenshot for ${htmlPath}`);
}

function segment({ png, wav, out, seconds }) {
  sh('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-loop', '1', '-framerate', String(FPS), '-t', String(seconds), '-i', png,
    '-i', wav,
    '-filter_complex', `[1:a]apad=whole_dur=${seconds}[a]`,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
    '-t', String(seconds),
    out,
  ]);
}

function narrate(text, tmp, name, seconds) {
  const wav = join(tmp, `${name}.wav`);
  if (text) {
    const aiff = join(tmp, `${name}.aiff`);
    // Plain AIFF: --data-format is rejected without a matching --file-format
    // on this macOS build, and ffmpeg converts AIFF happily.
    sh('say', ['-v', VOICE, '-o', aiff, text]);
    sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, wav]);
  } else {
    sh('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `anullsrc=r=22050:cl=mono:d=${seconds}`,
      wav,
    ]);
  }
  return wav;
}

function main() {
  const [scriptPath, outArg] = process.argv.slice(2);
  if (!scriptPath || !existsSync(scriptPath)) {
    console.error('usage: render-animatic.mjs <script.md> [out.mp4]');
    process.exit(1);
  }

  const out = resolve(outArg ?? basename(scriptPath).replace(/\.md$/, '.mp4'));
  const { meta, scenes } = parseScript(readFileSync(scriptPath, 'utf8'));
  const sceneTime = scenes.reduce((s, x) => s + x.seconds, 0);

  console.log(`\n  ${meta.title}`);
  console.log(`  ${meta.format} · ${meta.ratio} · ${meta.language}`);
  console.log(`  header claims ${meta.duration}; scenes total ${sceneTime}s\n`);

  const tmp = mkdtempSync(join(tmpdir(), 'animatic-'));
  const segments = [];

  try {
    scenes.forEach((scene, i) => {
      const png = join(tmp, `s${i}.png`);
      shoot(sceneHtml(scene, meta, i, scenes.length), join(tmp, `s${i}.html`), png, tmp);
      const wav = narrate(scene.voiceover, tmp, `s${i}`, scene.seconds);
      const mp4 = join(tmp, `s${i}.mp4`);
      segment({ png, wav, out: mp4, seconds: scene.seconds });
      segments.push(mp4);

      const flags = [
        scene.voiceover ? 'narrated' : 'SILENT',
        scene.onScreen ? null : 'no on-screen text',
      ].filter(Boolean);
      console.log(`  scene ${scene.n}  ${String(scene.seconds).padStart(2)}s  ${flags.join(' · ')}`);
    });

    const endPng = join(tmp, 'end.png');
    shoot(endHtml(meta), join(tmp, 'end.html'), endPng, tmp);
    const endWav = narrate(meta.cta, tmp, 'end', 4);
    const endMp4 = join(tmp, 'end.mp4');
    segment({ png: endPng, wav: endWav, out: endMp4, seconds: 4 });
    segments.push(endMp4);
    console.log('  outro     4s  narrated · CTA');

    const list = join(tmp, 'list.txt');
    writeFileSync(list, segments.map((s) => `file '${s}'`).join('\n'));
    const joined = join(tmp, 'out.mp4');
    sh('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'concat', '-safe', '0', '-i', list,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      joined,
    ]);
    // copy, not rename: the output often lives on a different volume from
    // the temp dir (this repo is on an external drive), and rename cannot
    // cross devices.
    copyFileSync(joined, out);

    console.log(`\n  ✓ ${out}  (${sceneTime + 4}s)\n`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

main();
