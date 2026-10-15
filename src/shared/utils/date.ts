/** @format */
import { format } from "date-fns";

export function toDateString(date: Date): string {
 return format(date, "yyyy-MM-dd");
}

export function toTimeString(date: Date): string {
 return format(date, "HH:mm");
}

// /**
//  * Hand-rolled date helpers, replaced by date-fns `format`.
//  */
// function pad(value: number): string {
//  return String(value).padStart(2, "0");
// }
//
// export function toDateString(date: Date): string {
//  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
// }
//
// export function toTimeString(date: Date): string {
//  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
// }
