// Mock: react-native (for Node test environment)

export const Platform = {
  OS: 'android',
  Version: 33,
  select: (obj: any) => obj.android ?? obj.default,
};

export const StyleSheet = {
  create: (styles: any) => styles,
};

export const View = 'View';
export const Text = 'Text';
export const TouchableOpacity = 'TouchableOpacity';
export const Image = 'Image';
export const FlatList = 'FlatList';
export const SafeAreaView = 'SafeAreaView';
export const StatusBar = 'StatusBar';
export const Alert = {
  alert: jest.fn(),
};
export const Dimensions = {
  get: () => ({ width: 360, height: 640 }),
};
export const ActivityIndicator = 'ActivityIndicator';
export const RefreshControl = 'RefreshControl';
export const TextInput = 'TextInput';
export const ScrollView = 'ScrollView';
export const Modal = 'Modal';
export const Pressable = 'Pressable';
export const SectionList = 'SectionList';

/**
 * PanResponder gestiona los gestos multitáctiles del canvas (paneo, pinch y
 * arrastre de handles). El mock devuelve los props que `create()` produciría
 * para que un componente que lo use se pueda construir en Node; la lógica de
 * gestos de verdad vive en EditorController, que se prueba sin React.
 */
export const PanResponder = {
  create: (config: any) => ({ panHandlers: {}, __config: config }),
};

export const PermissionsAndroid = {
  PERMISSIONS: {
    BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
    BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
  },
  check: jest.fn().mockResolvedValue(true),
  request: jest.fn().mockResolvedValue('granted'),
  requestMultiple: jest.fn().mockResolvedValue({
    'android.permission.BLUETOOTH_SCAN': 'granted',
    'android.permission.BLUETOOTH_CONNECT': 'granted',
  }),
};
