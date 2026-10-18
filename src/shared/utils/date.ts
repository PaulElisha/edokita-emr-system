import { format } from "date-fns";

export function toDateString(date: Date): string {
 return format(date, "yyyy-MM-dd");
}

export function toTimeString(date: Date): string {
 return format(date, "HH:mm");
}

export function toDateTimeString(date: Date): string {
 return format(date, "yyyy-MM-dd HH:mm:ss");
}

export function fromDateString(value: string): string {
 return `${value} 00:00:00`;
}
