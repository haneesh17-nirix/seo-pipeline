import 'dotenv/config';
import { readFileSync } from 'fs';
import { runPipeline, brandContextFrom, FORMAT_DURATIONS } from './pipeline';
import type { Brief } from './types';

const KEYWORDS = [
  'emergency plumber in Kochi',
  'AC repair service Calicut',
  'home cleaning service Trivandrum',
];

async function main() {
  const raw = JSON.parse(readFileSync('brands/sahayi/brand.json', 'utf8'));
  const brand = brandContextFrom(raw);
  const rows: any[] = [];

  for (const keyword of KEYWORDS) {
    const brief: Brief = {
      keyword, format: 'short', targetDuration: FORMAT_DURATIONS.short,
      location: brand.places[0], language: 'English',
    };
    process.stdout.write(`  ${keyword.padEnd(34)}`);
    try {
      const r = await runPipeline(brief, brand, { withShotList: false });
      const last = r.critiques[r.critiques.length - 1];
      const avg = last?.scores
        ? (Object.values(last.scores).reduce((a: number, b: any) => a + Number(b), 0) / 6).toFixed(1)
        : '—';
      rows.push({ keyword, passed: r.passed, errors: r.errors.length, warnings: r.warnings.length,
                  revisions: r.revisions, avg, secs: (r.elapsedMs/1000).toFixed(0) });
      console.log(`${r.passed ? '✓' : '✗'}  ${r.errors.length}e ${r.warnings.length}w  rev ${r.revisions}  score ${avg}  ${(r.elapsedMs/1000).toFixed(0)}s`);
    } catch (e: any) {
      console.log(`✗ ${e.message.slice(0,50)}`);
      rows.push({ keyword, passed: false, errors: -1, warnings: 0, revisions: 0, avg: '—', secs: '—' });
    }
  }

  const pass = rows.filter(r => r.passed).length;
  console.log(`\n  ── agent chain ──`);
  console.log(`  passed validator : ${pass}/${rows.length}`);
  console.log(`  total warnings   : ${rows.reduce((a,r)=>a+Math.max(0,r.warnings),0)}`);
  console.log(`  avg critic score : ${(rows.filter(r=>r.avg!=='—').reduce((a,r)=>a+Number(r.avg),0)/Math.max(1,rows.filter(r=>r.avg!=='—').length)).toFixed(2)} / 5`);
  console.log(`\n  ── existing corpus, same validator ──`);
  console.log(`  passed validator : 1/54`);
}
main();
