// =============================================================================
// PropertiesPanel.tsx — Propiedades y acciones del objeto seleccionado
// Portado de LevON: features/overlays/properties_panel.dart
// =============================================================================
//
// GAP CERRADO: `UpdateObjectPropertyUseCase` y `DeleteObjectUseCase` existían
// desde el principio con sus comandos y su undo, y ninguna pantalla los
// invocaba. Un muro creado en campo con un espesor equivocado no se podía
// corregir: había que borrar el levantamiento y volver a empezar. Este panel
// es la superficie que los expone.
//
// Es un COMPONENTE CONTROLADO: no lee el store ni llama a UseCases. Recibe el
// objeto y devuelve intenciones (`onCommitProperty`, `onDelete`...). Así la
// pantalla sigue siendo el único punto que habla con EditorController, y el
// panel se puede reutilizar tal cual en la vista de elevación.
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { RevitObjectBase } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Room } from '../../domain/objects/room';
import { Column } from '../../domain/objects/column';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import type { Measurement } from '../../domain/objects/measurement';
import { NumberField, TextField, SegmentedField, ReadonlyRow } from './fields';
import { ActionButton } from './ToolPalette';
import { colors, spacing, radius, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PropertiesPanelProps {
  object: RevitObjectBase | null;
  /** Longitud del muro padre — acota el offset de un vano a algo colocable. */
  parentWallLength?: number;
  /** Mediciones tomadas contra este objeto (si es un muro). */
  measurements?: readonly Measurement[];
  busy?: boolean;
  onCommitProperty: (property: string, value: unknown) => void;
  onDelete: () => void;
  onClose: () => void;
  /** Abre la elevación del muro seleccionado (Motor de Elevación). */
  onOpenElevation?: () => void;
  /** Marca este muro como destino de la próxima medición. */
  onMeasure?: () => void;
  /** Abre las fotos vinculadas a este objeto. */
  onOpenPhotos?: () => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PropertiesPanel({
  object,
  parentWallLength,
  measurements,
  busy,
  onCommitProperty,
  onDelete,
  onClose,
  onOpenElevation,
  onMeasure,
  onOpenPhotos,
}: PropertiesPanelProps) {
  if (!object) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Sin selección. Con la herramienta Seleccionar, toca un muro, vano, columna o recinto.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{titleFor(object)}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {object.id as string}
          </Text>
        </View>
        <ActionButton label="Cerrar" variant="secondary" onPress={onClose} />
      </View>

      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <TextField
          label="Nombre"
          value={(object.properties.name as string | undefined) ?? ''}
          placeholder="Sin nombre"
          disabled={busy}
          commitOn="blur"
          onCommit={(value) => onCommitProperty('properties', { ...object.properties, name: value })}
        />

        {object instanceof Wall ? <WallFields wall={object} busy={busy} onCommit={onCommitProperty} /> : null}
        {object instanceof Column ? <ColumnFields column={object} busy={busy} onCommit={onCommitProperty} /> : null}
        {object instanceof Door || object instanceof Window ? (
          <VanoFields vano={object} wallLength={parentWallLength} busy={busy} onCommit={onCommitProperty} />
        ) : null}
        {object instanceof Room ? <RoomFields room={object} /> : null}

        {measurements && measurements.length > 0 ? (
          <MeasurementsList measurements={measurements} />
        ) : null}

        {/* `notes` es un campo de RevitObjectBase, no una propiedad libre: se
            edita directamente y no a través de `properties`. Antes estaba
            declarado en los dos sitios y escribir por uno no afectaba al otro. */}
        <TextField
          label="Observaciones"
          value={object.notes ?? ''}
          placeholder="Notas de campo"
          multiline
          disabled={busy}
          commitOn="blur"
          onCommit={(value) => onCommitProperty('notes', value)}
        />

        <ReadonlyRow label="Creado" value={object.created_at.toLocaleString()} />
        <ReadonlyRow label="Modificado" value={object.updated_at.toLocaleString()} />
        {object.linkedPhotos.length > 0 ? (
          <ReadonlyRow label="Fotos vinculadas" value={String(object.linkedPhotos.length)} />
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        {object instanceof Wall && onOpenElevation ? (
          <ActionButton label="Elevación" variant="secondary" onPress={onOpenElevation} disabled={busy} />
        ) : null}
        {object instanceof Wall && onMeasure ? (
          <ActionButton label="Medir" variant="secondary" onPress={onMeasure} disabled={busy} />
        ) : null}
        {onOpenPhotos ? (
          <ActionButton label="Fotos" variant="secondary" onPress={onOpenPhotos} disabled={busy} />
        ) : null}
        {object instanceof Room ? null : (
          <ActionButton label="Eliminar" variant="danger" onPress={onDelete} disabled={busy} />
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Campos por tipo
// ---------------------------------------------------------------------------

function WallFields({
  wall,
  busy,
  onCommit,
}: {
  wall: Wall;
  busy?: boolean;
  onCommit: (property: string, value: unknown) => void;
}) {
  return (
    <>
      <ReadonlyRow label="Longitud" value={`${Number(wall.length).toFixed(3)} m`} />
      <NumberField
        label="Espesor"
        unit="m"
        decimals={3}
        min={0.01}
        max={2}
        value={wall.thickness as number}
        disabled={busy}
        onCommit={(v) => onCommit('thickness', v)}
      />
      <NumberField
        label="Altura"
        unit="m"
        decimals={2}
        min={0.1}
        max={20}
        value={wall.height as number}
        disabled={busy}
        onCommit={(v) => onCommit('height', v)}
      />
      <SegmentedField
        label="Función"
        value={wall.isStructural ? 'structural' : 'partition'}
        options={[
          { value: 'structural', label: 'Portante' },
          { value: 'partition', label: 'Partición' },
        ]}
        disabled={busy}
        onChange={(v) => onCommit('isStructural', v === 'structural')}
      />
      <TextField
        label="Material"
        value={wall.material ?? ''}
        placeholder="p. ej. ladrillo hueco doble"
        disabled={busy}
        commitOn="blur"
        onCommit={(v) => onCommit('material', v)}
      />
      {/* La jerarquía portante/partición no es cosmética: solo los portantes
          cierran recintos en el TopologyGraph. Decirlo aquí evita que el
          operador marque todo como partición y luego no entienda por qué la
          detección de recintos no encuentra nada. */}
      <Text style={styles.note}>
        Solo los muros portantes cierran recintos en la detección automática.
      </Text>
    </>
  );
}

function ColumnFields({
  column,
  busy,
  onCommit,
}: {
  column: Column;
  busy?: boolean;
  onCommit: (property: string, value: unknown) => void;
}) {
  return (
    <>
      <SegmentedField
        label="Sección"
        value={column.sectionShape}
        options={[
          { value: 'circular', label: 'Circular' },
          { value: 'rectangular', label: 'Rectangular' },
        ]}
        disabled={busy}
        onChange={(v) => onCommit('sectionShape', v)}
      />
      <NumberField
        label={column.isCircular ? 'Diámetro' : 'Ancho'}
        unit="m"
        decimals={3}
        min={0.02}
        max={5}
        value={column.dimensionX as number}
        disabled={busy}
        onCommit={(v) => onCommit('dimensionX', v)}
      />
      {!column.isCircular ? (
        <NumberField
          label="Canto"
          unit="m"
          decimals={3}
          min={0.02}
          max={5}
          value={column.dimensionY as number}
          disabled={busy}
          onCommit={(v) => onCommit('dimensionY', v)}
        />
      ) : null}
      <NumberField
        label="Altura"
        unit="m"
        decimals={2}
        min={0.1}
        max={20}
        value={column.height as number}
        disabled={busy}
        onCommit={(v) => onCommit('height', v)}
      />
      {!column.isCircular ? (
        <NumberField
          label="Rotación"
          unit="°"
          decimals={1}
          min={-360}
          max={360}
          value={(column.rotation * 180) / Math.PI}
          disabled={busy}
          onCommit={(v) => onCommit('rotation', (v * Math.PI) / 180)}
          hint="Giro de la sección respecto al eje X."
        />
      ) : null}
    </>
  );
}

function VanoFields({
  vano,
  wallLength,
  busy,
  onCommit,
}: {
  vano: Door | Window;
  wallLength?: number;
  busy?: boolean;
  onCommit: (property: string, value: unknown) => void;
}) {
  // El offset máximo colocable depende del ancho del vano: más allá de
  // `longitud - ancho` el vano sobresaldría del muro.
  const maxOffset =
    wallLength !== undefined ? Math.max(0, wallLength - (vano.width as number)) : undefined;

  return (
    <>
      <NumberField
        label="Ancho"
        unit="m"
        decimals={3}
        min={0.1}
        max={wallLength ?? 20}
        value={vano.width as number}
        disabled={busy}
        onCommit={(v) => onCommit('width', v)}
      />
      <NumberField
        label="Altura"
        unit="m"
        decimals={2}
        min={0.1}
        max={10}
        value={vano.height as number}
        disabled={busy}
        onCommit={(v) => onCommit('height', v)}
      />
      <NumberField
        label="Posición en el muro"
        unit="m"
        decimals={3}
        min={0}
        max={maxOffset}
        value={vano.offsetAlongWall as number}
        disabled={busy}
        onCommit={(v) => onCommit('offsetAlongWall', v)}
        hint={
          maxOffset !== undefined
            ? `Desde el inicio del muro. Máximo colocable: ${maxOffset.toFixed(2)} m.`
            : 'Distancia desde el inicio del muro.'
        }
      />
      {vano instanceof Door ? (
        <TextField
          label="Tipo de puerta"
          value={vano.doorType ?? ''}
          placeholder="p. ej. abatible simple"
          disabled={busy}
          commitOn="blur"
          onCommit={(v) => onCommit('doorType', v)}
        />
      ) : (
        <TextField
          label="Tipo de ventana"
          value={vano.windowType ?? ''}
          placeholder="p. ej. corredera 2 hojas"
          disabled={busy}
          commitOn="blur"
          onCommit={(v) => onCommit('windowType', v)}
        />
      )}
    </>
  );
}

function RoomFields({ room }: { room: Room }) {
  return (
    <>
      <ReadonlyRow label="Vértices" value={String(room.geometry.length)} />
      <ReadonlyRow
        label="Área"
        value={room.area != null ? `${Number(room.area).toFixed(2)} m²` : 'sin calcular'}
      />
      <ReadonlyRow label="Estado" value={room.isOpen ? 'abierto (editable)' : 'cerrado'} />
      <Text style={styles.note}>
        El área se calcula al cerrar el Recinto. El Recinto se elimina desde la lista de Recintos.
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Mediciones
// ---------------------------------------------------------------------------

function MeasurementsList({ measurements }: { measurements: readonly Measurement[] }) {
  return (
    <View style={styles.measurements}>
      <Text style={styles.sectionTitle}>Mediciones ({measurements.length})</Text>
      {measurements.slice(0, 5).map((m) => (
        <ReadonlyRow
          key={m.id as string}
          label={`${m.capture_method === 'ble' ? 'Huepa' : 'Manual'} · ${m.created_at.toLocaleTimeString()}`}
          value={`${Number(m.average).toFixed(3)} m`}
        />
      ))}
      {measurements.length > 5 ? (
        <Text style={styles.note}>Se muestran las 5 más recientes.</Text>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function titleFor(object: RevitObjectBase): string {
  const name = object.properties.name as string | undefined;
  const typeLabel =
    object.type === 'Wall'
      ? 'Muro'
      : object.type === 'Door'
        ? 'Puerta'
        : object.type === 'Window'
          ? 'Ventana'
          : object.type === 'Column'
            ? 'Columna'
            : object.type === 'Room'
              ? 'Recinto'
              : 'Forjado';
  return name ? `${typeLabel} · ${name}` : typeLabel;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  empty: {
    padding: spacing.lg,
    backgroundColor: colors.surface2,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textDisabled,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface2,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  measurements: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
  },
});
