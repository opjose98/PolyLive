// =============================================================================
// ScreenShell — Marco de las pantallas del menú ☰
// =============================================================================
//
// Cabecera fija (volver, título, subtítulo y acciones) y el contenido debajo.
// Entra deslizándose desde la derecha y el botón atrás de Android la cierra:
// se siente como una pantalla apilada aunque viva encima del levantamiento,
// que sigue montado (y exactamente igual) debajo.
// =============================================================================

import React, { useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import { IconButton } from './IconButton';
import { spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles } from '../design/theme';

export function ScreenShell({
  title,
  subtitle,
  onBack,
  right,
  scroll = true,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** `false` para pantallas que manejan su propio scroll (listas largas). */
  scroll?: boolean;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!onBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  return (
    <Animated.View entering={SlideInRight.duration(180)} exiting={SlideOutRight.duration(140)} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        {onBack ? <IconButton icon="arrow-left" label="Volver" size={40} raised={false} variant="plain" onPress={onBack} /> : null}
        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.fill}>{children}</View>
      )}
    </Animated.View>
  );
}

const useStyles = themedStyles((colors) => ({
  // Por encima del cromo del levantamiento: en Android el orden de dibujo lo
  // decide la elevación, y la barra superior del editor tapaba la cabecera.
  root: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, zIndex: 100, elevation: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  titles: { flex: 1, paddingHorizontal: spacing.xs },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.caption, color: colors.textSecondary },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  fill: { flex: 1 },
}));
