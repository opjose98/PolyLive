import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';
import { colors } from '../design/tokens';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface IconProps {
  /** Nombre de MaterialCommunityIcons. Los catálogos lo guardan como string; un test verifica que exista. */
  name: IconName | string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 20, color = colors.text, style }: IconProps) {
  return <MaterialCommunityIcons name={name as IconName} size={size} color={color} style={style} />;
}
