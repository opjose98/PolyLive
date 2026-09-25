import 'package:flutter/material.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/overlays/settings/settings_content.dart';

void showProjectSettings(BuildContext context) {
  // Verificamos si es pantalla chica (mobile)
  final isMobile = MediaQuery.of(context).size.width < 600;

  if (isMobile) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => const _SettingsBottomSheet(),
    );
  } else {
    // Para desktop, montaremos un Dialog/Panel lateral o lo integramos en un Drawer.
    // La forma más fácil de hacer un panel flotante desde un shortcut o toolbar
    // es usar un Dialog alineado a la derecha, o showGeneralDialog.
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Cerrar Settings',
      barrierColor: Colors.black.withValues(alpha: 0.2),
      transitionDuration: const Duration(milliseconds: 300),
      pageBuilder: (context, animation, secondaryAnimation) {
        return const Align(
          alignment: Alignment.centerRight,
          child: _SettingsDesktopPanel(),
        );
      },
      transitionBuilder: (context, animation, secondaryAnimation, child) {
        return SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(1, 0),
            end: Offset.zero,
          ).animate(CurvedAnimation(
            parent: animation,
            curve: Curves.easeOutCubic,
          )),
          child: child,
        );
      },
    );
  }
}

class _SettingsBottomSheet extends StatelessWidget {
  const _SettingsBottomSheet();

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.8,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Container(
          key: const Key('settings_bottom_sheet'),
          decoration: const BoxDecoration(
            color: LevonColors.surface,
            borderRadius:
                BorderRadius.vertical(top: Radius.circular(LevonRadius.lg)),
          ),
          child: Column(
            children: [
              // Handle (pildorita)
              Container(
                key: const Key('settings_sheet_handle'),
                margin: const EdgeInsets.symmetric(vertical: 12),
                height: 4,
                width: 40,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Padding(
                padding: EdgeInsets.only(bottom: 16),
                child: Text(
                  'Configuración del Proyecto',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      color: LevonColors.navy),
                ),
              ),
              const Expanded(
                child: SettingsContent(
                  key: Key('settings_content_mobile'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SettingsDesktopPanel extends StatelessWidget {
  const _SettingsDesktopPanel();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: Container(
        key: const Key('settings_desktop_panel'),
        width: 380,
        height: double.infinity,
        decoration: BoxDecoration(
          color: LevonColors.surface,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.1),
              blurRadius: 20,
              offset: const Offset(-5, 0),
            )
          ],
        ),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: LevonColors.divider)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.settings_outlined, color: LevonColors.navy),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Text(
                      'Configuración',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: LevonColors.navy),
                    ),
                  ),
                  IconButton(
                    key: const Key('btn_cerrar_settings'),
                    icon: const Icon(Icons.close),
                    tooltip: 'Cerrar configuración',
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            const Expanded(
              child: SettingsContent(
                key: Key('settings_content_desktop'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
