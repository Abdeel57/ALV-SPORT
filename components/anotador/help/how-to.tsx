"use client";

import { SidePanel } from "../ui/side-panel";

/**
 * "Cómo anotar": pasos básicos, atajos y leyenda de códigos. Se consulta sin
 * salir del partido y sin alterar su estado.
 */

const SHORTCUTS: [string, string][] = [
  ["B / S / F", "Bola, strike o foul al bateador en turno. El tercer strike con S se anota como ponche tirándole; para cantado usa O y luego C"],
  ["O", "Abre el catálogo de outs"],
  ["H", "Abre el catálogo de llegadas a base"],
  ["R", "Mueve corredores sin resultado del bateador (robo, wild pitch…)"],
  ["J", "Abre el catálogo completo de jugadas (outs y llegadas)"],
  ["G", "Pasa el foco a la libreta para recorrerla con las flechas"],
  ["U", "Deshacer la última jugada (pide confirmación)"],
  ["C", "Sustituciones y cambios defensivos"],
  ["I", "Historial de jugadas"],
  ["T", "Reporte, exportar y finalizar"],
  ["M", "Modo enfoque (oculta el panel de contexto)"],
  ["?", "Esta ayuda"],
  ["Enter / Esc", "Enter confirma el paso activo; Esc cancela y cierra el panel"],
  ["Flechas", "Recorrer la libreta cuando tiene el foco; Enter abre la celda"],
  ["Dígitos", "Dentro de un panel, arman la secuencia defensiva (6 3 = 6-3; 0 = posición 10)"],
];

const LEGEND: [string, string][] = [
  ["1B · 2B · 3B · HR", "Sencillo, doble, triple, jonrón (verde)"],
  ["BB · IBB · HBP · CI", "Base por bolas, intencional, golpeado, interferencia (azul)"],
  ["K · Kc · Kf", "Ponche tirándole, cantado, por foul"],
  ["6-3 · F8 · L6 · P4 · FF3", "Rodado con secuencia, elevado, línea, elevado al cuadro, foul atrapado (rojo)"],
  ["FC · E6", "Elección del fildeador, llegó por error del 6 (naranja)"],
  ["SF · SAC", "Elevado y toque de sacrificio"],
  ["DP · TP", "Doble y triple play"],
  ["Diamante relleno", "Anotó carrera"],
  ["✕ en una base", "Out en esa base"],
  ["① ② ③", "Número de out en la entrada"],
  ["◆", "Carrera impulsada"],
  ["● |", "Bolas y strikes de la aparición"],
  ["Diagonal roja", "Ahí terminó la media entrada"],
];

export function HowToPanel({ onClose }: { onClose: () => void }) {
  return (
    <SidePanel title="Cómo anotar" subtitle="Guía rápida y atajos" onClose={onClose} width="lg">
      <div className="flex flex-col gap-5 text-sm">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>
            <strong>Prepara:</strong> agrega a cada equipo en su orden al bate, asigna posición y marca EP a quien solo batea. Pulsa <em>Iniciar partido</em>.
          </li>
          <li>
            <strong>Lanzamientos:</strong> con <kbd>B</kbd>, <kbd>S</kbd> y <kbd>F</kbd> llevas la cuenta. La cuarta bola es base por bolas y el tercer strike es ponche automáticamente; el bateador cambia solo cuando termina su aparición.
          </li>
          <li>
            <strong>Out o llegada a base:</strong> <kbd>O</kbd> o <kbd>H</kbd>, elige el resultado (o teclea la secuencia, p. ej. 6 3) y sigue los pasos.
          </li>
          <li>
            <strong>Corredores:</strong> el sistema propone; tú confirmas. Los avances forzados vienen marcados y no se cambian. <kbd>Q</kbd> todos se quedan, <kbd>A</kbd> todos anotan.
          </li>
          <li>
            <strong>Resumen:</strong> revisa el texto (&ldquo;Sencillo de Ana; María anota desde segunda…&rdquo;), las impulsadas y si cada carrera es limpia. <kbd>Enter</kbd> confirma.
          </li>
          <li>
            <strong>Tercer out:</strong> al confirmar, cambia la media entrada, se limpian las bases y se reinicia la cuenta. No hay nada que cerrar a mano.
          </li>
          <li>
            <strong>Corregir:</strong> <kbd>U</kbd> deshace la última jugada; desde <em>Historial</em> o seleccionando una celda puedes anular cualquier jugada. Todo se recalcula y, si algo posterior queda incoherente, aparece un aviso por revisar.
          </li>
          <li>
            <strong>Cerrar:</strong> en <em>Reporte</em> revisa el box score, exporta a CSV o imprime, y finaliza cuando las reglas lo indiquen.
          </li>
        </ol>

        <section aria-labelledby="help-keys">
          <h3 id="help-keys" className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Atajos</h3>
          <table className="w-full text-xs">
            <tbody>
              {SHORTCUTS.map(([key, text]) => (
                <tr key={key} className="border-t sheet-line">
                  <th scope="row" className="w-32 py-1 pr-2 text-left font-mono font-semibold">{key}</th>
                  <td className="py-1">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs" style={{ color: "var(--sheet-muted)" }}>Los atajos no actúan mientras escribes en un campo y se pueden apagar en la barra de acciones.</p>
        </section>

        <section aria-labelledby="help-legend">
          <h3 id="help-legend" className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Leyenda de la libreta</h3>
          <table className="w-full text-xs">
            <tbody>
              {LEGEND.map(([key, text]) => (
                <tr key={key} className="border-t sheet-line">
                  <th scope="row" className="w-40 py-1 pr-2 text-left font-semibold">{key}</th>
                  <td className="py-1">{text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="help-rules">
          <h3 id="help-rules" className="mb-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--sheet-muted)" }}>Reglas de anotación que aplica el sistema</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs">
            <li>Un hit se conserva aunque después el bateador quede out al estirar o avance por error.</li>
            <li>No hay impulsada en doble play ni cuando la carrera se debe a un error; sí en elevado de sacrificio y base por bolas con bases llenas.</li>
            <li>La carrera se carga al pitcher que dejó llegar al corredor, aunque después haya cambio de pitcher.</li>
            <li>Efectividad = carreras limpias × entradas base / entradas lanzadas (6.1 = seis entradas y un out).</li>
            <li>Ganados, perdidos y salvamentos no se calculan solos: se deciden al revisar.</li>
          </ul>
        </section>
      </div>
    </SidePanel>
  );
}
