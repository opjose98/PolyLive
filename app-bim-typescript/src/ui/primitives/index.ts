// =============================================================================
// primitives — Piezas básicas de la interfaz (botones, hojas, diálogos…)
// =============================================================================
//
// Todas toman los colores del modo y del tema (ver design/theme.ts). Las
// pantallas importan desde aquí, nunca de los archivos sueltos.
// =============================================================================

export { Icon } from './Icon';
export { Tappable } from './Tappable';
export { toast, ToastHost } from './Toast';
export { TagToggle } from './TagToggle';
export { Accordion } from './Accordion';
export { SideDrawer } from './SideDrawer';
export { FloatWindow } from './FloatWindow';
export { BottomSheet } from './BottomSheet';
export { IconButton } from './IconButton';
export { ActionButton, Chip, Card } from './Button';
export { alertDialog, confirm, DialogHost } from './Dialog';
export { ScreenShell } from './ScreenShell';
export { CommitTextInput } from './CommitTextInput';
