import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { BrowserContext, WebSocketRoute } from "@playwright/test";

export const actors = {
  admin: "11111111-1111-4111-8111-111111111111",
  coordinator: "22222222-2222-4222-8222-222222222222",
  volunteer: "33333333-3333-4333-8333-333333333333"
};
export const people = {
  ana: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  beto: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  clara: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
};
export async function backend(empty = false) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.identities(user_id uuid references auth.users, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202611030001_workspace.sql", import.meta.url), "utf8"));
  for (const [role, id] of Object.entries(actors)) {
    await db.query("insert into auth.users values($1)", [id]);
    await db.query("insert into auth.identities values($1,'google',$2)", [id, JSON.stringify({ email: `${role}@example.test`, email_verified: true })]);
    await db.query("insert into public.access_grants(email,role,area_ids) values($1,$2,$3)", [`${role}@example.test`, role, role === "coordinator" ? ["kinder"] : []]);
  }
  if (!empty) {
    await db.query("insert into public.volunteers(id,name,area_ids) values($1,'Ana Ejemplo',array['babies','kinder']),($2,'Beto Ejemplo',array['babies']),($3,'Clara Ejemplo',array['kinder'])", Object.values(people));
    await db.query("update public.access_grants set volunteer_id=$1 where role='volunteer'", [people.ana]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actors.admin]);
    await db.exec("select public.enter_workspace(); select public.generate_schedule('2099-01-04','2099-01-04')");
    await db.query("select public.write_assignment((select a.id from public.assignments a join public.positions p on p.id=a.position_id join public.occurrences o on o.id=a.occurrence_id where a.area_id='babies' and p.name='Maestro/a' order by o.start_time limit 1),$1,'',1)", [people.ana]);
  }
  const sockets = new Set<{ socket: WebSocketRoute; topic: string; joinRef: string | null; array: boolean }>();
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();
  async function attach(context: BrowserContext, actor: keyof typeof actors = "admin", signedIn = true) {
    const user = { id: actors[actor], email: `${actor}@example.test`, app_metadata: { provider: "google", providers: ["google"] }, user_metadata: {}, aud: "authenticated", created_at: "2026-01-01T00:00:00Z" };
    const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
    if (signedIn) await context.addInitScript(({ token, user }) => {
      if (!sessionStorage.getItem("test-session-seeded")) {
        localStorage.setItem("sb-area-test-auth-token", JSON.stringify({ access_token: token, refresh_token: "test-refresh", token_type: "bearer", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user }));
        sessionStorage.setItem("test-session-seeded", "true");
      }
    }, { token, user });
    await context.routeWebSocket(/wss:\/\/area-test\.supabase\.co\/.*/, (socket) => {
      let joined: { socket: WebSocketRoute; topic: string; joinRef: string | null; array: boolean } | null = null;
      socket.onMessage((raw) => {
        const parsed = JSON.parse(String(raw));
        const array = Array.isArray(parsed);
        const [joinRef, ref, topic, event, payload] = array ? parsed : [parsed.join_ref, parsed.ref, parsed.topic, parsed.event, parsed.payload];
        const send = (event: string, data: unknown) => socket.send(JSON.stringify(array ? [joinRef, ref, topic, event, data] : { join_ref: joinRef, ref, topic, event, payload: data }));
        if (event === "phx_join") {
          joined = { socket, topic, joinRef, array };
          sockets.add(joined);
          send("phx_reply", { status: "ok", response: { postgres_changes: [{ id: 1, event: "UPDATE", schema: "public", table: "workspace_version" }] } });
        } else if (event === "heartbeat") send("phx_reply", { status: "ok", response: {} });
        void payload;
      });
      socket.onClose(() => { if (joined) sockets.delete(joined); });
    });
    await context.route("https://area-test.supabase.co/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === "OPTIONS") {
        await route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
        return;
      }
      if (!url.pathname.includes("/rest/v1/rpc/")) {
        if (url.pathname.endsWith("/authorize")) await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>Google OAuth solicitado (prueba local)</h1>" });
        else await route.fulfill({ status: 200, json: user });
        return;
      }
      const run = async () => {
        if (closed) { await route.abort(); return; }
        const name = url.pathname.split("/").at(-1)!;
        const args: Record<string, unknown> = request.postDataJSON() ?? {};
        if (!/^[a-z_]+$/.test(name) || Object.keys(args).some((key) => !/^p_[a-z_]+$/.test(key))) throw new Error("RPC de prueba inválido");
        try {
          await db.exec("begin; set local role authenticated");
          await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user.id]);
          const entries = Object.entries(args);
          const result = await db.query<{ value: unknown }>(`select public.${name}(${entries.map(([key], i) => `${key} => $${i + 1}`).join(",")}) as value`, entries.map(([key, value]) => key === "p_payload" ? JSON.stringify(value) : value));
          await db.exec("commit");
          await route.fulfill({ status: 200, json: result.rows[0].value ?? null });
          if (!["enter_workspace", "read_workspace", "get_revision"].includes(name)) {
            const revision = (await db.query<{ revision: number }>("select revision from public.workspace_version")).rows[0].revision;
            for (const connection of sockets) {
              const payload = { ids: [1], data: { schema: "public", table: "workspace_version", type: "UPDATE", commit_timestamp: new Date().toISOString(), columns: [], record: { id: true, revision }, old_record: { id: true } } };
              connection.socket.send(JSON.stringify(connection.array
                ? [connection.joinRef, null, connection.topic, "postgres_changes", payload]
                : { topic: connection.topic, event: "postgres_changes", ref: null, join_ref: connection.joinRef, payload }));
            }
          }
        } catch (error) {
          await db.exec("rollback");
          const details = error as { message: string; code?: string };
          await route.fulfill({ status: details.code === "42501" ? 403 : 400, json: { message: details.message, code: details.code ?? "XX000", details: null, hint: null } });
        }
      };
      queue = queue.then(run);
      await queue;
    });
  }
  return { db, attach, close: async () => {
    closed = true;
    for (const connection of sockets) connection.socket.close();
    await queue;
    await db.close();
  } };
}
