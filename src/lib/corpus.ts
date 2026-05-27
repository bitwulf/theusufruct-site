// Shared corpus infrastructure: file reader helpers, active-tag resolution,
// release URL info, and types that are universal across all corpora.
//
// Corpus-specific data and helpers live in:
//   - src/lib/cc.ts  → Louisiana Civil Code (articles, tree, edges, cites)
//   - src/lib/rs.ts  → Louisiana Revised Statutes (sections, tree, edges, cites)
//
// Read-once at build time; cached for the life of the build.

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const TMP_DIR = resolve(process.cwd(), 'tmp/corpus');

// ----------------------------------------------------------- shared types ---

// Universal status enum — applies to CC articles AND LRS sections.
export type Status = 'active' | 'repealed' | 'reserved' | 'blank';

// Backward-compat alias for ArticleStatus (kept so any out-of-tree code keeps
// working; new code should import Status).
export type ArticleStatus = Status;

export interface ActsCitation {
  act_year: number | null;
  act_number: number | null;
  section: number | string | null;
  effective_date: string | null;
  effective_date_raw: string | null;
  role: string | null;
}

export interface CrumbLink {
  label: string;
  href: string;
}

// ----------------------------------------------------- tag / root loader ---

export function readActiveTag(): string {
  const ptr = join(TMP_DIR, 'ACTIVE_TAG');
  if (!existsSync(ptr)) {
    throw new Error(
      `Corpus not present at ${TMP_DIR}. Run scripts/fetch-corpus.sh first.`,
    );
  }
  return readFileSync(ptr, 'utf8').trim();
}

export const ACTIVE_TAG = readActiveTag();
export const CORPUS_ROOT = join(TMP_DIR, `usufruct-${ACTIVE_TAG}`);

// ----------------------------------------------------------- file readers --

export function readJSON<T>(name: string, root: string = CORPUS_ROOT): T {
  return JSON.parse(readFileSync(join(root, name), 'utf8')) as T;
}

export function readJSONL<T>(name: string, root: string = CORPUS_ROOT): T[] {
  return readFileSync(join(root, name), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

export function readCSV(name: string, root: string = CORPUS_ROOT): string[][] {
  const raw = readFileSync(join(root, name), 'utf8');
  // Simple CSV: corpus does not use quoted commas in this file.
  return raw.split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l) => l.split(','));
}

// ---------------------------------------------------- release / archive ---

export interface ReleaseInfo {
  tag: string;
  archiveUrl: string;
  shaUrl: string;
  releasePage: string;
  generatedAt: string;
  generatedYear: string;
}

// Build `release` lazily so corpus-specific imports (which depend on
// manifests) don't create circular import order issues. The `generatedAt`
// comes from the CC manifest — it's the bundled release's timestamp; the
// LRS manifest's `generated_at` is a sub-component of the same release.
function buildRelease(): ReleaseInfo {
  // Read CC manifest directly here to avoid a circular dep on cc.ts.
  const cc = readJSON<{ generated_at?: string }>('manifest.json');
  const base = `https://github.com/bitwulf/Usufruct/releases/download/${ACTIVE_TAG}`;
  const generatedYear = (cc.generated_at ?? '').slice(0, 4) ||
    new Date().getFullYear().toString();
  return {
    tag: ACTIVE_TAG,
    archiveUrl: `${base}/usufruct-${ACTIVE_TAG}.zip`,
    shaUrl: `${base}/usufruct-${ACTIVE_TAG}.zip.sha256`,
    releasePage: `https://github.com/bitwulf/Usufruct/releases/tag/${ACTIVE_TAG}`,
    generatedAt: cc.generated_at ?? '',
    generatedYear,
  };
}

export const release: ReleaseInfo = buildRelease();
