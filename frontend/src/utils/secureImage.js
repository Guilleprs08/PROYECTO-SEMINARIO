import axios from "axios";

export const API_BASE =
  import.meta?.env?.VITE_API_BASE ||
  import.meta?.env?.VITE_API_BASE_URL ||
  import.meta?.env?.VITE_API_URL ||
  "http://localhost:3001";

const authHeaders = () => {
  const t = localStorage.getItem("mf_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

export const isDirectUrl = (s) =>
  typeof s === "string" &&
  s.trim() !== "" &&
  (/^https?:\/\//i.test(s) || s.startsWith("/") || s.startsWith("data:"));

export const toAbs = (u) => {
  if (!u || typeof u !== "string") return u;
  if (/^https?:\/\//i.test(u) || u.startsWith("data:")) return u;
  if (u.startsWith("/")) return `${API_BASE}${u}`;
  return u;
};

export async function fetchObjectUrlWithAuth(urls) {
  for (const u of urls) {
    try {
      if (typeof u === "string" && u.startsWith("data:")) return u;
      const res = await axios.get(u, {
        responseType: "blob",
        headers: { ...authHeaders() },
      });
      return URL.createObjectURL(res.data);
    } catch {
      /* probar siguiente */
    }
  }
  return null;
}

import React, { useEffect, useState } from "react";
export function SecureImage({ candidates = [], alt = "", className = "", style = {} }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let revoke = null;
    (async () => {
      const url = await fetchObjectUrlWithAuth(candidates);
      setSrc(url);
      revoke = url;
    })();
    return () => {
      if (revoke && typeof revoke === "string" && revoke.startsWith("blob:")) {
        URL.revokeObjectURL(revoke);
      }
    };
  }, [JSON.stringify(candidates)]);
  if (!src) return <div style={{ width: "100%", height: "100%", opacity: 0.25 }} />;
  return <img src={src} alt={alt} className={className} style={style} />;
}
