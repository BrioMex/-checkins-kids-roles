import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { snapshotSchema, type Snapshot } from "./schema";
export { configuration } from "./config";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };
type Rpc<Args, Returns = undefined> = { Args: Args; Returns: Returns };
type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      enter_workspace: Rpc<Record<string, never>, string>;
      read_workspace: Rpc<Record<string, never>, Json>;
      get_revision: Rpc<Record<string, never>, number>;
      write_assignment: Rpc<{ p_id: string; p_volunteer_id: string | null; p_note: string; p_version: number }>;
      save_volunteer: Rpc<{ p_id: string | null; p_name: string; p_areas: string[]; p_active: boolean; p_note: string; p_version: number }, string>;
      save_service: Rpc<{ p_id: string | null; p_name: string; p_day: number; p_time: string; p_active: boolean; p_version: number }, string>;
      save_position: Rpc<{ p_id: string | null; p_area: string; p_name: string; p_active: boolean; p_version: number }, string>;
      save_grant: Rpc<{ p_id: string | null; p_email: string; p_role: string; p_areas: string[]; p_volunteer_id: string | null; p_active: boolean; p_version: number }, string>;
      save_settings: Rpc<{ p_name: string; p_timezone: string; p_version: number }>;
      generate_schedule: Rpc<{ p_start: string; p_end: string }, number>;
      import_workbook: Rpc<{ p_payload: Json }, number>;
    };
  };
};
export class ApiError extends Error {
  constructor(message: string, public code = "") { super(message); }
}
export class WorkspaceApi {
  readonly client: SupabaseClient<Database>;
  constructor(config: { url: string; key: string }) {
    this.client = createClient<Database>(config.url, config.key, {
      auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
    });
  }
  async rpc<N extends keyof Database["public"]["Functions"]>(name: N, args: Database["public"]["Functions"][N]["Args"]) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) {
      const message = error.code === "23505" ? "Hay un dato duplicado: revisa los puestos, horarios y voluntarios del servicio." :
        error.code === "40001" ? "Otra persona cambió este registro. Cierra el formulario, actualiza y vuelve a intentarlo." : error.message;
      throw new ApiError(message, error.code);
    }
    return data;
  }
  async load(): Promise<Snapshot> {
    return snapshotSchema.parse(await this.rpc("read_workspace", {}));
  }
  async login() {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href, queryParams: { prompt: "select_account" } }
    });
    if (error) throw new ApiError(error.message);
  }
  async logout() {
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw new ApiError(error.message);
  }
}
