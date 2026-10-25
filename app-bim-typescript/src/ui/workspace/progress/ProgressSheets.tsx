// =============================================================================
// ProgressSheets — Actividades y cortes (catálogo) y reporte del Avance (M3)
// =============================================================================
//
// REPORTE (H-90): se elige qué se reporta y cómo:
//   · alcance: todo el espacio o el elemento desde cuya vista se abrió (un
//     muro, un suelo aislado, una columna);
//   · cortes: uno o varios (por defecto, el activo);
//   · actividades: todas o algunas;
//   · elementos sin avance, registro fotográfico y dibujos (sí/no);
// y sale en PDF (reporte), Excel (memoria de cantidades con la plantilla del
// contrato) o CSV. El encabezado del contrato y el ítem de cada actividad se
// escriben una vez y se recuerdan por proyecto.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BottomSheet, ActionButton, Chip, Tappable, Icon, Accordion, confirm } from '../../primitives';
import { TextField, ToggleRow } from '../../components/fields';
import { ACTIVITY_COLORS, DEFAULT_ACTIVITIES, cutLabel, orderedCuts, todayIso } from '../../../domain/progress/progress';
import { activityTotals, buildReport, ReportOptions } from '../../../application/progress/progressReport';
import { EMPTY_MEMORIA_HEADER, MemoriaHeader, MemoriaItem } from '../../../application/progress/progressMemoria';
import { loadMemoriaPrefs, saveMemoriaPrefs } from '../../../native/prefs/prefsFile';
import { spacing, radius } from '../../design/tokens';
import { type } from '../../design/typography';
import { themedStyles, useTheme } from '../../design/theme';
import { haptic } from '../../design/haptics';
import { safeName, saveCsv, savePdfFrom, sharePdfFrom, saveXlsx, shareXlsx } from '../reportActions';
import type { Progress } from './useProgress';
import type { ProgressReportIO } from './useProgressReport';

const PALETTE = [...new Set([...DEFAULT_ACTIVITIES.map((a) => a.color), ...ACTIVITY_COLORS])];

interface ProgressSheetsProps {
  progress: Progress;
  io: ProgressReportIO;
  /** Proyecto (o espacio) dueño del encabezado de la memoria. */
  projectKey: string;
  projectName: string;
  spaceName: string;
  /** Nombre legible de un soporte ("R-01 Cocina · suelo", "Muro 3 · cara A"). */
  supportLabel: (targetKey: string) => string;
}

export function ProgressSheets({ progress, io, projectKey, projectName, spaceName, supportLabel }: ProgressSheetsProps) {
  return (
    <>
      <BottomSheet open={progress.sheet === 'catalog'} onClose={progress.closeSheet} heightRatio={0.72}>
        <CatalogBody progress={progress} />
      </BottomSheet>
      <BottomSheet open={progress.sheet === 'report'} onClose={progress.closeSheet} heightRatio={0.86}>
        <ReportBody progress={progress} io={io} projectKey={projectKey} projectName={projectName} spaceName={spaceName} supportLabel={supportLabel} />
      </BottomSheet>
    </>
  );
}

function CatalogBody({ progress }: { progress: Progress }) {
  const styles = useStyles();
  const colors = useTheme();
  const { ctl, state } = progress;
  const cut = state.cuts.find((c) => c.id === state.cutId) ?? null;
  const activity = state.activities.find((a) => a.id === state.activityId) ?? null;
  const [newName, setNewName] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Corte</Text>
      <Text style={styles.hint}>
        El corte es la fecha del reporte: lo que pintes queda en el corte activo. Lo ejecutado con una actividad en un corte no se puede volver a
        ejecutar con la misma actividad en otro.
      </Text>
      <View style={styles.chips}>
        {orderedCuts(state.cuts).map((c) => (
          <Chip key={c.id} label={cutLabel(c)} active={c.id === state.cutId} onPress={() => ctl.setCut(c.id)} />
        ))}
      </View>
      <ActionButton label={`Nuevo corte (${todayIso()})`} icon="calendar-plus" variant="secondary" onPress={() => void ctl.addCut()} />
      {cut ? (
        <>
          <TextField label="Fecha (AAAA-MM-DD)" value={cut.date} commitOn="blur" onCommit={(date) => void ctl.editCut(cut.id, { date })} />
          <TextField label="Nombre del corte" value={cut.label} placeholder="Ej. Acta 3" commitOn="blur" onCommit={(label) => void ctl.editCut(cut.id, { label })} />
        </>
      ) : null}

      <Text style={[styles.title, { marginTop: spacing.lg }]}>Actividades</Text>
      {state.activities.map((a) => (
        <Tappable
          key={a.id}
          style={[styles.row, a.id === state.activityId && styles.rowOn]}
          haptic="select"
          onPress={() => ctl.setActivity(a.id)}
          accessibilityLabel={`Actividad ${a.name}`}
        >
          <View style={[styles.swatch, { backgroundColor: a.color }]} />
          <Text style={styles.rowText}>{a.name}</Text>
          {a.id === state.activityId ? <Icon name="check" size={18} color={colors.accentText} /> : null}
        </Tappable>
      ))}
      {activity ? (
        <View style={styles.editBox}>
          <TextField label="Nombre" value={activity.name} commitOn="blur" onCommit={(name) => void ctl.editActivity(activity.id, { name })} />
          <View style={styles.chips}>
            {PALETTE.map((c) => (
              <Tappable
                key={c}
                style={[styles.colorDot, { backgroundColor: c }, c === activity.color && styles.colorDotOn]}
                haptic="select"
                onPress={() => void ctl.editActivity(activity.id, { color: c })}
                accessibilityLabel={`Color ${c}`}
              />
            ))}
          </View>
          <ActionButton
            label="Quitar del catálogo"
            variant="secondary"
            onPress={async () => {
              const ok = await confirm({
                title: `Quitar "${activity.name}"`,
                message: 'Lo ya pintado con esta actividad se conserva en los reportes.',
                confirmLabel: 'Quitar',
                destructive: true,
              });
              if (ok) void ctl.removeActivity(activity.id);
            }}
          />
        </View>
      ) : null}
      <TextField label="Nueva actividad" value={newName} placeholder="Ej. Impermeabilización" onCommit={setNewName} />
      <ActionButton
        label="Agregar actividad"
        icon="plus"
        variant="secondary"
        disabled={!newName.trim()}
        onPress={() => {
          void ctl.addActivity(newName.trim());
          setNewName('');
          haptic.commit();
        }}
      />
    </ScrollView>
  );
}

/** Campos del encabezado de la memoria, en el orden de la plantilla. */
const HEADER_FIELDS: readonly { key: keyof MemoriaHeader; label: string; multiline?: boolean }[] = [
  { key: 'contrato', label: 'Contrato No.' },
  { key: 'actaParcial', label: 'Acta parcial No.' },
  { key: 'objeto', label: 'Objeto', multiline: true },
  { key: 'contratista', label: 'Contratista' },
  { key: 'interventoria', label: 'Interventoría' },
  { key: 'directorObra', label: 'Director de obra' },
  { key: 'matriculaDirectorObra', label: 'Matrícula del director de obra' },
  { key: 'directorInterventoria', label: 'Director de interventoría' },
  { key: 'matriculaDirectorInterventoria', label: 'Matrícula del director de interventoría' },
  { key: 'residenteObra', label: 'Residente de obra' },
  { key: 'matriculaResidenteObra', label: 'Matrícula del residente de obra' },
  { key: 'residenteInterventoria', label: 'Residente de interventoría' },
  { key: 'matriculaResidenteInterventoria', label: 'Matrícula del residente de interventoría' },
  { key: 'codigoFormato', label: 'Código del formato (esquina superior derecha)', multiline: true },
];

function ReportBody({ progress, io, projectKey, projectName, spaceName, supportLabel }: Omit<ProgressSheetsProps, 'progress'> & { progress: Progress }) {
  const styles = useStyles();
  const { state, ctl, reportScope } = progress;
  const cuts = useMemo(() => orderedCuts(state.cuts), [state.cuts]);
  const [cutIds, setCutIds] = useState<readonly string[]>(() => (state.cutId ? [state.cutId] : []));
  const [activityIds, setActivityIds] = useState<readonly string[] | null>(null);
  // «Todo el espacio» vale para el alcance con que se abrió: abrir el reporte desde otro elemento vuelve a ese elemento.
  const [wholeFor, setWholeFor] = useState<unknown>(undefined);
  const wholeSpace = wholeFor === reportScope;
  const setWholeSpace = (on: boolean) => setWholeFor(on ? reportScope : undefined);
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [includeDrawings, setIncludeDrawings] = useState(true);
  const [header, setHeader] = useState<MemoriaHeader>(EMPTY_MEMORIA_HEADER);
  const [items, setItems] = useState<Record<string, MemoriaItem>>({});

  useEffect(() => {
    let cancelled = false;
    void loadMemoriaPrefs(projectKey).then((p) => {
      if (cancelled) return;
      setHeader({ ...EMPTY_MEMORIA_HEADER, ...(p.header as Partial<MemoriaHeader>) });
      setItems(p.items ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [projectKey]);

  const scope = wholeSpace ? null : reportScope;
  const opt: ReportOptions = {
    cutIds,
    activityIds,
    scopeKeys: scope?.keys ?? null,
    scopeTitle: scope?.title ?? 'Todo el espacio',
    includeEmpty,
    includePhotos,
    includeDrawings,
  };

  // Vista previa (sin fotos: se leen al exportar).
  const preview = useMemo(
    () =>
      buildReport(
        {
          cuts: state.cuts,
          activities: state.allActivities,
          supportKeys: ctl.supportKeys,
          supportArea: (k) => ctl.supportAreaOf(k),
          supportLabel,
          quantities: (c) => ctl.quantities(c),
          parts: () => [],
          photos: [],
        },
        { ...opt, includePhotos: false },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.marks, state.cuts, state.allActivities, cutIds, activityIds, scope, includeEmpty, supportLabel, progress.supports],
  );
  const totals = useMemo(() => activityTotals(preview.flatMap((b) => b.rows)), [preview]);

  if (!cuts.length) {
    return (
      <View style={styles.body}>
        <Text style={styles.title}>Reporte</Text>
        <Text style={styles.hint}>Crea un corte en «Actividad y corte» y pinta el avance para ver cantidades.</Text>
      </View>
    );
  }

  const toggle = <T,>(list: readonly T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const base = `${safeName(projectName)}-${safeName(spaceName)}-${scope ? `${safeName(scope.title)}-` : ''}avance-${cuts.filter((c) => cutIds.includes(c.id)).map((c) => c.date).join('_') || 'sin-corte'}`;
  const noCut = cutIds.length === 0;
  const memoriaItems = () =>
    new Map(
      state.allActivities.map((a) => [a.id, { code: items[a.id]?.code ?? '', description: items[a.id]?.description || a.name.toUpperCase(), unit: items[a.id]?.unit || 'M2' }]),
    );
  const setHeaderField = (key: keyof MemoriaHeader, v: string) => {
    setHeader((h) => ({ ...h, [key]: v }));
    void saveMemoriaPrefs(projectKey, { header: { [key]: v } });
  };
  const setItemField = (actId: string, key: keyof MemoriaItem, v: string) => {
    setItems((cur) => {
      const prev = cur[actId] ?? { code: '', description: '', unit: '' };
      const next = { ...cur, [actId]: { ...prev, [key]: v } };
      void saveMemoriaPrefs(projectKey, { items: { [actId]: next[actId] } });
      return next;
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Reporte de avance</Text>

      <Text style={styles.section}>Alcance</Text>
      <View style={styles.chips}>
        {reportScope ? <Chip label={reportScope.title} active={!wholeSpace} onPress={() => setWholeSpace(false)} /> : null}
        <Chip label="Todo el espacio" active={!scope} onPress={() => setWholeSpace(true)} />
      </View>

      <Text style={styles.section}>Cortes</Text>
      <View style={styles.chips}>
        {cuts.map((c) => (
          <Chip key={c.id} label={cutLabel(c)} active={cutIds.includes(c.id)} onPress={() => setCutIds((l) => toggle(l, c.id))} />
        ))}
      </View>
      <View style={styles.chips}>
        <Chip label="Solo el activo" active={cutIds.length === 1 && cutIds[0] === state.cutId} onPress={() => setCutIds(state.cutId ? [state.cutId] : [])} />
        <Chip label="Todos" active={cutIds.length === cuts.length} onPress={() => setCutIds(cuts.map((c) => c.id))} />
      </View>

      <Text style={styles.section}>Actividades</Text>
      <View style={styles.chips}>
        <Chip label="Todas" active={activityIds === null} onPress={() => setActivityIds(null)} />
        {state.allActivities.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            active={activityIds?.includes(a.id) ?? false}
            onPress={() => setActivityIds((l) => {
              const next = toggle(l ?? [], a.id);
              return next.length ? next : null;
            })}
          />
        ))}
      </View>

      <ToggleRow label="Elementos sin avance" description="Lista los del alcance que no avanzaron en el corte" value={includeEmpty} onChange={setIncludeEmpty} />
      <ToggleRow label="Registro fotográfico" description="Fotos de avance del corte (con fecha y elemento)" value={includePhotos} onChange={setIncludePhotos} />
      <ToggleRow label="Dibujos" description="Planta y alzados con lo pintado" value={includeDrawings} onChange={setIncludeDrawings} />

      <Text style={styles.section}>Resumen</Text>
      {noCut ? <Text style={styles.hint}>Elige al menos un corte.</Text> : null}
      {!noCut && totals.length === 0 ? <Text style={styles.hint}>Nada pintado con esta selección.</Text> : null}
      {totals.map((t) => (
        <View key={t.activity} style={styles.totalRow}>
          <View style={[styles.swatch, { backgroundColor: t.color }]} />
          <Text style={styles.rowText}>{t.activity}</Text>
          <Text style={styles.num}>{t.inCut.toFixed(2)} m²</Text>
        </View>
      ))}
      {preview.map((b) => (
        <View key={b.cut.id} style={styles.cutBox}>
          <Text style={styles.cutTitle}>Corte {cutLabel(b.cut)}</Text>
          {b.rows.map((r, i) => (
            <Text key={i} style={styles.detail}>
              {r.activity} · {r.support}: {r.inCut.toFixed(2)} m² ({r.percent.toFixed(0)} %)
            </Text>
          ))}
          {b.empty.length ? <Text style={styles.detail}>Sin avance: {b.empty.map((e) => e.support).join(', ')}</Text> : null}
        </View>
      ))}

      <View style={styles.actions}>
        <ActionButton label="Guardar PDF" icon="file-pdf-box" disabled={noCut} onPress={() => void savePdfFrom(`${base}.pdf`, () => io.pdfHtml(opt))} />
        <ActionButton label="Compartir PDF" icon="share-variant" variant="secondary" disabled={noCut} onPress={() => void sharePdfFrom(() => io.pdfHtml(opt), 'Reporte de avance', `${base}.pdf`)} />
        <ActionButton
          label="Memoria en Excel"
          icon="microsoft-excel"
          disabled={noCut}
          onPress={() => void saveXlsx(`${base}-memoria.xlsx`, () => io.xlsx(opt, header, memoriaItems()))}
        />
        <ActionButton
          label="Compartir Excel"
          icon="share-variant"
          variant="secondary"
          disabled={noCut}
          onPress={() => void shareXlsx(`${base}-memoria.xlsx`, () => io.xlsx(opt, header, memoriaItems()))}
        />
        <ActionButton label="Exportar CSV" icon="file-delimited-outline" variant="secondary" disabled={noCut} onPress={() => void io.csv(opt).then((csv) => saveCsv(`${base}.csv`, csv))} />
      </View>

      <Accordion title="Encabezado de la memoria (contrato)" icon="file-document-edit-outline">
        <Text style={styles.hint}>Se escribe una vez y se recuerda para este proyecto en este equipo.</Text>
        {HEADER_FIELDS.map((f) => (
          <TextField key={f.key} label={f.label} value={header[f.key]} multiline={f.multiline} commitOn="blur" onCommit={(v) => setHeaderField(f.key, v)} />
        ))}
      </Accordion>
      <Accordion title="Ítems del presupuesto por actividad" icon="format-list-numbered">
        <Text style={styles.hint}>Capítulo/ítem, descripción y unidad de cada actividad en la memoria.</Text>
        {state.allActivities.map((a) => (
          <View key={a.id} style={styles.editBox}>
            <Text style={styles.rowText}>{a.name}</Text>
            <TextField label="Capítulo / ítem" value={items[a.id]?.code ?? ''} placeholder="Ej. 8.1.3.10" commitOn="blur" onCommit={(v) => setItemField(a.id, 'code', v)} />
            <TextField
              label="Descripción"
              value={items[a.id]?.description ?? ''}
              placeholder={a.name.toUpperCase()}
              multiline
              commitOn="blur"
              onCommit={(v) => setItemField(a.id, 'description', v)}
            />
            <TextField label="Unidad" value={items[a.id]?.unit ?? ''} placeholder="M2" commitOn="blur" onCommit={(v) => setItemField(a.id, 'unit', v)} />
          </View>
        ))}
      </Accordion>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { ...type.title, color: colors.text },
  section: { ...type.bodyStrong, color: colors.text, marginTop: spacing.md },
  hint: { ...type.caption, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  rowOn: { backgroundColor: colors.accentSoft },
  rowText: { ...type.bodyStrong, color: colors.text, flex: 1 },
  swatch: { width: 18, height: 18, borderRadius: 4 },
  editBox: { gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  colorDot: { width: 30, height: 30, borderRadius: 15 },
  colorDotOn: { borderWidth: 3, borderColor: colors.text },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  num: { ...type.value, color: colors.textSecondary },
  cutBox: { gap: 2, paddingVertical: spacing.xs },
  cutTitle: { ...type.label, color: colors.text },
  detail: { ...type.caption, color: colors.textSecondary },
  actions: { gap: spacing.sm, marginTop: spacing.md },
}));
