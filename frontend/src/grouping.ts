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

function shortType(pt: string): string {
  // "BIO_FP_FD__L2A" -> "FP FD L2A"; "S1_SCS__1S" -> "S1 SCS 1S"
  return pt.replace(/^BIO_/, '').replace(/__/g, ' ').replace(/_/g, ' ').trim();
}

export function buildGroups(items: BiomassItem[]): MosaicGroup[] {
  const map = new Map<string, MosaicGroup>();
  for (const it of items) {
    const productType = productTypeOf(it);
    const date = dateOf(it);
    const key = `${productType}|${date}`;
    let g = map.get(key);
    if (!g) {
      g = { key, label: `${date} · ${shortType(productType)}`, productType, date, items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  // Newest date first; stable order for same-date product types.
  return [...map.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.productType < b.productType ? -1 : 1;
  });
}

export function groupIndexOfItem(groups: MosaicGroup[], itemId: string): number {
  return groups.findIndex((g) => g.items.some((it) => it.id === itemId));
}
