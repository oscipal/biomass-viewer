// Group STAC items into "mosaic groups": adjacent frames from the same
// acquisition (same product type + same date) that tile together spatially.
//
// BIOMASS frames along one orbit pass have timestamps a few seconds apart and
// increasing frame numbers (…_F156_, _F157_…). Grouping by (product type, date)
// collects exactly the adjacent frames that cover an AOI so they can be
// mosaicked, while keeping different product types (FD/FH/GN…) separate.

import type { BiomassItem, MosaicGroup } from './types';

export function productTypeOf(item: BiomassItem): string {
  const pt = item.properties?.['product:type'];
  if (typeof pt === 'string' && pt.length > 0) return pt;
  // Fall back to the id prefix before the first start-datetime token.
  const m = item.id.match(/^(.*?)_\d{8}T\d{6}/);
  return m ? m[1] : item.id;
}

export function dateOf(item: BiomassItem): string {
  return item.datetime ? item.datetime.slice(0, 10) : 'unknown';
}

// True for the L2A "GN" product (the only quicklook we display).
export function isGnItem(item: BiomassItem): boolean {
  return productTypeOf(item).toUpperCase().includes('GN');
}

export function orbitOf(item: BiomassItem): string {
  const o = item.properties?.['sat:orbit_state'];
  return typeof o === 'string' ? o.toLowerCase() : '';
}

// Relative-orbit / track number from the id (…_T011_F156_…). Frames of one
// acquisition pass share a track; different passes have different tracks.
function trackOf(item: BiomassItem): string {
  const m = item.id.match(/_T(\d{3})_F\d{3}_/);
  return m ? m[1] : '';
}

function orbitLabel(orbit: string): string {
  if (orbit === 'ascending') return 'ASC ↑';
  if (orbit === 'descending') return 'DESC ↓';
  return '';
}

function shortType(pt: string): string {
  // "BIO_FP_FD__L2A" -> "FP FD L2A"; "S1_SCS__1S" -> "S1 SCS 1S"
  return pt.replace(/^BIO_/, '').replace(/__/g, ' ').replace(/_/g, ' ').trim();
}

// Display priority for L2A product types. ESA publishes Forest Disturbance (FD)
// quicklooks as near-empty black images (disturbance events are sparse), so we
// rank it last — that keeps the default/active group on a product that actually
// has visible imagery (Forest Height, biomass, …) instead of a black frame.
function typeRank(productType: string): number {
  const s = productType.toUpperCase();
  if (s.includes('_FD')) return 9; // Forest Disturbance — black quicklooks
  if (s.includes('_FH')) return 0; // Forest Height
  if (s.includes('AGB')) return 1; // Above-Ground Biomass
  if (s.includes('_GN')) return 2;
  return 5;
}

export function buildGroups(items: BiomassItem[]): MosaicGroup[] {
  const map = new Map<string, MosaicGroup>();
  for (const it of items) {
    const productType = productTypeOf(it);
    const date = dateOf(it);
    const orbit = orbitOf(it);
    const track = trackOf(it);
    // One acquisition pass = same product, date, orbit direction and track.
    // Ascending (morning) and descending (evening) passes over the same region
    // are separate acquisitions and must not be mosaicked together.
    const key = `${productType}|${date}|${orbit}|${track}`;
    let g = map.get(key);
    if (!g) {
      const dir = orbitLabel(orbit);
      const label =
        `${date} · ${shortType(productType)}` +
        `${dir ? ` · ${dir}` : ''}${track ? ` T${track}` : ''}`;
      g = { key, label, productType, date, items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  // Newest date first; within a date, products with real imagery before the
  // black-quicklook FD product, then split by pass (orbit/track).
  return [...map.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ra = typeRank(a.productType);
    const rb = typeRank(b.productType);
    if (ra !== rb) return ra - rb;
    if (a.productType !== b.productType) return a.productType < b.productType ? -1 : 1;
    return a.key < b.key ? -1 : 1;
  });
}

export function groupIndexOfItem(groups: MosaicGroup[], itemId: string): number {
  return groups.findIndex((g) => g.items.some((it) => it.id === itemId));
}
