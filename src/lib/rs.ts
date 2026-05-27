// Louisiana Revised Statutes corpus loader.
//
// Reads from `tmp/corpus/usufruct-<tag>/rs/` (subdirectory of the release zip).
// Section identity is (title_number, section_number) — section numbers are
// scoped to a title and are not globally unique.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  CORPUS_ROOT,
  readJSON,
  readJSONL,
  readCSV,
  type ActsCitation,
  type CrumbLink,
  type Status,
} from './corpus.ts';
import {
  compareArticleNumbers,
  containerPath,
  pathSegments,
  stepSlug,
  type HierStep,
} from './slug.ts';

const RS_ROOT = join(CORPUS_ROOT, 'rs');

export type { ActsCitation, CrumbLink, HierStep };

// ----------------------------------------------------------- shape types ---

export interface Section {
  urn: string;
  title_number: string;
  section_number: string;
  /** Official citation form, e.g. "R.S. 14:30". */
  citation: string;
  heading: string | null;
  text: string | null;
  status: Status;
  hierarchy_path: HierStep[];
  breadcrumb: string;
  acts_citations: ActsCitation[];
  acts_citations_raw: string | null;
  source_url: string | null;
  website_law_id: number | null;
  scrape_timestamp: string | null;
  source_html_hash: string | null;
  schema_version: string;
}

export interface RsTreeNode {
  level: string;
  number: string;
  name: string;
  /** Range of section numbers under this node. Missing on a handful of
   *  empty/blank containers in the LRS tree. */
  section_range?: [string, string] | null;
  is_repealed: boolean;
  is_reserved: boolean;
  children: RsTreeNode[];
  sections?: string[];
}

export interface RsTree {
  schema_version: string;
  generated_at: string;
  roots: RsTreeNode[];
}

export interface RsManifest {
  schema_version: string;
  generated_at: string;
  corpus: 'rs';
  totals: {
    containers: number;
    sections_emitted: number;
    by_status: Record<string, number>;
  };
  sources: Record<string, string>;
  completeness?: {
    by_title?: Array<{
      title: string;
      active: number;
      repealed: number;
      reserved: number;
      blank: number;
      total: number;
    }>;
  };
}

// ----------------------------------------------------------- public data ---

export const rsManifest: RsManifest = readJSON<RsManifest>(
  'manifest.json',
  RS_ROOT,
);

export const rsTree: RsTree = readJSON<RsTree>('tree.json', RS_ROOT);

export const sections: Section[] = readJSONL<Section>(
  'sections.jsonl',
  RS_ROOT,
);

// Sort globally: by title (int) then by section number (handles "30" < "30.1"
// < "31" via articleSortKey in slug.ts).
export function compareLrsSections(a: Section, b: Section): number {
  const ta = Number.parseInt(a.title_number, 10);
  const tb = Number.parseInt(b.title_number, 10);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  if (ta !== tb) return a.title_number.localeCompare(b.title_number);
  return compareArticleNumbers(a.section_number, b.section_number);
}
sections.sort(compareLrsSections);

// Key: "title:section", e.g. "14:30" or "14:30.1".
export const sectionsByKey = new Map<string, Section>(
  sections.map((s) => [`${s.title_number}:${s.section_number}`, s]),
);

// ---------------------------------------------------- containers / pages ---

export interface RsContainer {
  level: string;
  number: string;
  name: string;
  section_range: [string, string] | null;
  is_repealed: boolean;
  is_reserved: boolean;
  ancestors: HierStep[];
  self: HierStep;
  pathSegs: string[];
  url: string;
  children: RsContainer[];
  /** Section numbers (scoped to titleNumber) that live directly on this node. */
  sectionNumbers: string[];
  /** Which Title this container belongs to (root titleNumber). */
  titleNumber: string;
}

function buildRsContainers(): RsContainer[] {
  const flat: RsContainer[] = [];
  function walk(
    node: RsTreeNode,
    ancestors: HierStep[],
    titleNumber: string,
  ): RsContainer {
    const self: HierStep = {
      level: node.level,
      number: node.number,
      name: node.name,
    };
    const c: RsContainer = {
      level: node.level,
      number: node.number,
      name: node.name,
      section_range: node.section_range ?? null,
      is_repealed: node.is_repealed,
      is_reserved: node.is_reserved,
      ancestors,
      self,
      pathSegs: pathSegments(ancestors, self),
      url: containerPath('/rs', ancestors, self),
      children: [],
      sectionNumbers: node.sections ?? [],
      titleNumber,
    };
    flat.push(c);
    const childAncestors = [...ancestors, self];
    for (const ch of node.children ?? []) {
      c.children.push(walk(ch, childAncestors, titleNumber));
    }
    return c;
  }
  for (const root of rsTree.roots) {
    // Each root is a Title; its `number` is the title number.
    walk(root, [], root.number);
  }
  return flat;
}

export const rsAllContainers: RsContainer[] = buildRsContainers();

export const rsContainersByPath = new Map<string, RsContainer>(
  rsAllContainers.map((c) => [c.pathSegs.join('/'), c]),
);

// Top-level containers (under /rs/) — one per Title.
export const rsRootContainers: RsContainer[] = rsAllContainers.filter(
  (c) => c.ancestors.length === 0,
);

// ----------------------------------------------------------- prev / next ---

interface TitleIdx {
  all: string[];
  active: string[];
  allIdx: Map<string, number>;
  activeIdx: Map<string, number>;
}

const titleIndexes = new Map<string, TitleIdx>();
for (const s of sections) {
  let idx = titleIndexes.get(s.title_number);
  if (!idx) {
    idx = { all: [], active: [], allIdx: new Map(), activeIdx: new Map() };
    titleIndexes.set(s.title_number, idx);
  }
  idx.all.push(s.section_number);
  if (s.status === 'active') idx.active.push(s.section_number);
}
for (const idx of titleIndexes.values()) {
  idx.allIdx = new Map(idx.all.map((n, i) => [n, i]));
  idx.activeIdx = new Map(idx.active.map((n, i) => [n, i]));
}

export interface SectionNeighbors {
  prevAll: string | null;
  nextAll: string | null;
  prevActive: string | null;
  nextActive: string | null;
}

export function sectionNeighbors(
  title: string,
  num: string,
): SectionNeighbors {
  const idx = titleIndexes.get(title);
  if (!idx) {
    return { prevAll: null, nextAll: null, prevActive: null, nextActive: null };
  }
  const i = idx.allIdx.get(num);
  const ai = idx.activeIdx.get(num);
  return {
    prevAll: i !== undefined && i > 0 ? idx.all[i - 1] ?? null : null,
    nextAll:
      i !== undefined && i < idx.all.length - 1 ? idx.all[i + 1] ?? null : null,
    prevActive:
      ai !== undefined && ai > 0 ? idx.active[ai - 1] ?? null : null,
    nextActive:
      ai !== undefined && ai < idx.active.length - 1
        ? idx.active[ai + 1] ?? null
        : null,
  };
}

// Sections sorted within a title — useful for /rs 404 nearest-neighbor logic.
export function sectionsInTitle(title: string): string[] {
  return titleIndexes.get(title)?.all ?? [];
}

// ----------------------------------------------------------- citations ----

// LRS citation_edges.csv columns:
//   src_urn, src_corpus, src_id, dst_corpus, dst_id, dst_urn, raw_match, char_offset
const rsEdgeRows = readCSV('citation_edges.csv', RS_ROOT).slice(1);

export interface RsCitationEdge {
  src_urn: string;
  src_id: string;        // "14:30"
  dst_corpus: string;    // "rs" | "cc" | ...
  dst_id: string;        // "14:30" or "2315"
  dst_urn: string;
  raw_match: string;
}

export const rsCitationEdges: RsCitationEdge[] = rsEdgeRows.map((row) => ({
  src_urn: row[0] ?? '',
  src_id: row[2] ?? '',
  dst_corpus: row[3] ?? '',
  dst_id: row[4] ?? '',
  dst_urn: row[5] ?? '',
  raw_match: row[6] ?? '',
}));

function buildRsEdgeIndex(): {
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
} {
  // Only RS→RS edges are tracked for in/out lists; cross-corpus edges are
  // available via rsCitationEdges if needed downstream.
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of rsCitationEdges) {
    if (!e.src_id || !e.dst_id) continue;
    if (e.dst_corpus !== 'rs') continue;
    if (e.src_id === e.dst_id) continue;
    const out = outgoing.get(e.src_id) ?? [];
    if (!out.includes(e.dst_id)) out.push(e.dst_id);
    outgoing.set(e.src_id, out);
    const inc = incoming.get(e.dst_id) ?? [];
    if (!inc.includes(e.src_id)) inc.push(e.src_id);
    incoming.set(e.dst_id, inc);
  }
  return { outgoing, incoming };
}

const { outgoing: rsOut, incoming: rsIn } = buildRsEdgeIndex();

export function rsOutgoingRefs(title: string, section: string): string[] {
  return rsOut.get(`${title}:${section}`) ?? [];
}

export function rsIncomingRefs(title: string, section: string): string[] {
  return rsIn.get(`${title}:${section}`) ?? [];
}

// ---------------------------------------------------- raw markdown / json -

const RS_MD_DIR = join(RS_ROOT, 'markdown');
const RS_SECTIONS_DIR = join(RS_ROOT, 'sections');

// LRS markdown / JSON filenames encode "." in the section number as "_":
// section "30.1" lives at `markdown/title-14/30_1.md` and
// `sections/rs_14_30_1.json`.
function encodeSectionFile(section: string): string {
  return section.replace(/\./g, '_');
}

export function rsMarkdownPath(title: string, section: string): string | null {
  const fname = `${encodeSectionFile(section)}.md`;
  const candidate = join(RS_MD_DIR, `title-${title}`, fname);
  return existsSync(candidate) ? candidate : null;
}

export function rsSectionJsonPath(
  title: string,
  section: string,
): string | null {
  const fname = `rs_${title}_${encodeSectionFile(section)}.json`;
  const candidate = join(RS_SECTIONS_DIR, fname);
  return existsSync(candidate) ? candidate : null;
}

// --------------------------------------------------------- presentation ---

// Pretty-print an LRS hierarchy step. LRS levels include `title`, `chapter`,
// `part`, `subpart`. Capitalize and append the number.
export function rsStepLabel(step: HierStep): string {
  const cap = step.level.charAt(0).toUpperCase() + step.level.slice(1);
  return `${cap} ${step.number}`;
}

export function rsStepFullLabel(step: HierStep): string {
  return `${rsStepLabel(step)}. ${step.name}`;
}

// Build the breadcrumb chain for a section.
export function sectionBreadcrumb(s: Section): CrumbLink[] {
  const crumbs: CrumbLink[] = [{ label: 'Revised Statutes', href: '/rs' }];
  const chain: HierStep[] = [];
  for (const step of s.hierarchy_path) {
    chain.push(step);
    crumbs.push({
      label: rsStepLabel(step),
      href: `/rs/${chain.map(stepSlug).join('/')}`,
    });
  }
  return crumbs;
}

export function rsContainerBreadcrumb(c: RsContainer): CrumbLink[] {
  const crumbs: CrumbLink[] = [{ label: 'Revised Statutes', href: '/rs' }];
  const chain: HierStep[] = [];
  for (const step of c.ancestors) {
    chain.push(step);
    crumbs.push({
      label: rsStepLabel(step),
      href: `/rs/${chain.map(stepSlug).join('/')}`,
    });
  }
  return crumbs;
}

// Count sections in a container subtree, broken down by status.
export function countSectionsIn(c: RsContainer): {
  total: number;
  active: number;
  repealed: number;
  blank: number;
  reserved: number;
} {
  let total = 0;
  let active = 0;
  let repealed = 0;
  let blank = 0;
  let reserved = 0;
  const visit = (n: RsContainer) => {
    for (const num of n.sectionNumbers) {
      const s = sectionsByKey.get(`${n.titleNumber}:${num}`);
      if (!s) continue;
      total++;
      if (s.status === 'active') active++;
      else if (s.status === 'repealed') repealed++;
      else if (s.status === 'blank') blank++;
      else if (s.status === 'reserved') reserved++;
    }
    for (const ch of n.children) visit(ch);
  };
  visit(c);
  return { total, active, repealed, blank, reserved };
}
