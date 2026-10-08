// =============================================================================
// Accordion — Sección plegable de los cajones (drawer ⋮, ajustes)
// =============================================================================
//
// Título con ícono y chevron que gira; el contenido entra con un fundido. Las
// secciones del drawer contextual (Topografía, Datos del archivo, Tema…) son
// acordeones para que el cajón quepa en una pantalla de teléfono.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { spacing } from '../design/tokens';
import { type } from '../design/typography';
import { spring } from '../design/motion';
import { Tappable } from './Tappable';
import { Icon } from './Icon';
import { themedStyles, useTheme } from '../design/theme';

interface AccordionProps {
  title: string;
  icon?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Accordion({ title, icon, defaultOpen = false, children }: AccordionProps) {
  const styles = useStyles();
  const colors = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const rot = useSharedValue(defaultOpen ? 1 : 0);
  useEffect(() => {
    rot.value = withSpring(open ? 1 : 0, spring.snappy);
  }, [open, rot]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value * 180}deg` }] }));

  return (
    <Animated.View layout={LinearTransition.springify().damping(24)} style={styles.section}>
      <Tappable
        onPress={() => setOpen((o) => !o)}
        haptic="select"
        pressScale={1}
        style={styles.header}
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
      >
        {icon && <Icon name={icon} size={18} color={colors.textSecondary} />}
        <Text style={styles.title}>{title}</Text>
        <Animated.View style={chevron}>
          <Icon name="chevron-down" size={20} color={colors.textSecondary} />
        </Animated.View>
      </Tappable>
      {open && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
          <View style={styles.body}>{children}</View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const useStyles = themedStyles((colors) => ({
  section: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg },
  title: { ...type.bodyStrong, color: colors.text, flex: 1 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
}));
