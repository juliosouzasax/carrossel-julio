// Tudo no fuso America/Sao_Paulo. Não usamos o fuso do servidor (a Vercel roda em UTC).
export const FUSO = "America/Sao_Paulo";

export type AgoraSP = {
  data: string; // AAAA-MM-DD
  hhmm: string; // HH:MM
  minutos: number; // minutos desde 00:00
  diaDaSemana: number; // 0 = domingo
  iso: string;
};

export function agoraSP(d: Date = new Date()): AgoraSP {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const hh = get("hour") === "24" ? "00" : get("hour");
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    data: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${hh}:${get("minute")}`,
    minutos: Number(hh) * 60 + Number(get("minute")),
    diaDaSemana: dias[get("weekday")] ?? 0,
    iso: d.toISOString(),
  };
}

export function minutosDe(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Horário inválido: "${hhmm}" (use HH:MM)`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`Horário inválido: "${hhmm}"`);
  return h * 60 + mi;
}

// Converte "AAAA-MM-DD" + "HH:MM" de São Paulo em instante UTC (SP está em UTC-3 sem horário de verão
// desde 2019; calculamos pelo Intl para não deixar a regra fixa no código).
export function instanteSP(data: string, hhmm: string): Date {
  const [a, m, d] = data.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const aprox = new Date(Date.UTC(a, m - 1, d, h, mi));
  // Descobre o deslocamento do fuso naquele instante.
  const sp = agoraSP(aprox);
  const diff = (Date.UTC(a, m - 1, d, h, mi) - Date.UTC(+sp.data.slice(0, 4), +sp.data.slice(5, 7) - 1, +sp.data.slice(8, 10), Math.floor(sp.minutos / 60), sp.minutos % 60));
  return new Date(aprox.getTime() + diff);
}

export function somaDias(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function dataBr(data: string): string {
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a}`;
}
