/** @format */
import { format } from "date-fns";

export function toDateString(date: Date): string {
 return format(date, "yyyy-MM-dd");
}

export function toTimeString(date: Date): string {
 return format(date, "HH:mm");
}

/** OpenEMR's generic list service (medications/surgeries) requires `Y-m-d H:i:s`. */
export function toDateTimeString(date: Date): string {
 return format(date, "yyyy-MM-dd HH:mm:ss");
}

export function fromDateString(value: string): string {
 return `${value} 00:00:00`;
}

