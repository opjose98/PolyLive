/// Generador de códigos BIM ligeros para proyectos y espacios.
///
/// Formato: `{prefix}{number:03}` → BIM001, ARC042, SPC007
///
/// Reglas:
/// - Código corto, legible, compatible con nomenclatura IFC/BIM.
/// - Único dentro del contexto dado (lista de códigos existentes).
/// - No depende de UI ni Flutter — puro Dart.
class BimCodeGenerator {
  // Prefijos estándar LevON
  static const String prefixProject = 'BIM';
  static const String prefixSpace = 'SPC';

  /// Genera un código de proyecto único dado un conjunto de códigos existentes.
  ///
  /// Itera desde 001 hasta 999 y retorna el primer código no presente.
  /// Si todos están ocupados (improbable), genera uno con timestamp.
  static String generateProjectCode(Set<String> existingCodes) {
    return _generate(prefixProject, existingCodes);
  }

  /// Genera un código de espacio único dentro de un proyecto.
  static String generateSpaceCode(Set<String> existingCodes) {
    return _generate(prefixSpace, existingCodes);
  }

  static String _generate(String prefix, Set<String> existingCodes) {
    for (int i = 1; i <= 999; i++) {
      final code = '$prefix${i.toString().padLeft(3, '0')}';
      if (!existingCodes.contains(code)) return code;
    }
    // Fallback extremo: timestamp truncado (nunca debería ocurrir)
    final ts = DateTime.now().millisecondsSinceEpoch % 100000;
    return '$prefix$ts';
  }

  /// Valida que un código BIM tenga el formato correcto.
  ///
  /// Acepta: 2-5 letras mayúsculas seguidas de 1-6 dígitos.
  /// Ejemplos válidos: BIM001, ARC042, SPC1, LEV99.
  static bool isValidCode(String code) {
    return RegExp(r'^[A-Z]{2,5}[0-9]{1,6}$').hasMatch(code);
  }

  /// Normaliza un código ingresado por el usuario (uppercase, sin espacios).
  static String normalize(String raw) {
    return raw.trim().toUpperCase().replaceAll(RegExp(r'\s+'), '');
  }
}
