/** @format */

export interface APIResponse<T> {
 status: "ok";
 message?: string;
 data?: T | null;
}

export type Result<T, U = Error> = [T | null, null | U];

export interface ListResult<T> {
 total: number;
 items: T[];
}
