import { Field, SubmitButton, inputClass } from "@/components/admin/ui";

/**
 * Carga de una tabla de estadísticas exportada por otro programa. Acepta
 * archivo (.txt o .html) o el contenido pegado; el servidor lo interpreta
 * y muestra qué se cargó antes de que aparezca en la página del equipo.
 */
export function StatImportForm({
  teamId,
  action,
}: {
  teamId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <Field label="Archivo de estadísticas (.txt o .html)" hint="Exportado desde el otro programa. Máximo 1 MB.">
        <input
          type="file"
          name="document"
          accept=".txt,.htm,.html,text/plain,text/html"
          className={`${inputClass} py-2.5`}
        />
      </Field>
      <Field label="…o pega aquí el contenido de la tabla" hint="Sirve para copiar desde la pantalla del otro programa.">
        <textarea
          name="pasted"
          rows={6}
          spellCheck={false}
          placeholder={"BLACK TEAM - Batting\nName  AB  R  H  RBI  2B  3B  HR  BB  SO  SB  BA  SLG  OBP\nApellido, Nombre  20  8  13  10  4  0  0  0  1  0  .650  .850  .691\nTotals  289  125  136  108  18  6  7  52  30  0  .471  .647  .545"}
          className={`${inputClass} min-h-36 py-2.5 font-mono text-xs`}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Formato esperado: título, encabezado con las columnas (AB, R, H, RBI…), una fila por jugador
        como &ldquo;Apellido, Nombre&rdquo; y la fila de totales. Los nombres que coincidan con la plantilla se
        enlazan a su perfil. Si ya hay una tabla del mismo tipo (bateo, pitcheo, defensa), se reemplaza.
      </p>
      <div>
        <SubmitButton>Cargar estadísticas</SubmitButton>
      </div>
    </form>
  );
}
