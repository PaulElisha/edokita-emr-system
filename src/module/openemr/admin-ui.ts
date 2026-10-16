/** @format */
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

export async function createOpenEMRLogin(params: {
 username: string;
 password: string;
 firstName: string;
 lastName: string;
 email: string;
 npi?: string;
 specialty?: string;
 group?: "Physicians" | "Administrators";
}): Promise<Result<void>> {
 try {
  let cookie: string | null = null;

  // 1) Login as admin
  const loginRes = await fetch(
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
  cookie = extractCookie(loginRes.headers.get("set-cookie"));
  // follow redirect if any
  if (loginRes.status === 302 && cookie) {
   const loc = loginRes.headers.get("location");
   if (loc) {
    await fetch(loc.startsWith("http") ? loc : `${BASE}${loc}`, {
     method: "GET",
     headers: { Cookie: cookie },
     redirect: "follow",
    });
   }
  }

  // 2) Get add user form for CSRF
  const addRes = await fetch(
   `${BASE}/interface/usergroup/usergroup_admin_add.php`,
   {
    method: "GET",
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "follow",
   },
  );
  const addHtml = await addRes.text();
  const csrf = extractCsrf(addHtml);
  if (!csrf) {
   return [null, APIError.internalServer("Failed to get OpenEMR CSRF token")];
  }

  // 3) Submit new user
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
     ...(cookie ? { Cookie: cookie } : {}),
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
