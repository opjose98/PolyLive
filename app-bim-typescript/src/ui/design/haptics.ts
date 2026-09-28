// =============================================================================
// haptics.ts — Vocabulario háptico de la app
// =============================================================================
//
// Los componentes piden un SIGNIFICADO ("se seleccionó algo", "snap"), no una
// intensidad; así el lenguaje táctil es coherente en toda la app. Los errores
// de la API nativa se ignoran: la háptica es refuerzo, nunca un requisito.
// =============================================================================

import * as Haptics from 'expo-haptics';

function safe(p: Promise<void>): void {
  p.catch(() => undefined);
}

export const haptic = {
  /** Toque de botón, toggle. */
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Cambio de selección, de radio, de categoría. */
  select: () => safe(Haptics.selectionAsync()),
  /** El cursor se enganchó a un nodo o a un nivel. */
  snap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Se agarró un objeto o se disparó un long-press. */
  grab: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Se creó algo. */
  commit: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Se borró algo. */
  destroy: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
