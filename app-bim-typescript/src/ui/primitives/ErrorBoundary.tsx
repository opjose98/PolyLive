// =============================================================================
// ErrorBoundary.tsx — Un error de pantalla no deja la app en blanco
// =============================================================================
//
// Si una pantalla falla al dibujarse, en vez de cerrarse la app muestra qué
// pasó, lo registra en el diagnóstico y ofrece reintentar o enviar el
// diagnóstico. Los datos ya están guardados (cada acción se escribe al momento).
// =============================================================================

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { record } from '../../shared/diagnostics';

interface Props {
  children: React.ReactNode;
  onShareDiagnostics?: () => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    record('error', 'render', `Error al dibujar la pantalla${info.componentStack ? `: ${info.componentStack.split('\n')[1]?.trim() ?? ''}` : ''}`, error);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: '#FFFFFF' }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>Algo falló en esta pantalla</Text>
        <Text style={{ fontSize: 14, color: '#444' }}>
          Tu trabajo está guardado: cada cambio se escribe al momento. Reintenta; si se repite, envía el diagnóstico.
        </Text>
        <Text style={{ fontSize: 12, color: '#888' }}>{this.state.error.message}</Text>
        <TouchableOpacity onPress={() => this.setState({ error: null })} style={{ backgroundColor: '#E07A00', padding: 12, borderRadius: 8 }}>
          <Text style={{ color: '#FFFFFF', textAlign: 'center', fontSize: 16 }}>Reintentar</Text>
        </TouchableOpacity>
        {this.props.onShareDiagnostics ? (
          <TouchableOpacity onPress={this.props.onShareDiagnostics} style={{ borderWidth: 1, borderColor: '#E07A00', padding: 12, borderRadius: 8 }}>
            <Text style={{ color: '#E07A00', textAlign: 'center', fontSize: 16 }}>Enviar diagnóstico</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
}
