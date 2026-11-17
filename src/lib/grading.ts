/**
 * Единые правила прогноза оценки по набранным баллам — одинаковые у студента, преподавателя и деканата.
 * Доля от возможного на сегодня: 60 % — «3» (или зачёт), 75 % — «4», 90 % — «5».
 */
export type Forecast = "5" | "4" | "3" | "2" | "зачёт" | "незачёт";

export const PASS = 0.6;
export const GOOD = 0.75;
export const EXCELLENT = 0.9;

export function forecast(ratio: number, credit: boolean): Forecast {
  if (credit) return ratio >= PASS ? "зачёт" : "незачёт";
  return ratio >= EXCELLENT ? "5" : ratio >= GOOD ? "4" : ratio >= PASS ? "3" : "2";
}

export const forecastLabel = (f: Forecast) => (f === "зачёт" || f === "незачёт" ? f : `на ${f}`);
export const isBelow = (f: Forecast) => f === "2" || f === "незачёт";
