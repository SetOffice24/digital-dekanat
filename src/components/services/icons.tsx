import { BedDouble, GraduationCap, Repeat, ShieldCheck, Thermometer, Wallet, type LucideIcon } from "lucide-react";

/** Иконки жизненных ситуаций (вместо эмодзи — в стиле интерфейса). */
export const situationIcon: Record<string, LucideIcon> = { sick: Thermometer, army: ShieldCheck, dorm: BedDouble, money: Wallet, transfer: Repeat, freshman: GraduationCap };
