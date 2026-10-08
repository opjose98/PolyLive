// =============================================================================
// ReviewSheets — Observación (comentario, estado, color, foto), texto y acta (M4)
// =============================================================================

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BottomSheet, ActionButton, Tappable, toast, confirm } from '../../primitives';
import { TextField, ReadonlyRow } from '../../components/fields';
import { REVIEW_COLORS, ReviewItem, ReviewView, countByStatus, localStamp, viewKey } from '../../../domain/review/review';
import { reviewCsv, reviewHtml } from '../../../application/review/reviewReport';
import { spacing, radius } from '../../design/tokens';
import { type } from '../../design/typography';
import { themedStyles, useTheme } from '../../design/theme';
import { haptic } from '../../design/haptics';
import { safeName, saveCsv, savePdf, sharePdf } from '../reportActions';
import type { Review } from './useReview';

interface ReviewSheetsProps {
  review: Review;
  projectName: string;
  spaceName: string;
  operatorName: string;
  /** "Planta" o "Muro 3 · cara A". */
  viewName: (v: ReviewView) => string;
  /** Dibujo de una vista con sus observaciones, como SVG. */
  viewSvg: (v: ReviewView, items: readonly ReviewItem[]) => string;
  onOpenPhoto?: (photoId: string) => void;
  /** Fotos de las observaciones como data URI (para incrustarlas en el acta). */
  photoData?: (photoIds: readonly string[]) => Promise<ReadonlyMap<string, string>>;
}

const when = (iso?: string) => localStamp(iso) || '—';

export function ReviewSheets(props: ReviewSheetsProps) {
  const { review } = props;
  const pending = review.state.pendingText;
  return (
    <>
      <BottomSheet open={review.sheet === 'item' && !!review.ctl.selected} onClose={review.closeSheet} heightRatio={0.7}>
        {review.ctl.selected ? <ItemBody {...props} item={review.ctl.selected} /> : null}
      </BottomSheet>
      <BottomSheet open={!!pending} onClose={() => review.ctl.cancelText()} heightRatio={0.4}>
        <TextBody review={review} />
      </BottomSheet>
      <BottomSheet open={review.sheet === 'list'} onClose={review.closeSheet} heightRatio={0.75}>
        <ListBody {...props} />
      </BottomSheet>
    </>
  );
}

function ItemBody({ review, viewName, onOpenPhoto, item }: ReviewSheetsProps & { item: ReviewItem }) {
  const styles = useStyles();
  const colors = useTheme();
  const { ctl } = review;
  const resolved = item.status === 'resolved';
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.head}>
        <View style={[styles.num, { backgroundColor: item.color }]}>
          <Text style={styles.numText}>{item.number}</Text>
        </View>
        <Text style={styles.title}>Observación {item.number}</Text>
        <Text style={[styles.badge, { color: resolved ? colors.success : colors.error }]}>{resolved ? 'Resuelta' : 'Abierta'}</Text>
      </View>
      <TextField
        label="Comentario"
        value={item.comment}
        placeholder="Qué hay que corregir, verificar o informar"
        multiline
        commitOn="blur"
        onCommit={(c) => void ctl.editComment(item.id, c)}
      />
      <View style={styles.colors}>
        {REVIEW_COLORS.map((c) => (
          <Tappable
            key={c}
            style={[styles.dot, { backgroundColor: c }, c === item.color && styles.dotOn]}
            haptic="select"
            onPress={() => void ctl.editColor(item.id, c)}
            accessibilityLabel={`Color ${c}`}
          />
        ))}
      </View>
      <ReadonlyRow label="Vista" value={viewName(item.view)} />
      <ReadonlyRow label="Autor" value={`${item.author || '—'} · ${when(item.createdAt)}`} />
      {resolved ? <ReadonlyRow label="Resuelta por" value={`${item.resolvedBy || '—'} · ${when(item.resolvedAt)}`} /> : null}
      <ActionButton
        label={resolved ? 'Reabrir' : 'Marcar como resuelta'}
        icon={resolved ? 'restore' : 'check-circle-outline'}
        onPress={() => {
          haptic.commit();
          void ctl.setStatus(item.id, resolved ? 'open' : 'resolved');
        }}
      />
      {item.photoId ? (
        <View style={styles.row}>
          {onOpenPhoto ? <ActionButton label="Ver foto" icon="image-outline" variant="secondary" onPress={() => onOpenPhoto(item.photoId!)} /> : null}
          <ActionButton label="Quitar foto" variant="secondary" onPress={() => void ctl.attachPhoto(item.id, null)} />
        </View>
      ) : (
        <ActionButton label="Tomar foto" icon="camera-outline" variant="secondary" onPress={() => review.requestPhoto(item.id)} />
      )}
      <ActionButton
        label="Borrar observación"
        variant="secondary"
        onPress={async () => {
          const ok = await confirm({ title: `Borrar la observación ${item.number}`, confirmLabel: 'Borrar', destructive: true });
          if (!ok) return;
          review.closeSheet();
          await ctl.remove(item.id);
          toast(`Observación ${item.number} borrada`, { action: { label: 'Deshacer', onPress: () => void ctl.undo() } });
        }}
      />
    </ScrollView>
  );
}

function TextBody({ review }: { review: Review }) {
  const styles = useStyles();
  const [text, setText] = useState('');
  useEffect(() => setText(''), [review.state.pendingText]);
  return (
    <View style={styles.body}>
      <Text style={styles.title}>Texto en el plano</Text>
      <TextField label="Texto" value={text} placeholder="Ej. Verificar plomo" onCommit={setText} />
      <View style={styles.row}>
        <ActionButton label="Cancelar" variant="secondary" onPress={() => review.ctl.cancelText()} />
        <ActionButton label="Agregar" disabled={!text.trim()} onPress={() => void review.ctl.submitText(text)} />
      </View>
    </View>
  );
}

function ListBody({ review, projectName, spaceName, operatorName, viewName, viewSvg, photoData }: ReviewSheetsProps) {
  const styles = useStyles();
  const colors = useTheme();
  const items = review.state.items;
  const counts = countByStatus(items);
  const meta = { project: projectName, space: spaceName, reviewer: operatorName, generatedAt: new Date() };
  const where = (i: ReviewItem) => viewName(i.view);
  const html = async () => {
    const ids = items.map((i) => i.photoId).filter((p): p is string => !!p);
    const photos = photoData && ids.length ? await photoData(ids) : new Map<string, string>();
    // Un dibujo por vista con observaciones: la planta primero.
    const views = new Map<string, { view: ReviewView; items: ReviewItem[] }>();
    for (const i of items) {
      const k = viewKey(i.view);
      views.set(k, { view: i.view, items: [...(views.get(k)?.items ?? []), i] });
    }
    const ordered = [...views.values()].sort((a, b) => (a.view.kind === 'plan' ? -1 : b.view.kind === 'plan' ? 1 : 0));
    return reviewHtml(meta, items, ordered.map((v) => ({ title: viewName(v.view), svg: viewSvg(v.view, v.items) })), where, photos);
  };
  const base = `${safeName(projectName)}-${safeName(spaceName)}-revision-${new Date().toISOString().slice(0, 10)}`;
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>Observaciones</Text>
      <Text style={styles.hint}>
        {counts.open} abierta(s) · {counts.resolved} resuelta(s)
      </Text>
      {items.length === 0 ? <Text style={styles.hint}>Sin observaciones: elige una marca en el FAB + y dibuja sobre el plano.</Text> : null}
      {items.map((i) => (
        <Tappable key={i.id} style={styles.item} haptic="select" onPress={() => review.openItem(i.id)} accessibilityLabel={`Observación ${i.number}`}>
          <View style={[styles.num, { backgroundColor: i.color }]}>
            <Text style={styles.numText}>{i.number}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemText} numberOfLines={2}>
              {i.comment || (i.markup.kind === 'text' ? i.markup.text : 'Sin comentario')}
            </Text>
            <Text style={styles.hint}>
              {viewName(i.view)} · {i.author || '—'} · {when(i.createdAt)}
            </Text>
          </View>
          <Text style={[styles.badge, { color: i.status === 'resolved' ? colors.success : colors.error }]}>
            {i.status === 'resolved' ? 'Resuelta' : 'Abierta'}
          </Text>
        </Tappable>
      ))}
      <View style={styles.actions}>
        <ActionButton label="Exportar acta PDF" icon="file-pdf-box" disabled={!items.length} onPress={async () => void savePdf(`${base}.pdf`, await html())} />
        <ActionButton label="Compartir acta" icon="share-variant" variant="secondary" disabled={!items.length} onPress={async () => void sharePdf(await html(), 'Acta de revisión', `${base}.pdf`)} />
        <ActionButton
          label="Exportar CSV"
          icon="file-delimited-outline"
          variant="secondary"
          disabled={!items.length}
          onPress={() => void saveCsv(`${base}.csv`, reviewCsv(meta, items, where))}
        />
      </View>
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  body: { padding: spacing.lg, gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.title, color: colors.text, flex: 1 },
  hint: { ...type.caption, color: colors.textSecondary },
  badge: { ...type.label },
  num: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  numText: { ...type.label, color: '#FFFFFF' },
  colors: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 30, height: 30, borderRadius: 15 },
  dotOn: { borderWidth: 3, borderColor: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderColor: colors.border, borderRadius: radius.xs },
  itemText: { ...type.body, color: colors.text },
  actions: { gap: spacing.sm, marginTop: spacing.md },
}));
