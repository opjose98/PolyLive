import 'package:flutter/material.dart';

// ─── COLORS ──────────────────────────────────────────────────────────────────

class LevonColors {
  LevonColors._();

  // Brand
  static const Color navy = Color(0xFF002F6C);
  static const Color navyLight = Color(0xFF1A4A8A);
  static const Color yellow = Color(0xFFFFD000);
  static const Color yellowDark = Color(0xFFE6BB00);

  // Canvas
  static const Color canvasBg = Color(0xFFF2F4F7);
  static const Color grid = Color(0xFFBFC6D4);
  static const Color gridMajor = Color(0xFFA3ADC2);
  static const Color wallStroke = Color(0xFF1A1A2E);
  static const Color wallPreview = Color(0xFF0A84FF);
  static const Color snapNode = Color(0xFFFF9500);
  static const Color snapRing = Color(0x33FF9500);
  static const Color nodeColor = Color(0xFFFF6B9D); // wall endpoint nodes — pink for visibility
  static const Color selectStroke = Color(0xFF0A84FF);
  static const Color selectGlow = Color(0x330A84FF);
  static const Color roomFill = Color(0x1A002F6C);
  static const Color roomStroke = Color(0x66002F6C);

  // Feedback
  static const Color errorRed = Color(0xFFFF3B30);
  static const Color warnOrange = Color(0xFFFF9500);
  static const Color okGreen = Color(0xFF34C759);

  // Surface
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surface2 = Color(0xFFF8F9FB);
  static const Color divider = Color(0xFFE5E9F0);
  static const Color textPrimary = Color(0xFF0D1B2A);
  static const Color textSecondary = Color(0xFF6B7A99);
  static const Color textDisabled = Color(0xFFB0B8CC);
}

// ─── RADIUS ──────────────────────────────────────────────────────────────────

class LevonRadius {
  LevonRadius._();

  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 12.0;
  static const double lg = 16.0;
  static const double xl = 24.0;
  static const double pill = 100.0;
}

// ─── SHADOWS ─────────────────────────────────────────────────────────────────

class LevonShadow {
  LevonShadow._();

  static const List<BoxShadow> card = [
    BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, 2)),
  ];

  static const List<BoxShadow> float = [
    BoxShadow(color: Color(0x22000000), blurRadius: 20, offset: Offset(0, 8)),
  ];

  static const List<BoxShadow> panel = [
    BoxShadow(color: Color(0x18000000), blurRadius: 24, offset: Offset(-4, 0)),
  ];
}

// ─── DURATIONS ───────────────────────────────────────────────────────────────

class LevonDuration {
  LevonDuration._();

  static const Duration fast = Duration(milliseconds: 150);
  static const Duration normal = Duration(milliseconds: 250);
  static const Duration slow = Duration(milliseconds: 350);
}

// ─── THEME ───────────────────────────────────────────────────────────────────

class LevonTheme {
  LevonTheme._();

  static ThemeData get light {
    return ThemeData(
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: LevonColors.navy,
        onPrimary: Colors.white,
        secondary: LevonColors.yellow,
        onSecondary: LevonColors.navy,
        error: LevonColors.errorRed,
        onError: Colors.white,
        surface: LevonColors.surface,
        onSurface: LevonColors.textPrimary,
      ),
      useMaterial3: true,
      fontFamily: 'Inter',
      scaffoldBackgroundColor: LevonColors.surface2,
      appBarTheme: const AppBarTheme(
        backgroundColor: LevonColors.navy,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontFamily: 'Inter',
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: Colors.white,
        ),
      ),
      cardTheme: const CardThemeData(
        elevation: 0,
        color: LevonColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(LevonRadius.md)),
          side: BorderSide(color: LevonColors.divider),
        ),
        margin: EdgeInsets.zero,
      ),
      dividerTheme: const DividerThemeData(
        color: LevonColors.divider,
        thickness: 1,
        space: 1,
      ),
      iconTheme: const IconThemeData(
        color: LevonColors.textPrimary,
        size: 22,
      ),
      textTheme: const TextTheme(
        headlineMedium: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w700,
          color: LevonColors.textPrimary,
        ),
        titleLarge: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: LevonColors.textPrimary,
        ),
        titleMedium: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: LevonColors.textPrimary,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: LevonColors.textPrimary,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: LevonColors.textSecondary,
        ),
        labelSmall: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: LevonColors.textDisabled,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: LevonColors.navy,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(LevonRadius.sm)),
          ),
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: LevonColors.navy,
          side: const BorderSide(color: LevonColors.divider),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(LevonRadius.sm)),
          ),
          textStyle: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: LevonColors.surface2,
        contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(LevonRadius.sm)),
          borderSide: BorderSide(color: LevonColors.divider),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(LevonRadius.sm)),
          borderSide: BorderSide(color: LevonColors.divider),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(LevonRadius.sm)),
          borderSide: BorderSide(color: LevonColors.navy, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(LevonRadius.sm)),
          borderSide: BorderSide(color: LevonColors.errorRed),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: LevonColors.yellow,
        foregroundColor: LevonColors.navy,
        elevation: 4,
        shape: CircleBorder(),
      ),
      popupMenuTheme: const PopupMenuThemeData(
        color: LevonColors.surface,
        elevation: 8,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(LevonRadius.sm)),
        ),
        textStyle: TextStyle(
          fontSize: 14,
          color: LevonColors.textPrimary,
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: LevonColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(LevonRadius.lg),
          ),
        ),
        showDragHandle: true,
        dragHandleColor: LevonColors.divider,
        dragHandleSize: Size(36, 4),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: LevonColors.navy.withValues(alpha: 0.92),
          borderRadius: const BorderRadius.all(Radius.circular(LevonRadius.xs)),
        ),
        textStyle: const TextStyle(
          color: Colors.white,
          fontSize: 12,
        ),
        waitDuration: const Duration(milliseconds: 600),
      ),
    );
  }
}
