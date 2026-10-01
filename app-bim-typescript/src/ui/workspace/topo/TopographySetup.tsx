// =============================================================================
// TopographySetup — Asistente de amarre del proyecto (primera vez en Topografía)
// =============================================================================
//
// Paso 1: sistema de coordenadas (con sugerencia por GPS).
// Paso 2: cómo amarrar el dibujo a coordenadas reales:
//   - Origen conocido: coordenadas del 0,0 del dibujo + azimut del eje Y.
//   - GPS: tocar dónde está parado el operador, promediar el GPS + azimut.
//   - Mojones: ≥2 mojones con coordenadas reales colocados en el dibujo.
// Siempre se puede seguir en coordenadas locales y amarrar después.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ActionButton, BottomSheet, Chip, Icon, Tappable, toast } from '../../primitives';
import { CRS_LIST, CrsId, GridPoint, LatLon, crsDef, suggestGaussKruger } from '../../../domain/geo/crs';
import { Georeference } from '../../../domain/geo/georeference';
import { ExpoGpsProvider } from '../../../native/location/ExpoGpsProvider';
import { Field, Row, parseNum } from './TopoFields';
import { radius, spacing } from '../../design/tokens';
import { type } from '../../design/typography';
import { themedStyles, useTheme } from '../../design/theme';

const deg2rad = (d: number) => (d * Math.PI) / 180;

type Method = 'origin' | 'gps' | 'control';

export interface SetupCommon {
  crs: CrsId;
  z0: number;
  azimuth: number;
}

export interface TopographySetupProps {
  open: boolean;
  geo: Georeference | null;
  /** Mojones del proyecto que ya sirven para amarrar (coordenadas + posición). */
  controlCount: number;
  /** De esos, cuántos están en ESTE espacio (para ubicarlo solo a él). */
  controlInSpace: number;
  onClose: () => void;
  onLocalOnly: (crs: CrsId) => void;
  onOrigin: (c: SetupCommon, known: GridPoint | LatLon) => void;
  onGpsStand: (c: SetupCommon) => void;
  onControl: (c: SetupCommon, freeScale: boolean) => void;
  onPlaceSpace: () => void;
}

export function TopographySetup(props: TopographySetupProps) {
  const styles = useStyles();
  const colors = useTheme();
  const { open, geo } = props;
  const [step, setStep] = useState<'crs' | 'method'>('crs');
  const [crs, setCrs] = useState<CrsId>(geo?.crs ?? 'EPSG:9377');
  const [method, setMethod] = useState<Method>('origin');
  const [az, setAz] = useState('0');
  const [z0, setZ0] = useState('0');
  const [geographic, setGeographic] = useState(false);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [freeScale, setFreeScale] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  // Se reinicia solo al ABRIRSE: cambios de georreferencia o del teclado
  // mientras está abierto no deben devolverlo al paso 1.
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setStep('crs');
    setCrs(geo?.crs ?? 'EPSG:9377');
    setAz(geo ? String(Number(((geo.rotation * 180) / Math.PI).toFixed(4))) : '0');
    setZ0(geo ? String(geo.z0) : '0');
  }, [open, geo]);

  const suggest = async () => {
    setSuggesting(true);
    try {
      const fix = await new ExpoGpsProvider().getCurrentPosition();
      const gk = suggestGaussKruger(fix.longitude as number);
      setCrs(gk);
      toast(`Estás en la zona ${crsDef(gk).short}. El Origen Nacional sirve en todo el país.`, { kind: 'info', durationMs: 3200 });
    } catch {
      toast('No se pudo leer el GPS para sugerir el sistema', { kind: 'warning' });
    } finally {
      setSuggesting(false);
    }
  };

  const common = (): SetupCommon | null => {
    const azN = parseNum(az);
    const zN = parseNum(z0);
    if (azN === null || zN === null) {
      toast('Revisa el azimut y la cota', { kind: 'warning' });
      return null;
    }
    return { crs, azimuth: deg2rad(azN), z0: zN };
  };

  const goOrigin = () => {
    const c = common();
    if (!c) return;
    const x = parseNum(a);
    const y = parseNum(b);
    if (x === null || y === null) {
      toast('Digita las coordenadas del 0,0 del dibujo', { kind: 'warning' });
      return;
    }
    props.onOrigin(c, geographic ? { lat: x, lon: y } : { e: x, n: y });
  };

  return (
    <BottomSheet open={open} onClose={props.onClose} heightRatio={0.86}>
      <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Icon name="map-marker-radius" size={24} color={colors.accentText} />
          <Text style={styles.title}>{step === 'crs' ? 'Sistema de coordenadas' : 'Amarre del dibujo'}</Text>
          <Text style={styles.step}>{step === 'crs' ? '1/2' : '2/2'}</Text>
        </View>

        {step === 'crs' ? (
          <>
            <Text style={styles.body}>
              El levantamiento se sigue guardando en coordenadas locales desde el 0,0,0; aquí se elige en qué sistema real
              se calculan. Todos los espacios del proyecto usan el mismo.
            </Text>
            {CRS_LIST.map((c) => (
              <Tappable
                key={c.id}
                onPress={() => setCrs(c.id)}
                haptic="select"
                style={[styles.card, crs === c.id && styles.cardOn]}
                accessibilityRole="radio"
                accessibilityState={{ checked: crs === c.id }}
              >
                <Text style={[styles.cardTitle, crs === c.id && styles.on]}>{c.short}</Text>
                <Text style={styles.cardSub}>
                  {c.name} · {c.id}
                </Text>
              </Tappable>
            ))}
            <ActionButton label={suggesting ? 'Leyendo GPS…' : 'Sugerir con el GPS'} icon="crosshairs-gps" variant="secondary" onPress={() => void suggest()} loading={suggesting} />
            <Row>
              <ActionButton label="Solo locales por ahora" variant="text" onPress={() => props.onLocalOnly(crs)} />
              <ActionButton label="Siguiente" icon="arrow-right" onPress={() => setStep('method')} />
            </Row>
          </>
        ) : (
          <>
            <Row>
              <Chip label="Origen conocido" active={method === 'origin'} onPress={() => setMethod('origin')} />
              <Chip label="GPS" active={method === 'gps'} onPress={() => setMethod('gps')} />
              <Chip label={`Mojones (${props.controlCount})`} active={method === 'control'} onPress={() => setMethod('control')} />
            </Row>
            <Row>
              <Field flex numeric label="Azimut del eje Y del dibujo" value={az} onChange={setAz} unit="°" />
              <Field flex numeric label="Cota del Nivel 0" value={z0} onChange={setZ0} unit="msnm" />
            </Row>
            <Text style={styles.hint}>
              Azimut: hacia dónde apunta la flecha Y (verde) de los ejes, en grados desde el norte en sentido horario. 0 = el
              dibujo mira al norte.{method === 'control' ? ' Con mojones se calcula solo.' : ''}
            </Text>

            {method === 'origin' ? (
              <>
                <Text style={styles.section}>Coordenadas del 0,0 del dibujo</Text>
                <Row>
                  <Chip label="Planas (E/N)" active={!geographic} onPress={() => setGeographic(false)} />
                  <Chip label="Lat / Long" active={geographic} onPress={() => setGeographic(true)} />
                </Row>
                <Row>
                  <Field flex numeric label={geographic ? 'Latitud' : 'Norte'} value={geographic ? a : b} onChange={geographic ? setA : setB} />
                  <Field flex numeric label={geographic ? 'Longitud' : 'Este'} value={geographic ? b : a} onChange={geographic ? setB : setA} />
                </Row>
                <ActionButton label="Amarrar" icon="check" onPress={goOrigin} />
              </>
            ) : method === 'gps' ? (
              <>
                <Text style={styles.body}>
                  Toca en el dibujo el punto donde estás parado; luego deja el celular quieto {geo?.gpsSeconds ?? 30} s. El
                  GPS del celular tiene 3–15 m de error: sirve para ubicar, no para replantear.
                </Text>
                <ActionButton
                  label="Tocar dónde estoy"
                  icon="gesture-tap"
                  onPress={() => {
                    const c = common();
                    if (c) props.onGpsStand(c);
                  }}
                />
              </>
            ) : (
              <>
                <Text style={styles.body}>
                  Crea mojones con coordenadas reales (FAB + → Coordenada o Punto GPS) y colócalos en el dibujo (tabla de
                  coordenadas → Colocar). Con 2 o más se calcula el amarre por mínimos cuadrados y se muestra cuánto no
                  cuadra cada uno.
                </Text>
                <Row>
                  <Chip label="Escala 1 (cinta/láser)" active={!freeScale} onPress={() => setFreeScale(false)} />
                  <Chip label="Escala libre" active={freeScale} onPress={() => setFreeScale(true)} />
                </Row>
                <ActionButton
                  label="Ajustar el proyecto"
                  icon="vector-triangle"
                  disabled={props.controlCount < 2}
                  onPress={() => {
                    const c = common();
                    if (c) props.onControl(c, freeScale);
                  }}
                />
                {geo && geo.method !== 'none' ? (
                  <ActionButton
                    label={`Ubicar solo este espacio (${props.controlInSpace} mojones)`}
                    variant="secondary"
                    disabled={props.controlInSpace < 2}
                    onPress={props.onPlaceSpace}
                  />
                ) : null}
              </>
            )}
            <ActionButton label="Atrás" variant="text" icon="arrow-left" onPress={() => setStep('crs')} />
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const useStyles = themedStyles((colors) => ({
  root: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.title, color: colors.text, flex: 1 },
  step: { ...type.label, color: colors.textSecondary },
  body: { ...type.body, color: colors.textSecondary },
  hint: { ...type.caption, color: colors.textSecondary },
  section: { ...type.heading, color: colors.text },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: 2 },
  cardOn: { borderColor: colors.accentText, backgroundColor: colors.accentSoft },
  cardTitle: { ...type.bodyStrong, color: colors.text },
  on: { color: colors.accentText },
  cardSub: { ...type.caption, color: colors.textSecondary },
}));
