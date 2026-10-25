# FlexTile

Mosaico automático para **KDE Plasma 6** que se activa y se desactiva con una tecla, como en COSMIC (Pop!_OS). Usa los atajos habituales de Hyprland, i3 y COSMIC, y sigue dejando hacer lo que Hyprland no deja hacer bien: **minimizar ventanas**.

- **`Meta+F` activa o desactiva el mosaico** en el escritorio actual. Con el mosaico apagado, Plasma funciona como siempre.
- **Minimizar funciona:** la ventana minimizada sale del mosaico, las demás ocupan su hueco y, al restaurarla, vuelve a entrar.
- **Ventanas flotantes:** con `Meta+G` sacas una ventana concreta del mosaico.
- **Lanzador estilo Spotlight:** `Meta+Espacio` abre aplicaciones, busca archivos y hace cálculos.

> La tecla **Meta** es la tecla de Windows (⊞) o la de Super.

---

## Instalación

### Requisitos

- KDE Plasma 6 (probado en Plasma 6.8 con Wayland).
- `git` y `python3`, que ya vienen en casi todas las distribuciones.

### Pasos

1. Abre una terminal (Konsole) y descarga el proyecto:

   ```sh
   git clone git@github.com:zebus3d/flextile.git
   cd flextile
   ```

2. Ejecuta el instalador:

   ```sh
   ./install.sh
   ```

   Si no quieres que toque KRunner (el lanzador de `Meta+Espacio`), usa `./install.sh --no-launcher`.

3. Listo. No hace falta cerrar sesión ni reiniciar. El instalador va contando lo que hace, más o menos así:

   ```
   Installing the KWin script…
   Freeing the keys FlexTile uses…
     Meta+Left → released from "Situar la ventana en mosaico a la izquierda"
     …
   Starting FlexTile…
   Done. Meta+F turns tiling on and off on the current desktop.
   ```

Al instalar no se mueve ninguna ventana: el mosaico viene **apagado** en todos los escritorios hasta que pulses `Meta+F`.

### Qué cambia en tus atajos

Plasma ya usa algunas de estas teclas: `Meta+flechas` para el mosaico rápido, `Meta+1…9` para las entradas de la barra de tareas, `Meta+G` para la vista de cuadrícula… El instalador quita **solo esa tecla** de la acción que la tenía y deja las demás teclas de esa acción tal cual. Por ejemplo, "Cerrar ventana" pierde `Meta+Q` pero conserva `Alt+F4`.

Antes de cambiar nada, guarda tus atajos originales en `~/.local/share/flextile/backup.json`. Al desinstalar te los devuelve.

### Actualizar

```sh
cd flextile
git pull
./install.sh
```

### Desinstalar

```sh
cd flextile
./uninstall.sh
```

Quita el script y te devuelve exactamente los atajos que tenías antes de instalarlo.

---

## Cómo se usa

### Primeros pasos

Para probarlo sin desordenar el escritorio donde estás trabajando:

1. Pulsa **`Meta+2`** para ir al escritorio 2. Si no existe, se crea.
2. Abre allí dos o tres ventanas, por ejemplo Dolphin, Konsole y el navegador.
3. Pulsa **`Meta+F`**. Las ventanas se colocan solas en mosaico y verás el aviso *Tiling on*.
4. Abre otra ventana: parte en dos la ventana activa, por su lado más largo.
5. Pulsa **`Meta+H`** para minimizar la ventana activa. Las demás ocupan su hueco. Restáurala desde la barra de tareas y volverá a su sitio en el mosaico.
6. Muévete entre ventanas con **`Meta+flechas`** y cámbialas de sitio con **`Meta+Shift+flechas`**.
7. Pulsa **`Meta+F`** otra vez para apagar el mosaico. Cada ventana vuelve a la posición y el tamaño que tenía antes.
8. Pulsa **`Meta+1`** para volver a tu escritorio de siempre.

### El mosaico va por escritorio

Cada escritorio virtual, y en cada pantalla si tienes varias, tiene su propio interruptor. Puedes tener el escritorio 1 normal, con ventanas flotantes, y el 2 en mosaico. `Meta+F` solo afecta al escritorio y la pantalla en los que estás.

### Ventanas flotantes dentro del mosaico

- **`Meta+G`** saca la ventana activa del mosaico, que recupera su tamaño anterior. Si la pulsas otra vez, vuelve al mosaico.
- Los diálogos, las ventanas de tamaño fijo y algunas aplicaciones (KRunner, Spectacle, Steam…) flotan siempre. Puedes añadir otras en los [ajustes](#ajustes).

### Con el ratón

- **Arrastrar una ventana encima de otra** las intercambia.
- **Arrastrar el borde** de una ventana cambia cuánto espacio ocupa cada una.

### Maximizar, minimizar y pantalla completa

Funcionan como siempre. Una ventana maximizada o en pantalla completa conserva su hueco en el mosaico y lo recupera al restaurarla.

### Lanzador (Meta+Espacio)

Abre KRunner en el centro de la pantalla. Escribe:

- el nombre de una aplicación (`fire` → Firefox) y pulsa Intro para abrirla,
- una cuenta (`2*3+5`, `sqrt(16)`, `2^10`) para ver el resultado al momento,
- el nombre de un archivo o una carpeta para buscarlo.

---

## Atajos

| Atajo | Qué hace |
|---|---|
| `Meta+F` | Activar o desactivar el mosaico en este escritorio |
| `Meta+G` | Hacer flotante la ventana activa o devolverla al mosaico |
| `Meta+←↑→↓` | Mover el foco a la ventana de ese lado |
| `Meta+Shift+←↑→↓` | Con mosaico: intercambiar la ventana con la de ese lado, o pasarla a la otra pantalla si no hay ninguna. Sin mosaico: pegarla a esa mitad de la pantalla, como en Plasma |
| `Meta+O` | Cambiar la división de horizontal a vertical o al revés |
| `Meta+M` | Maximizar o restaurar |
| `Meta+H` | Minimizar |
| `Meta+Q` | Cerrar la ventana |
| `Meta+1…9` | Ir al escritorio N (lo crea si no existe) |
| `Meta+Shift+1…9` | Mandar la ventana al escritorio N |
| `Meta+Espacio` | Lanzador: aplicaciones, búsqueda y cálculos |

Todos se pueden cambiar en *Preferencias del sistema → Teclado → Atajos de teclado → KWin* (busca "FlexTile").

## Ajustes

En *Preferencias del sistema → Gestión de ventanas → Scripts de KWin*, pulsa el icono ⚙ de FlexTile. Ahí puedes cambiar:

- si el mosaico arranca activado en todos los escritorios,
- el hueco entre ventanas y el hueco con los bordes de la pantalla,
- si `Meta+1…9` crea el escritorio cuando no existe,
- qué ventanas flotan siempre (por clase de ventana, separadas por comas).

Para apagar FlexTile un rato sin desinstalarlo, desmarca su casilla en esa misma pantalla y pulsa *Aplicar*. Ten en cuenta que, mientras esté desmarcado, las teclas que usaba no harán nada. Para recuperar los atajos de Plasma de verdad, usa `./uninstall.sh`.

## Problemas

- **Un atajo no hace nada:** comprueba en *Atajos de teclado → KWin* que la acción "FlexTile: …" tiene su tecla. Si otra aplicación se la ha quitado, vuelve a ejecutar `./install.sh`.
- **Una aplicación se coloca mal en el mosaico:** hazla flotante con `Meta+G`, o añádela a "ventanas que flotan siempre" en los ajustes.
- **Quiero dejarlo todo como estaba:** ejecuta `./uninstall.sh`.

## Cómo funciona

Es un script de KWin en JavaScript (`package/contents/code/main.js`). Cada pareja de escritorio y pantalla tiene su propio árbol de divisiones binarias. `tools/setup.py` instala el paquete con `kpackagetool6` y reparte los atajos a través de KGlobalAccel por D-Bus.

## Licencia

GPL-3.0-or-later
