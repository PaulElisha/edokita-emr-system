import { OpenEMR } from "@/env.ts";
import APIError from "@error/APIError.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

const BASE = OpenEMR.url.replace(/\/$/, "");

function extractCookie(setCookie: string | null): string | null {
 if (!setCookie) return null;
 const m = setCookie.match(/OpenEMR=[^;]+/);
 return m ? m[0] : null;
}

function extractCsrf(html: string): string | null {
 const m = html.match(/csrf_token_form['"]\s*value\s*=\s*['"]([^'"]+)['"]/i);
 if (m) return m[1];
 const m2 = html.match(
  /name=['"]csrf_token_form['"][^>]*value=['"]([^'"]+)['"]/i,
 );
 return m2 ? m2[1] : null;
}

async function loginAsAdmin(): Promise<Result<string>> {
 const res = await fetch(
  `${BASE}/interface/main/main_screen.php?auth=login&site=default`,
  {
   method: "POST",
   redirect: "manual",
   headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Referer: `${BASE}/interface/login/login.php`,
   },
   body: new URLSearchParams({
    new_login_session_management: "1",
    languageChoice: "1",
    authUser: OpenEMR.username,
    clearPass: OpenEMR.password,
    go: "Go",
   }).toString(),
  },
 );
 const cookie = extractCookie(res.headers.get("set-cookie"));
 if (res.status === 302 && cookie) {
  const loc = res.headers.get("location");
  if (loc) {
   await fetch(loc.startsWith("http") ? loc : `${BASE}${loc}`, {
    method: "GET",
    headers: { Cookie: cookie },
    redirect: "follow",
   });
  }
 }
 if (!cookie) {
  return [
   null,
   APIError.internalServer("Failed to open OpenEMR admin session"),
  ];
 }
 return [cookie, null];
}

async function fetchCsrf(cookie: string): Promise<Result<string>> {
 const res = await fetch(
  `${BASE}/interface/usergroup/usergroup_admin_add.php`,
  {
   method: "GET",
   headers: { Cookie: cookie },
   redirect: "follow",
  },
 );
 const html = await res.text();
 const csrf = extractCsrf(html);
 if (!csrf) {
  return [null, APIError.internalServer("Failed to get OpenEMR CSRF token")];
 }
 return [csrf, null];
}

export async function createOpenEMRLogin(params: {
 username: string;
 password: string;
 firstName: string;
 lastName: string;
 email: string;
 npi?: string;
 specialty?: string;
 group?: "Physicians" | "Administrators" | "Clinicians";
}): Promise<Result<void>> {
 try {
  const [cookie, cErr] = await loginAsAdmin();
  if (cErr || !cookie) return [null, cErr];
  const [csrf, sErr] = await fetchCsrf(cookie);
  if (sErr || !csrf) return [null, sErr];

  const body = new URLSearchParams({
   csrf_token_form: csrf,
   mode: "new_user",
   rumple: params.username,
   fname: params.firstName,
   lname: params.lastName,
   email: params.email,
   npi: params.npi ?? "",
   specialty: params.specialty ?? "",
   stiltskin: params.password,
   newauthPass: params.password,
   adminPass: OpenEMR.password,
   groupname: "Default",
   "access_group[]": params.group ?? "Physicians",
   authorized: "1",
   calendar: "1",
   see_auth: "1",
   facility_id: "3",
   billing_facility_id: "3",
  });
  const createRes = await fetch(
   `${BASE}/interface/usergroup/usergroup_admin.php`,
   {
    method: "POST",
    headers: {
     Cookie: cookie,
     "Content-Type": "application/x-www-form-urlencoded",
     Referer: `${BASE}/interface/usergroup/usergroup_admin_add.php`,
    },
    body: body.toString(),
    redirect: "follow",
   },
  );
  if (!createRes.ok) {
   return [null, APIError.internalServer("Failed to create OpenEMR user")];
  }
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function setOpenEMRUserAccount(params: {
 id: number;
 newPassword: string;
 group?: string;
}): Promise<Result<void>> {
 try {
  const [cookie, cErr] = await loginAsAdmin();
  if (cErr || !cookie) return [null, cErr];
  const [csrf, sErr] = await fetchCsrf(cookie);
  if (sErr || !csrf) return [null, sErr];

  const body = new URLSearchParams({
   csrf_token_form: csrf,
   mode: "update",
   privatemode: "user_admin",
   id: String(params.id),
   adminPass: OpenEMR.password,
   clearPass: params.newPassword,
   "access_group[]": params.group ?? "Physicians",
   authorized: "1",
   active: "1",
   see_auth: "1",
  });
  const res = await fetch(`${BASE}/interface/usergroup/usergroup_admin.php`, {
   method: "POST",
   headers: {
    Cookie: cookie,
    "Content-Type": "application/x-www-form-urlencoded",
    Referer: `${BASE}/interface/usergroup/user_admin.php?id=${params.id}`,
   },
   body: body.toString(),
   redirect: "follow",
  });
  if (!res.ok) {
   return [null, APIError.internalServer("Failed to set OpenEMR user account")];
  }
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
