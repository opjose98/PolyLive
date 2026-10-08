// =============================================================================
// AxisGizmo — Ejes de referencia X·Y·Z (y el norte) en una esquina del lienzo
// =============================================================================
//
// Coordenadas LOCALES del proyecto (ver domain/geometry/handedness.ts):
//   X → derecha del dibujo, Y → "arriba" del dibujo (norte de cuadrícula),
//   Z → hacia el observador en planta (⊙), hacia arriba en alzado.
// En planta el gizmo gira con el lienzo; tocarlo devuelve la vista a 0° (o al
// norte, si se pide). En alzado muestra X (a lo largo del muro, invertido en
// el lado B) y Z.
//
// El norte se dibuja aparte, como una aguja: `northAngle` es el ángulo (rad)
// del norte medido desde la +Y local en sentido horario; `null` lo oculta.
// =============================================================================

import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { Tappable } from '../primitives';
import { elevation, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles } from '../design/theme';

const SIZE = 72;
const C = SIZE / 2;
const LEN = 24;

const AXIS_COLORS = { x: '#E53935', y: '#43A047', z: '#1E88E5', north: '#D32F2F' } as const;

function arrow(dx: number, dy: number, len = LEN) {
  const p = Skia.Path.Make();
  const ex = C + dx * len;
  const ey = C + dy * len;
  p.moveTo(C, C);
  p.lineTo(ex, ey);
  // Punta
  const hx = -dx * 7;
  const hy = -dy * 7;
  p.moveTo(ex, ey);
  p.lineTo(ex + hx - dy * 4, ey + hy + dx * 4);
  p.moveTo(ex, ey);
  p.lineTo(ex + hx + dy * 4, ey + hy - dx * 4);
  return p;
}

interface AxisGizmoProps {
  readonly kind: 'plan' | 'elevation';
  /** Giro de la vista en planta (rad, horario en pantalla). */
  readonly rotation?: number;
  /** Alzado visto desde el lado B: X apunta a la izquierda. */
  readonly mirrored?: boolean;
  /** Norte desde la +Y local (rad, horario). `null`/ausente = no se dibuja. */
  readonly northAngle?: number | null;
  readonly bottom: number;
  readonly onPress?: () => void;
}

export const AxisGizmo = React.memo(function AxisGizmo({ kind, rotation = 0, mirrored, northAngle, bottom, onPress }: AxisGizmoProps) {
  const styles = useStyles();
  const paths = useMemo(() => {
    if (kind === 'elevation') {
      return { x: arrow(mirrored ? -1 : 1, 0), y: null, z: arrow(0, -1), north: null };
    }
    const c = Math.cos(rotation);
    const s = Math.sin(rotation);
    // Dirección en pantalla de un vector del modelo (Y hacia abajo) girado por la vista.
    const scr = (mx: number, my: number): [number, number] => [mx * c - my * s, mx * s + my * c];
    const [xx, xy] = scr(1, 0);
    const [yx, yy] = scr(0, -1); // +Y local = −y del modelo
    let north: ReturnType<typeof arrow> | null = null;
    if (northAngle != null) {
      // Norte = +Y local girada `northAngle` en sentido horario (en local, Y arriba).
      const lx = Math.sin(northAngle);
      const ly = Math.cos(northAngle);
      const [nx, ny] = scr(lx, -ly);
      north = arrow(nx, ny, LEN + 8);
    }
    return { x: arrow(xx, xy), y: arrow(yx, yy), z: null, north, labels: { x: [xx, xy], y: [yx, yy] } };
  }, [kind, rotation, mirrored, northAngle]);

  // Sin acción (alzado) es un simple rótulo: un Tappable deshabilitado se vería atenuado.
  const Wrapper = (onPress ? Tappable : View) as React.ComponentType<any>;
  const labelPos = (dx: number, dy: number) => ({ left: C + dx * (LEN + 9) - 5, top: C + dy * (LEN + 9) - 8 });
  const lx = kind === 'elevation' ? [mirrored ? -1 : 1, 0] : (paths as { labels: { x: number[] } }).labels.x;
  const ly = kind === 'elevation' ? null : (paths as { labels: { y: number[] } }).labels.y;

  return (
    <Wrapper
      {...(onPress ? { onPress, haptic: 'select' as const } : {})}
      style={[styles.box, { bottom }]}
      accessibilityLabel={kind === 'plan' ? 'Ejes de referencia. Tocar para enderezar la vista' : 'Ejes de referencia del alzado'}
    >
      <Canvas style={styles.canvas}>
        {paths.north ? <Path path={paths.north} color={AXIS_COLORS.north} style="stroke" strokeWidth={3} strokeCap="round" /> : null}
        <Path path={paths.x} color={AXIS_COLORS.x} style="stroke" strokeWidth={2.5} strokeCap="round" />
        {paths.y ? <Path path={paths.y} color={AXIS_COLORS.y} style="stroke" strokeWidth={2.5} strokeCap="round" /> : null}
        {paths.z ? <Path path={paths.z} color={AXIS_COLORS.z} style="stroke" strokeWidth={2.5} strokeCap="round" /> : null}
        {kind === 'plan' ? (
          <>
            <Circle cx={C} cy={C} r={5} color={AXIS_COLORS.z} style="stroke" strokeWidth={2} />
            <Circle cx={C} cy={C} r={1.8} color={AXIS_COLORS.z} />
          </>
        ) : null}
      </Canvas>
      <Text style={[styles.label, { color: AXIS_COLORS.x }, labelPos(lx[0], lx[1])]}>X</Text>
      {ly ? <Text style={[styles.label, { color: AXIS_COLORS.y }, labelPos(ly[0], ly[1])]}>Y</Text> : null}
      <Text style={[styles.label, { color: AXIS_COLORS.z }, kind === 'plan' ? { left: C + 6, top: C + 2 } : labelPos(0, -1)]}>Z</Text>
      {paths.north ? <Text style={styles.north}>N</Text> : null}
    </Wrapper>
  );
});

const useStyles = themedStyles((colors) => ({
  box: {
    position: 'absolute',
    left: spacing.lg,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.glass,
    borderWidth: colors.hairline,
    borderColor: colors.border,
    ...elevation[1],
  },
  canvas: { width: SIZE, height: SIZE },
  label: { position: 'absolute', ...type.label, fontSize: 10 },
  north: { position: 'absolute', right: 2, top: 0, ...type.label, fontSize: 10, color: AXIS_COLORS.north },
}));

