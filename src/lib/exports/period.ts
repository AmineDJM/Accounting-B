import { zonedParts } from "@/lib/engine/tz";

/**
 * Catches a fiscal year rendered on the wrong calendar.
 *
 * `end` is the last instant of the period. Read one hour later — because the
 * file is being written on a calendar east of the one that built the
 * boundaries — it lands on the first day of the following year, and the whole
 * audit file declares the wrong period. The check is cheap and the failure is
 * silent otherwise, so every writer runs it.
 */
export function checkPeriod(start: Date, end: Date, tz: string): string[] {
  const s = zonedParts(start, tz);
  const e = zonedParts(end, tz);
  const warnings: string[] = [];
  if (e.month === 1 && e.day === 1 && e.hour < 12) {
    warnings.push(
      `La clôture de l'exercice tombe le 01/01/${e.year} sur le calendrier ${tz}, ce qui trahit un décalage de fuseau : l'exercice a été créé sur un autre calendrier. Le fichier déclarerait une période erronée. Corrigez le fuseau du dossier avant de transmettre.`,
    );
  }
  if (e.year - s.year > 1) {
    warnings.push(`La période déclarée couvre ${s.year} à ${e.year} : un fichier d'audit porte sur un seul exercice.`);
  }
  return warnings;
}
