import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapView,
  type CameraRef,
  type GeoJSONSourceRef,
  type LngLatBounds,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  loadShelters,
  SHELTER_KINDS,
  type ShelterKind,
  type ShelterLayerData,
  type ShelterProperties,
} from '@/services/shelters';

// OpenFreeMap serves OpenStreetMap vector tiles without an API key.
const MAP_STYLES = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};
const POLAND: LngLatBounds = [14.1, 49.0, 24.2, 54.9];
const LEGEND = [...SHELTER_KINDS].reverse();

type ShelterSourceProps = {
  kind: ShelterKind;
  color: string;
  data: ShelterLayerData;
  camera: RefObject<CameraRef | null>;
  onSelect: (shelter: ShelterProperties) => void;
};

function ShelterSource({ kind, color, data, camera, onSelect }: ShelterSourceProps) {
  const source = useRef<GeoJSONSourceRef>(null);

  const handlePress = async (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    // Otherwise the press also reaches the map, which clears the selection.
    event.stopPropagation();
    const feature = event.nativeEvent.features[0];
    if (feature?.geometry.type !== 'Point') return;
    const clusterId: unknown = feature.properties?.cluster_id;
    if (typeof clusterId !== 'number') {
      onSelect(feature.properties as ShelterProperties);
      return;
    }
    const [longitude, latitude] = feature.geometry.coordinates;
    const zoom = await source.current?.getClusterExpansionZoom(clusterId);
    if (zoom !== undefined) camera.current?.easeTo({ center: [longitude, latitude], zoom, duration: 300 });
  };

  return (
    <GeoJSONSource ref={source} id={kind} data={data.geojson} cluster clusterRadius={40} onPress={handlePress}>
      <Layer
        type="circle"
        id={`${kind}-clusters`}
        filter={['has', 'point_count']}
        paint={{
          'circle-color': color,
          'circle-opacity': 0.9,
          'circle-radius': ['step', ['get', 'point_count'], 14, 20, 18, 100, 22, 500, 27],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
      <Layer
        type="symbol"
        id={`${kind}-counts`}
        filter={['has', 'point_count']}
        layout={{
          'text-field': ['to-string', ['get', 'point_count']],
          // Both map styles load their glyphs from OpenFreeMap, which has this font.
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-allow-overlap': true,
        }}
        paint={{ 'text-color': '#ffffff' }}
      />
      <Layer
        type="circle"
        id={`${kind}-points`}
        filter={['!', ['has', 'point_count']]}
        paint={{
          'circle-color': color,
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        }}
      />
    </GeoJSONSource>
  );
}

export function ShelterMap() {
  const scheme = useColorScheme();
  const camera = useRef<CameraRef>(null);
  const [shelters, setShelters] = useState<Record<ShelterKind, ShelterLayerData>>();
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState<ShelterKind[]>([]);
  const [selected, setSelected] = useState<ShelterProperties>();
  const selectedKind = selected && SHELTER_KINDS.find(({ kind }) => kind === selected.kind);

  useEffect(() => {
    let cancelled = false;
    loadShelters().then(
      (loaded) => { if (!cancelled) setShelters(loaded); },
      () => { if (!cancelled) setFailed(true); },
    );
    return () => { cancelled = true; };
  }, []);

  const toggle = (kind: ShelterKind) => {
    setHidden((current) => (current.includes(kind) ? current.filter((other) => other !== kind) : [...current, kind]));
    if (selected?.kind === kind) setSelected(undefined);
  };

  return (
    <View style={styles.flex}>
      <MapView
        style={styles.flex}
        mapStyle={MAP_STYLES[scheme === 'dark' ? 'dark' : 'light']}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        onPress={() => setSelected(undefined)}>
        <Camera ref={camera} initialViewState={{ bounds: POLAND }} />
        {shelters &&
          SHELTER_KINDS.filter(({ kind }) => !hidden.includes(kind)).map(({ kind, color }) => (
            <ShelterSource key={kind} kind={kind} color={color} data={shelters[kind]} camera={camera} onSelect={setSelected} />
          ))}
      </MapView>

      <SafeAreaView edges={['top', 'left', 'right']} style={styles.top} pointerEvents="box-none">
        <View style={styles.legend} pointerEvents="box-none">
          {LEGEND.map(({ kind, label, color }) => {
            const visible = !hidden.includes(kind);
            return (
              <Pressable
                key={kind}
                onPress={() => toggle(kind)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: visible }}>
                <ThemedView style={[styles.chip, !visible && styles.chipHidden]}>
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <ThemedText type="small">
                    {label}
                    {shelters ? ` (${shelters[kind].count})` : ''}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            );
          })}
        </View>
        <ThemedView style={styles.note}>
          {!shelters && !failed && <ActivityIndicator size="small" />}
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {failed
              ? 'Nie udało się wczytać punktów.'
              : 'Dane z OpenStreetMap, nie z oficjalnej ewidencji schronów. Bunkry to głównie historyczne fortyfikacje.'}
          </ThemedText>
        </ThemedView>
      </SafeAreaView>

      {selected && selectedKind && (
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.bottom} pointerEvents="box-none">
          <ThemedView style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={[styles.dot, { backgroundColor: selectedKind.color }]} />
              <ThemedText type="smallBold" style={styles.flex}>
                {selected.name ?? selectedKind.label}
              </ThemedText>
              <Pressable
                onPress={() => setSelected(undefined)}
                hitSlop={Spacing.two}
                accessibilityRole="button"
                accessibilityLabel="Zamknij">
                <ThemedText themeColor="textSecondary">✕</ThemedText>
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {selectedKind.note}
            </ThemedText>
            <ExternalLink href={selected.osm_url}>
              <ThemedText type="linkPrimary">Zobacz w OpenStreetMap</ThemedText>
            </ExternalLink>
          </ThemedView>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.four,
  },
  chipHidden: { opacity: 0.5 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.two,
    paddingBottom: Spacing.two + BottomTabInset,
  },
  card: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
