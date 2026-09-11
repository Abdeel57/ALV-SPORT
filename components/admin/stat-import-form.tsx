import { Field, SubmitButton, fileInputClass, inputClass } from "@/components/admin/ui";

/**
 * Carga de una tabla de estadísticas exportada por otro programa: archivo
 * (.txt o .html) o el contenido pegado. El servidor la interpreta y resume
 * qué se cargó.
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
      <Field label="Archivo (.txt o .html)" hint="Máximo 1 MB">
        <input type="file" name="document" accept=".txt,.htm,.html,text/plain,text/html" className={fileInputClass} />
      </Field>
      <Field label="O pega el contenido" hint="Una tabla del mismo tipo (bateo, pitcheo, defensa) reemplaza a la anterior.">
        <textarea
          name="pasted"
          rows={5}
          spellCheck={false}
          placeholder={"BLACK TEAM - Batting\nName  AB  R  H  RBI  2B  3B  HR  BB  SO  SB  BA  SLG  OBP\nApellido, Nombre  20  8  13  10  4  0  0  0  1  0  .650  .850  .691\nTotals  289  125  136  108  18  6  7  52  30  0  .471  .647  .545"}
          className={`${inputClass} min-h-32 py-2.5 font-mono text-xs`}
        />
      </Field>
      <SubmitButton className="self-start">Cargar tabla</SubmitButton>
    </form>
  );
}
