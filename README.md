# FlexTile

Mosaico automático para **KDE Plasma 6** que se activa y se desactiva con una tecla, como en COSMIC (Pop!_OS). Usa los atajos habituales de Hyprland, i3 y COSMIC, y sigue dejando hacer lo que Hyprland no deja hacer bien: **minimizar ventanas**.

- **`Meta+Y` activa o desactiva el mosaico** en el escritorio y la pantalla actuales. Con el mosaico apagado, Plasma funciona como siempre.
- **Minimizar funciona:** la ventana minimizada sale del mosaico, las demás ocupan su hueco y, al restaurarla desde la barra de tareas, vuelve a entrar.
- **Ventanas flotantes:** con `Meta+G` sacas una ventana concreta del mosaico. Los diálogos y las ventanas de tamaño fijo flotan solas.
- **Ratón:** si arrastras una ventana encima de otra, se intercambian. Si arrastras un borde, cambia el reparto del espacio.
- **Lanzador estilo Spotlight:** `Meta+Espacio` abre KRunner centrado en la pantalla. Abre aplicaciones, busca archivos y hace cálculos (escribe `2*3+5` o `sqrt(16)`).

## Instalar

```sh
git clone git@github.com:zebus3d/flextile.git
cd flextile
./install.sh
```

Si no quieres que toque KRunner, usa `./install.sh --no-launcher`.

Plasma ya usa algunas de estas teclas: `Meta+flechas` para el mosaico rápido, `Meta+1…9` para las entradas de la barra de tareas y `Meta+G` para la vista de cuadrícula. El instalador quita **solo esa tecla** de la acción que la tenía (por ejemplo, "Cerrar ventana" conserva `Alt+F4`) y guarda una copia de seguridad en `~/.local/share/flextile/backup.json`.

Para actualizar, ejecuta `git pull` y después `./install.sh` otra vez.

## Desinstalar

```sh
./uninstall.sh
```

Quita el script y te devuelve exactamente los atajos que tenías antes.

## Atajos

| Atajo | Qué hace |
|---|---|
| `Meta+Y` | Activar o desactivar el mosaico en este escritorio |
| `Meta+G` | Hacer flotante la ventana activa o devolverla al mosaico |
| `Meta+←↑→↓` | Mover el foco a la ventana de ese lado |
| `Meta+Shift+←↑→↓` | Con mosaico: intercambiar la ventana con la de ese lado o pasarla a la otra pantalla. Sin mosaico: pegarla a esa mitad de la pantalla, como en Plasma |
| `Meta+O` | Cambiar la división de horizontal a vertical o al revés |
| `Meta+M` | Maximizar o restaurar |
| `Meta+H` | Minimizar |
| `Meta+Q` | Cerrar la ventana |
| `Meta+1…9` | Ir al escritorio N (lo crea si no existe) |
| `Meta+Shift+1…9` | Mandar la ventana al escritorio N |
| `Meta+Espacio` | KRunner: lanzar aplicaciones, buscar y calcular |

Todos se pueden cambiar en *Preferencias del sistema → Atajos de teclado → KWin* (busca "FlexTile").

## Ajustes

En *Preferencias del sistema → Gestión de ventanas → Scripts de KWin → FlexTile → ⚙* puedes cambiar:

- si el mosaico arranca activado en todos los escritorios,
- el hueco entre ventanas y el hueco con los bordes de la pantalla,
- si `Meta+1…9` crea el escritorio cuando no existe,
- qué clases de ventana flotan siempre.

## Cómo funciona

Es un script de KWin en JavaScript (`package/contents/code/main.js`). Cada pareja de escritorio y pantalla tiene su propio árbol de divisiones binarias. Cada ventana nueva parte en dos la ventana activa, por su lado más largo. `tools/setup.py` instala el paquete con `kpackagetool6` y reparte los atajos a través de KGlobalAccel (por D-Bus, con `gdbus`).

Requisitos: Plasma 6 y `python3`. Probado en Plasma 6.8 (Wayland).

## Licencia

GPL-3.0-or-later
