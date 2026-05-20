// Loads the Usufruct corpus from `tmp/corpus/usufruct-<tag>/` and exposes
// typed views. Read-once at build time; cached for the life of the build.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  compareArticleNumbers,
  containerPath,
  pathSegments,
  stepSlug,
  type HierStep,
} from './slug.ts';

const TMP_DIR = resolve(process.cwd(), 'tmp/corpus');

export type ArticleStatus = 'active' | 'repealed' | 'reserved' | 'blank';

export interface ActsCitation {
  act_year: number | null;
  act_number: number | null;
  section: number | string | null;
  effective_date: string | null;
  effective_date_raw: string | null;
  role: string | null;
}

export interface Article {
  urn: string;
  article_number: string;
  heading: string | null;
  text: string | null;
  status: ArticleStatus;
  hierarchy_path: HierStep[];
  breadcrumb: string;
  acts_citations: ActsCitation[];
  acts_citations_raw: string | null;
  source_url: string | null;
  scrape_timestamp: string | null;
  source_html_hash: string | null;
  schema_version: string;
}

export interface TreeNode {
  level: string;
  number: string;
  name: string;
  range_start: string;
  range_end: string;
  status: string;
  children: TreeNode[];
  articles?: string[];
}

export interface Tree {
  schema_version: string;
  generated_at: string;
  roots: TreeNode[];
}

export interface HierarchyEntry {
  level: string;
  number: string;
  name: string;
  range_start: string;
  range_end: string;
  status: string;
  ancestors: HierarchyEntry[];
}

export interface Manifest {
  schema_version: string;
  generated_at: string;
  totals: {
    containers: number;
    articles_in_index: number;
    articles_emitted: number;
    by_status: Record<string, number>;
  };
  sources: Record<string, string>;
  completeness?: unknown;
}

export interface CitationEdge {
  src_urn: string;
  src_article: string;
  dst_article: string;
  raw_match: string;
}

// ---------------------------------------------------------------- loader ---

function readActiveTag(): string {
  const ptr = join(TMP_DIR, 'ACTIVE_TAG');
  if (!existsSync(ptr)) {
    throw new Error(
      `Corpus not present at ${TMP_DIR}. Run scripts/fetch-corpus.sh first.`,
    );
  }
  return readFileSync(ptr, 'utf8').trim();
}

const TAG = readActiveTag();
const CORPUS_ROOT = join(TMP_DIR, `usufruct-${TAG}`);

function readJSON<T>(name: string): T {
  return JSON.parse(readFileSync(join(CORPUS_ROOT, name), 'utf8')) as T;
}

function readJSONL<T>(name: string): T[] {
  return readFileSync(join(CORPUS_ROOT, name), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T);
}

function readCSV(name: string): string[][] {
  const raw = readFileSync(join(CORPUS_ROOT, name), 'utf8');
  // Simple CSV: corpus does not use quoted commas in this file.
  return raw.split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l) => l.split(','));
}

// ----------------------------------------------------------- public data ---

export const ACTIVE_TAG = TAG;

export const manifest: Manifest = readJSON<Manifest>('manifest.json');

export const tree: Tree = readJSON<Tree>('tree.json');

export const hierarchy: HierarchyEntry[] = readJSON<HierarchyEntry[]>(
  'hierarchy.json',
);

export const articles: Article[] = readJSONL<Article>('articles.jsonl');

// Sort articles numerically.
articles.sort((a, b) =>
  compareArticleNumbers(a.article_number, b.article_number),
);

export const articlesByNumber = new Map<string, Article>(
  articles.map((a) => [a.article_number, a]),
);

// ----------------------------------------------------------- prev / next ---

// All article numbers in sorted order; "active only" subset for skip-by-default
// nav behavior.
export const ALL_NUMBERS: string[] = articles.map((a) => a.article_number);
export const ACTIVE_NUMBERS: string[] = articles
  .filter((a) => a.status === 'active')
  .map((a) => a.article_number);

const ALL_IDX = new Map<string, number>(ALL_NUMBERS.map((n, i) => [n, i]));
const ACTIVE_IDX = new Map<string, number>(
  ACTIVE_NUMBERS.map((n, i) => [n, i]),
);

export interface Neighbors {
  prevAll: string | null;
  nextAll: string | null;
  prevActive: string | null;
  nextActive: string | null;
}

export function neighbors(num: string): Neighbors {
  const i = ALL_IDX.get(num);
  const ai = ACTIVE_IDX.get(num);
  return {
    prevAll: i !== undefined && i > 0 ? ALL_NUMBERS[i - 1] ?? null : null,
    nextAll:
      i !== undefined && i < ALL_NUMBERS.length - 1
        ? ALL_NUMBERS[i + 1] ?? null
        : null,
    prevActive:
      ai !== undefined && ai > 0 ? ACTIVE_NUMBERS[ai - 1] ?? null : null,
    nextActive:
      ai !== undefined && ai < ACTIVE_NUMBERS.length - 1
        ? ACTIVE_NUMBERS[ai + 1] ?? null
        : null,
  };
}

// For repealed/blank articles (which don't appear in ACTIVE_IDX), find the
// nearest active neighbors by walking the master list.
export function activeNeighborsByPosition(num: string): {
  prev: string | null;
  next: string | null;
} {
  const i = ALL_IDX.get(num);
  if (i === undefined) return { prev: null, next: null };
  let prev: string | null = null;
  for (let k = i - 1; k >= 0; k--) {
    const a = articlesByNumber.get(ALL_NUMBERS[k]!);
    if (a && a.status === 'active') {
      prev = a.article_number;
      break;
    }
  }
  let next: string | null = null;
  for (let k = i + 1; k < ALL_NUMBERS.length; k++) {
    const a = articlesByNumber.get(ALL_NUMBERS[k]!);
    if (a && a.status === 'active') {
      next = a.article_number;
      break;
    }
  }
  return { prev, next };
}

// ----------------------------------------------------------- citations ----

const edgeRows = readCSV('citation_edges.csv').slice(1); // drop header
export const citationEdges: CitationEdge[] = edgeRows.map((row) => ({
  src_urn: row[0] ?? '',
  src_article: row[1] ?? '',
  dst_article: row[2] ?? '',
  raw_match: row[3] ?? '',
}));

// outgoing[src] → unique list of dst (preserve first occurrence order)
function buildEdgeIndex(): {
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
} {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of citationEdges) {
    if (!e.src_article || !e.dst_article) continue;
    if (e.src_article === e.dst_article) continue;
    const out = outgoing.get(e.src_article) ?? [];
    if (!out.includes(e.dst_article)) out.push(e.dst_article);
    outgoing.set(e.src_article, out);
    const inc = incoming.get(e.dst_article) ?? [];
    if (!inc.includes(e.src_article)) inc.push(e.src_article);
    incoming.set(e.dst_article, inc);
  }
  // Sort each list by numeric article order for stable rendering.
  for (const list of outgoing.values()) list.sort(compareArticleNumbers);
  for (const list of incoming.values()) list.sort(compareArticleNumbers);
  return { outgoing, incoming };
}

const { outgoing, incoming } = buildEdgeIndex();

export function outgoingRefs(num: string): string[] {
  return outgoing.get(num) ?? [];
}

export function incomingRefs(num: string): string[] {
  return incoming.get(num) ?? [];
}

// ---------------------------------------------------- containers / pages ---

export interface Container {
  level: string;
  number: string;
  name: string;
  range_start: string;
  range_end: string;
  status: string;
  ancestors: HierStep[];
  self: HierStep;
  pathSegs: string[];
  url: string;
  children: Container[];
  articleNumbers: string[];
}

// Walk the tree to build container objects keyed by their URL path segments.
function buildContainers(): Container[] {
  const flat: Container[] = [];

  function walk(node: TreeNode, ancestors: HierStep[]): Container {
    const self: HierStep = {
      level: node.level,
      number: node.number,
      name: node.name,
    };
    const c: Container = {
      level: node.level,
      number: node.number,
      name: node.name,
      range_start: node.range_start,
      range_end: node.range_end,
      status: node.status,
      ancestors,
      self,
      pathSegs: pathSegments(ancestors, self),
      url: containerPath(ancestors, self),
      children: [],
      articleNumbers: node.articles ?? [],
    };
    flat.push(c);
    const childAncestors = [...ancestors, self];
    for (const ch of node.children ?? []) {
      c.children.push(walk(ch, childAncestors));
    }
    return c;
  }

  for (const root of tree.roots) {
    walk(root, []);
  }
  return flat;
}

export const allContainers: Container[] = buildContainers();

export const containersByPath = new Map<string, Container>(
  allContainers.map((c) => [c.pathSegs.join('/'), c]),
);

// Top-level containers (under /cc/), sorted by tree order.
export const rootContainers: Container[] = allContainers.filter(
  (c) => c.ancestors.length === 0,
);

// Total article count for a container, including children recursively.
export function countArticlesIn(c: Container): {
  total: number;
  active: number;
  repealed: number;
  blank: number;
} {
  let total = 0;
  let active = 0;
  let repealed = 0;
  let blank = 0;
  const visit = (n: Container) => {
    for (const num of n.articleNumbers) {
      const a = articlesByNumber.get(num);
      if (!a) continue;
      total++;
      if (a.status === 'active') active++;
      else if (a.status === 'repealed') repealed++;
      else if (a.status === 'blank') blank++;
    }
    for (const ch of n.children) visit(ch);
  };
  visit(c);
  return { total, active, repealed, blank };
}

// Pretty-print a hierarchy step for breadcrumbs.
export function stepLabel(step: HierStep): string {
  if (step.level === 'preliminary_title') return 'Preliminary Title';
  const cap = step.level.charAt(0).toUpperCase() + step.level.slice(1);
  return `${cap} ${step.number}`;
}

export function stepFullLabel(step: HierStep): string {
  if (step.level === 'preliminary_title') return 'Preliminary Title';
  return `${stepLabel(step)}. ${step.name}`;
}

// Build the breadcrumb chain for an article: links + labels.
export interface CrumbLink {
  label: string;
  href: string;
}

export function articleBreadcrumb(a: Article): CrumbLink[] {
  const crumbs: CrumbLink[] = [{ label: 'Civil Code', href: '/cc' }];
  const chain: HierStep[] = [];
  for (const step of a.hierarchy_path) {
    chain.push(step);
    crumbs.push({
      label: stepLabel(step),
      href: `/cc/${chain.map(stepSlug).join('/')}`,
    });
  }
  return crumbs;
}

export function containerBreadcrumb(c: Container): CrumbLink[] {
  const crumbs: CrumbLink[] = [{ label: 'Civil Code', href: '/cc' }];
  const chain: HierStep[] = [];
  for (const step of c.ancestors) {
    chain.push(step);
    crumbs.push({
      label: stepLabel(step),
      href: `/cc/${chain.map(stepSlug).join('/')}`,
    });
  }
  return crumbs;
}

// "Book" bucket for facets / filters.
export function articleBook(a: Article): string {
  const top = a.hierarchy_path[0];
  if (!top) return 'Unknown';
  if (top.level === 'preliminary_title') return 'Preliminary Title';
  return `Book ${top.number}`;
}

// ---------------------------------------------------- raw markdown access -

const MD_DIR = join(CORPUS_ROOT, 'markdown');
export function markdownPath(articleNumber: string): string | null {
  const candidate = join(MD_DIR, `${articleNumber}.md`);
  return existsSync(candidate) ? candidate : null;
}

export function articleMarkdownExists(articleNumber: string): boolean {
  return markdownPath(articleNumber) !== null;
}

// Pre-list markdown files for the data page (cheap directory listing).
export function listMarkdownFilenames(): string[] {
  try {
    return readdirSync(MD_DIR).filter((n) => n.endsWith('.md'));
  } catch {
    return [];
  }
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

export const release: ReleaseInfo = (() => {
  const base = `https://github.com/bitwulf/Usufruct/releases/download/${TAG}`;
  const generatedYear = (manifest.generated_at ?? '').slice(0, 4) ||
    new Date().getFullYear().toString();
  return {
    tag: TAG,
    archiveUrl: `${base}/usufruct-${TAG}.zip`,
    shaUrl: `${base}/usufruct-${TAG}.zip.sha256`,
    releasePage: `https://github.com/bitwulf/Usufruct/releases/tag/${TAG}`,
    generatedAt: manifest.generated_at ?? '',
    generatedYear,
  };
})();
