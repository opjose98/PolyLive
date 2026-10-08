// =============================================================================
// ProgressSheets — Actividades y cortes (catálogo) y reporte del Avance (M3)
// =============================================================================

import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BottomSheet, ActionButton, Chip, Tappable, Icon, confirm } from '../../primitives';
import { TextField } from '../../components/fields';
import { ACTIVITY_COLORS, DEFAULT_ACTIVITIES, todayIso } from '../../../domain/progress/progress';
import { activityTotals, reportCsv, reportHtml, reportRows } from '../../../application/progress/progressReport';
import { spacing, radius } from '../../design/tokens';
import { type } from '../../design/typography';
import { themedStyles, useTheme } from '../../design/theme';
import { haptic } from '../../design/haptics';
import { safeName, saveCsv, savePdf, sharePdf } from '../reportActions';
import type { Progress } from './useProgress';

const PALETTE = [...new Set([...DEFAULT_ACTIVITIES.map((a) => a.color), ...ACTIVITY_COLORS])];

interface ProgressSheetsProps {
  progress: Progress;
  projectName: string;
  spaceName: string;
  operatorName: string;
  /** Nombre legible de un soporte ("R-01 Cocina · suelo", "Muro 3 · cara A"). */
  supportLabel: (targetKey: string) => string;
  /** Planta coloreada con el avance, como SVG. */
  planSvg: () => string;
  /** Caras de muro pintadas, cada una como SVG con su nombre. */
  faceViews: () => { title: string; svg: string }[];
}

export function ProgressSheets({ progress, projectName, spaceName, operatorName, supportLabel, planSvg, faceViews }: ProgressSheetsProps) {
  return (
    <>
      <BottomSheet open={progress.sheet === 'catalog'} onClose={progress.closeSheet} heightRatio={0.72}>
        <CatalogBody progress={progress} />
      </BottomSheet>
      <BottomSheet open={progress.sheet === 'report'} onClose={progress.closeSheet} heightRatio={0.72}>
        <ReportBody
          progress={progress}
          projectName={projectName}
          spaceName={spaceName}
          operatorName={operatorName}
          supportLabel={supportLabel}
          planSvg={planSvg}
          faceViews={faceViews}
        />
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
      <Text style={styles.hint}>El corte es la fecha del reporte: lo que pintes queda en el corte activo.</Text>
      <View style={styles.chips}>
        {state.cuts.map((c) => (
          <Chip key={c.id} label={c.label ? `${c.label} · ${c.date}` : c.date} active={c.id === state.cutId} onPress={() => ctl.setCut(c.id)} />
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

function ReportBody({
  progress,
  projectName,
  spaceName,
  operatorName,
  supportLabel,
  planSvg,
  faceViews,
}: Omit<ProgressSheetsProps, 'progress'> & { progress: Progress }) {
  const styles = useStyles();
  const { state, ctl } = progress;
  const cut = state.cuts.find((c) => c.id === state.cutId) ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => reportRows(ctl.quantities(), state.allActivities, supportLabel), [ctl, state.marks, state.cutId, state.allActivities, supportLabel, progress.supports]);
  const totals = useMemo(() => activityTotals(rows), [rows]);

  if (!cut) {
    return (
      <View style={styles.body}>
        <Text style={styles.title}>Reporte</Text>
        <Text style={styles.hint}>Crea un corte y pinta el avance para ver cantidades.</Text>
      </View>
    );
  }
  const meta = { project: projectName, space: spaceName, cut, operator: operatorName, generatedAt: new Date() };
  const base = `${safeName(projectName)}-${safeName(spaceName)}-avance-${cut.date}`;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>Reporte · {cut.label || cut.date}</Text>
      {rows.length === 0 ? <Text style={styles.hint}>Nada pintado en este corte todavía.</Text> : null}
      {totals.map((t) => (
        <View key={t.activity} style={styles.totalRow}>
          <View style={[styles.swatch, { backgroundColor: t.color }]} />
          <Text style={styles.rowText}>{t.activity}</Text>
          <Text style={styles.num}>{t.inCut.toFixed(2)} m² en el corte</Text>
          <Text style={styles.num}>{t.cumulative.toFixed(2)} m² acum.</Text>
        </View>
      ))}
      {rows.map((r, i) => (
        <Text key={i} style={styles.detail}>
          {r.activity} · {r.support}: {r.inCut.toFixed(2)} m² ({r.percent.toFixed(0)} % del soporte)
        </Text>
      ))}
      <View style={styles.actions}>
        <ActionButton label="Exportar CSV" icon="file-delimited-outline" variant="secondary" onPress={() => void saveCsv(`${base}.csv`, reportCsv(meta, rows))} />
        <ActionButton label="Exportar PDF" icon="file-pdf-box" onPress={() => void savePdf(`${base}.pdf`, reportHtml(meta, rows, planSvg(), undefined, faceViews()))} />
        <ActionButton label="Compartir PDF" icon="share-variant" variant="secondary" onPress={() => void sharePdf(reportHtml(meta, rows, planSvg(), undefined, faceViews()), 'Reporte de avance', `${base}.pdf`)} />
      </View>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { ...type.title, color: colors.text },
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
  detail: { ...type.caption, color: colors.textSecondary },
  actions: { gap: spacing.sm, marginTop: spacing.md },
}));
