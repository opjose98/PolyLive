// Mock: @react-navigation/* (for Node test environment)

export const NavigationContainer = 'NavigationContainer';

export const createBottomTabNavigator = () => ({
  Navigator: 'Navigator',
  Screen: 'Screen',
});

export const useNavigation = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
});
