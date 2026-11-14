// Token Radar, model radar-3 (Node 22, standard library only).
//
// Reads the sealed DefiLlama snapshot, scores every rankable pre-token protocol with the
// model in lib/model.ts, and writes the entry's outputs:
//
//   /output/board.json     the ranked board (watchlist covered, ranks 1..N, farm plans)
//   /output/data.js        the dashboard's dataset, written beside the page
//   /output/dashboard/    a copy of this repository's dashboard/
//   /output/screenshots/  a copy of this repository's screenshots/ (board, detail, filtered)
//   /output/dossier.json  the judge's dossier, built by vendor/makefun-board.ts
//
// The program is deterministic: the same snapshot bytes always write the same output bytes.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the dossier text cap shapes the bytes, the rest refuse. */
const MAX_TEXT_BYTES = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read `--key <value>` (or `--key=<value>`) out of the arguments, else `def`. */
function cliArg(key: string, def: string): string {
  const pos = process.argv.indexOf(`--${key}`);
  if (pos >= 0 && pos + 1 < process.argv.length) return process.argv[pos + 1]!;
  const eqForm = process.argv.find((argVal) => argVal.startsWith(`--${key}=`));
  return eqForm === undefined ? def : eqForm.slice(key.length + 3);
}

function die(msg: string): never {
  process.stderr.write(`token radar: ${msg}\n`);
  process.exit(1);
}

const inputRaw = cliArg('input', '/input');
const inputPath = inputRaw.endsWith('.json') ? inputRaw : join(inputRaw, 'snapshot.json');
if (!existsSync(inputPath)) {
  die(
    `no snapshot at ${inputPath}: pass --input <snapshot.json|directory> or mount the sealed /input`,
  );
}
const outDir = cliArg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snap = parseSnapshot(readFileSync(inputPath, 'utf8'));
const { board, radar } = buildRadar(snap);
const problem = boardIssue(board, snap);
if (problem !== null) die(`the model wrote a board the gate refuses: ${problem}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outDir, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `dst`, skipping names that start with a dot. */
function copyDir(src: string, dst: string): string[] {
  if (!existsSync(src)) return [];
  mkdirSync(dst, { recursive: true });
  const done: string[] = [];
  for (const file of readdirSync(src)) {
    if (file.startsWith('.')) continue;
    const srcPath = join(src, file);
    if (!statSync(srcPath).isFile()) continue;
    copyFileSync(srcPath, join(dst, file));
    done.push(file);
  }
  return done;
}

const dashFiles = copyDir(join(rootDir, 'dashboard'), join(outDir, 'dashboard'));
if (dashFiles.length < 3 || !dashFiles.includes('index.html')) {
  die(`dashboard/ holds ${dashFiles.length} files and no usable index.html: hand in a page`);
}
const shotFiles = copyDir(join(rootDir, 'screenshots'), join(outDir, 'screenshots'));
if (shotFiles.length < 3) {
  die(
    `screenshots/ holds ${shotFiles.length} image${shotFiles.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
  );
}
for (const fileName of shotFiles) {
  if (!IMAGE_NAME_RE.test(fileName)) {
    die(`screenshots/${fileName}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: MAX_TEXT_BYTES,
    screenshots: SHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snap.protocols.length} protocols in the snapshot, ${snap.watchlist.length} on the watchlist\n` +
    `token radar: ${board.length} rows scored (${radar.early_size} early beyond the watchlist, ` +
    `${radar.early_below_floor} of them below the floor), ` +
    `top-10 implied value ${radar.total_implied_top10_usd.toLocaleString('en-US')} USD, ` +
    `all rows ${radar.total_implied_all_usd.toLocaleString('en-US')} USD\n` +
    `token radar: rank 1 ${board[0]!.name} at ${board[0]!.implied_value_usd.toLocaleString('en-US')} USD, ` +
    `median rankable age ${radar.median_age_days} days, live set ${radar.live_size}\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ` +
    `${join(outDir, 'dashboard')} (${dashFiles.length} files), ` +
    `${join(outDir, 'screenshots')} (${shotFiles.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
