import type { SessionOptions } from "iron-session";

export interface AdminSessionData {
  email: string;
  loggedInAt: number;
}

export const adminSessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "persona-ai.admin.sid",
  ttl: 60 * 60 * 12,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};
