import shelters from '@/data/survival/shelters-osm-pl-all.geojson';
import { readBundledText } from '@/services/bundled-text';

// Drawn in this order, so the few real shelters end up on top of the assembly points.
// The data also holds bunkers; they are mostly historical fortifications and are not shown.
export const SHELTER_KINDS = [
  {
    kind: 'assembly_point',
    label: 'Miejsce zbiórki',
    color: '#ea580c',
    note: 'Miejsce zbiórki do ewakuacji oznaczone w OpenStreetMap.',
  },
  {
    kind: 'bomb_bunker',
    label: 'Schron',
    color: '#2563eb',
    note: 'Schron przeciwlotniczy według OpenStreetMap. Jego stan i dostępność nie są potwierdzone.',
  },
] as const;

export type ShelterKind = (typeof SHELTER_KINDS)[number]['kind'];
export type ShelterProperties = { kind: ShelterKind; name: string | null; osm_url: `https://${string}` };
export type ShelterLayerData = { geojson: string; count: number };

let loading: Promise<Record<ShelterKind, ShelterLayerData>> | undefined;

async function readShelters() {
  const { features } = JSON.parse(await readBundledText(shelters)) as GeoJSON.FeatureCollection<GeoJSON.Point, ShelterProperties>;
  // One collection per kind, so each kind clusters on its own and can be hidden.
  // The map takes GeoJSON as text; serializing once here keeps it from doing so on every render.
  return Object.fromEntries(SHELTER_KINDS.map(({ kind }) => {
    const ofKind = features.filter((feature) => feature.properties.kind === kind);
    return [kind, { geojson: JSON.stringify({ type: 'FeatureCollection', features: ofKind }), count: ofKind.length }];
  })) as Record<ShelterKind, ShelterLayerData>;
}

export function loadShelters() {
  loading ??= readShelters().catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
