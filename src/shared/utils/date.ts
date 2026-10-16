/** @format */
import { format } from "date-fns";

export function toDateString(date: Date): string {
 return format(date, "yyyy-MM-dd");
}

export function toTimeString(date: Date): string {
 return format(date, "HH:mm");
}

