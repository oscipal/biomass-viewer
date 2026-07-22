// BIOMASS products the viewer can search / download / render, and how their
// polarizations map onto GeoTIFF bands (verified against the real COGs).

export type Product = 'GN' | 'DGM' | 'FH' | 'FD' | 'SCS';

// Polarization visualisation modes for the multi-band (polarimetric) products.
export type PolMode = 'single' | 'rgb' | 'pauli' | 'decomp';

// Full polarimetric decompositions (SCS only — need the complex data).
export type DecompMethod = 'pauli' | 'freeman';
export const DECOMPS: { id: DecompMethod; label: string; hint: string }[] = [
  { id: 'pauli', label: 'Pauli', hint: 'R=|HH−VV|, G=|HV|, B=|HH+VV| (coherent)' },
  { id: 'freeman', label: 'Freeman–Durden', hint: 'R=double-bounce, G=volume, B=surface' },
];

export interface ProductDef {
  id: Product;
  label: string;
  collection: string;
  hint: string;
  match: RegExp; // matches the item id
  pols: string[]; // single-pol choices; [] ⇒ single-band (no polarimetry)
  bands: Record<string, number>; // polarization → 1-based band index
  crossPol?: string; // cross-pol used for the RGB green / Pauli volume channel
  complex?: boolean; // SCS: complex data, viewed via decompositions only
}

export const PRODUCTS: ProductDef[] = [
  {
    id: 'GN',
    label: 'GN',
    collection: 'BiomassLevel2a',
    hint: 'L2A ground-notched polarimetric backscatter (HH, VH, VV)',
    match: /BIO_FP_GN/,
    pols: ['HH', 'VH', 'VV'],
    bands: { HH: 1, VH: 2, VV: 3 },
    crossPol: 'VH',
  },
  {
    id: 'DGM',
    label: 'DGM',
    collection: 'BiomassLevel1b',
    hint: 'L1B detected ground multi-look — quad-pol (HH, HV, VH, VV), geocoded',
    match: /DGM/,
    pols: ['HH', 'HV', 'VH', 'VV'],
    bands: { HH: 1, HV: 2, VH: 3, VV: 4 },
    crossPol: 'HV',
  },
  {
    id: 'FH',
    label: 'FH',
    collection: 'BiomassLevel2a',
    hint: 'L2A forest height (single band, metres)',
    match: /BIO_FP_FH/,
    pols: [],
    bands: {},
  },
  {
    id: 'FD',
    label: 'FD',
    collection: 'BiomassLevel2a',
    hint: 'L2A forest disturbance (single band, class)',
    match: /BIO_FP_FD/,
    pols: [],
    bands: {},
  },
  {
    id: 'SCS',
    label: 'SCS',
    collection: 'BiomassLevel1a',
    hint: 'L1A single-look complex, quad-pol — full polarimetric decompositions',
    match: /S[123]_SCS/,
    pols: [],
    bands: {},
    complex: true,
  },
];

export const productById = (id: Product): ProductDef =>
  PRODUCTS.find((p) => p.id === id) ?? PRODUCTS[0];

// Tile-render params derived from a polarization view (appended to /tiles URLs).
export interface AppliedRender {
  indexes?: string; // e.g. "1,2,4"
  expression?: string; // rio-tiler band math (pseudo-Pauli)
  colormap?: string; // single-band only
  rescale?: string; // "min,max" (broadcast to all bands)
  asset?: string; // override cog asset (e.g. a decomposition: "decomp_pauli")
}

// Compute the tile params for a chosen view. Returns null when the view is not
// supported on the given product (true decompositions need the SCS product).
export function computeRender(
  product: Product,
  polMode: PolMode,
  polBand: string,
  colormap: string,
  vmin: string,
  vmax: string,
): AppliedRender | null {
  const p = productById(product);
  const rescale = vmin !== '' && vmax !== '' ? `${vmin},${vmax}` : undefined;

  // Single-band products (FH/FD): always colormapped band 1.
  if (p.pols.length === 0) return { colormap, rescale };

  if (polMode === 'rgb') {
    const idx = [p.bands.HH, p.bands[p.crossPol ?? 'HV'], p.bands.VV].join(',');
    return { indexes: idx, rescale };
  }
  if (polMode === 'pauli') {
    const hh = p.bands.HH;
    const vv = p.bands.VV;
    const cross = p.bands[p.crossPol ?? 'HV'];
    return { expression: `abs(b${hh}-b${vv});b${cross};abs(b${hh}+b${vv})`, rescale };
  }
  if (polMode === 'decomp') return null; // needs complex SCS data

  // single-pol + colormap
  const band = p.bands[polBand] ?? 1;
  return { indexes: `${band}`, colormap, rescale };
}
