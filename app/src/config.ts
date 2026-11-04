type PublicEnvironment = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
};

export function configuration(env: PublicEnvironment = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
}): { url: string; key: string } | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key || url.includes("TU-PROYECTO") || key.includes("TU-CLAVE")) {
    throw new Error("Completa VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local.");
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co") || parsed.pathname !== "/") {
    throw new Error("Usa la URL HTTPS de tu proyecto Supabase (https://…supabase.co).");
  }
  if (key.startsWith("sb_secret_")) throw new Error("Nunca uses una clave secreta en el navegador. Usa la clave publicable.");
  if (!key.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role !== "anon") throw new Error("role");
    } catch {
      throw new Error("La clave debe ser publicable (sb_publishable_…) o la clave anon heredada, nunca service_role.");
    }
  }
  return { url: parsed.origin, key };
}
