import type { IncomingMessage, ServerResponse } from "node:http";
import type { Control, ControlOf } from "@osc/schema";
import type { Bridge } from "./bridge";
import { ImageLibrary, validateImage } from "./images";
import { PromptStore, UNDO_WINDOW_MS } from "./prompts";

/**
 * HTTP API for controls that move more than a value (ADR-015):
 *
 *   POST   /api/images?pult=&control=&name=   raw image body → stored, OSC `<address> <path>`
 *   GET    /api/images?pult=&control=         library list
 *   POST   /api/images/<id>/show              send a library image again
 *   DELETE /api/images/<id>
 *   GET    /api/prompts?pult=&control=        prompt presets
 *   POST   /api/prompts?pult=&control=        { label, text, on? }
 *   PATCH  /api/prompts/<id>                  { label?, text?, on? }
 *   DELETE /api/prompts/<id>                  soft delete, { undoMs }
 *   POST   /api/prompts/<id>/restore          undo a delete (410 when too late)
 *   POST   /api/prompts/<id>/duplicate
 *   PUT    /api/prompts/order?pult=&control=  { ids } (persisted order)
 *   GET    /api/activity?limit=                recent activity (connect, set, lease, action, …)
 *
 * Auth: `x-otakoyi-secret` (installation PIN or studio key) and `x-otakoyi-device` (the device id
 * used on the socket). Anything that sends OSC needs the control lease (or the studio).
 */
export interface Api {
  images: ImageLibrary;
  prompts: PromptStore;
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
}

/** Hard cap for any request body, whatever the control allows. */
export const MAX_BODY_BYTES = 100 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createApi(bridge: Bridge, dir: string, now: () => number = Date.now): Api {
  const images = new ImageLibrary(dir, now);
  const prompts = new PromptStore(dir, now);

  const controlOf = <T extends Control["type"]>(url: URL, type: T) => {
    const pult = url.searchParams.get("pult") ?? "";
    const id = url.searchParams.get("control") ?? "";
    const c = bridge.stores.get(pult)?.control(id);
    if (!c || c.type !== type) throw new HttpError(404, `No ${type} control ${pult}/${id}`);
    return { pult, control: c as ControlOf<T> };
  };
  const promptLimits = (pult: string, id: string) => {
    const c = bridge.stores.get(pult)?.control(id);
    if (!c || c.type !== "prompt") throw new HttpError(404, `No prompt control ${pult}/${id}`);
    return c;
  };

  async function route(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const parts = url.pathname.split("/").filter(Boolean); // ["api", "images", id?, action?]
    if (parts[0] !== "api" || !["images", "prompts", "activity"].includes(parts[1] ?? ""))
      return false;
    const who = bridge.authorize(header(req, "x-otakoyi-secret"), header(req, "x-otakoyi-device"));
    if (!who) throw new HttpError(401, "Wrong PIN");
    const method = req.method ?? "GET";
    const needsLease = () => {
      if (!bridge.canControl(who)) throw new HttpError(409, "Another device is in control");
    };

    if (parts[1] === "activity") {
      // Activity feed for the Installation drawer (needs the PIN or the studio key).
      if (method !== "GET") throw new HttpError(405, "Method not allowed");
      const limit = Number(url.searchParams.get("limit")) || undefined;
      return json(res, 200, bridge.activity(limit));
    }

    if (parts[1] === "images") {
      const id = parts[2];
      if (!id && method === "GET") {
        return json(
          res,
          200,
          await images.list({
            pultId: url.searchParams.get("pult") ?? undefined,
            controlId: url.searchParams.get("control") ?? undefined,
          }),
        );
      }
      if (!id && method === "POST") {
        const { pult, control } = controlOf(url, "image");
        needsLease();
        const bytes = await readBody(req, control.maxMB * 1024 * 1024);
        const check = validateImage(control, bytes);
        if (!check.ok) throw new HttpError(check.status, check.message);
        const asset = await images.add(
          {
            pultId: pult,
            controlId: control.id,
            name: url.searchParams.get("name") ?? "",
            format: check.format,
            bytes,
          },
          control.library,
        );
        bridge.applyValue(pult, control.id, { image: asset.id, path: asset.path }, who);
        bridge.dataChanged(pult, control.id, "images", who, { op: "upload", image: asset.id });
        return json(res, 201, asset);
      }
      if (id && parts[3] === "show" && method === "POST") {
        const asset = await images.get(id);
        if (!asset) throw new HttpError(404, "No such image");
        needsLease();
        if (
          !bridge.applyValue(
            asset.pultId,
            asset.controlId,
            { image: asset.id, path: asset.path },
            who,
          )
        )
          throw new HttpError(404, "The control for this image no longer exists");
        return json(res, 200, asset);
      }
      if (id && !parts[3] && method === "DELETE") {
        needsLease();
        const asset = await images.get(id);
        if (!asset || !(await images.remove(id))) throw new HttpError(404, "No such image");
        bridge.dataChanged(asset.pultId, asset.controlId, "images", who, {
          op: "delete",
          image: id,
        });
        return json(res, 200, { ok: true });
      }
      throw new HttpError(405, "Method not allowed");
    }

    // prompts
    const id = parts[2];
    const changed = async (pult: string, control: string, op: string, presetId?: string) => {
      bridge.dataChanged(pult, control, "prompts", who, { op, preset: presetId });
      // A live preset that was edited, switched off or deleted is re-sent (deleted → base look).
      if (presetId)
        bridge.reapplyPrompt(pult, control, await prompts.list(pult, control), presetId, who);
    };
    if (!id && method === "GET") {
      const pult = url.searchParams.get("pult") ?? "";
      const control = url.searchParams.get("control") ?? "";
      promptLimits(pult, control);
      return json(res, 200, await prompts.list(pult, control));
    }
    if (!id && method === "POST") {
      const pult = url.searchParams.get("pult") ?? "";
      const control = url.searchParams.get("control") ?? "";
      const limits = promptLimits(pult, control);
      needsLease();
      const r = await prompts.create(pult, control, limits, await readJson(req));
      if (!r.ok) throw new HttpError(r.status, r.message);
      await changed(pult, control, "create");
      return json(res, 201, r.value);
    }
    if (id === "order" && method === "PUT") {
      const pult = url.searchParams.get("pult") ?? "";
      const control = url.searchParams.get("control") ?? "";
      promptLimits(pult, control);
      needsLease();
      const r = await prompts.reorder(pult, control, (await readJson(req)).ids);
      if (!r.ok) throw new HttpError(r.status, r.message);
      await changed(pult, control, "reorder");
      return json(res, 200, r.value);
    }
    if (id && (parts[3] === "duplicate" || parts[3] === "restore") && method === "POST") {
      const cur = await prompts.get(id);
      if (!cur) throw new HttpError(parts[3] === "restore" ? 410 : 404, "No such preset");
      const limits = promptLimits(cur.pultId, cur.controlId);
      needsLease();
      const r =
        parts[3] === "duplicate"
          ? await prompts.duplicate(id, limits)
          : await prompts.restore(id, limits);
      if (!r.ok) throw new HttpError(r.status, r.message);
      await changed(cur.pultId, cur.controlId, parts[3]);
      return json(res, parts[3] === "duplicate" ? 201 : 200, r.value);
    }
    if (id && !parts[3] && (method === "PATCH" || method === "DELETE")) {
      const cur = await prompts.get(id);
      if (!cur || cur.deletedAt) throw new HttpError(404, "No such preset");
      const limits = promptLimits(cur.pultId, cur.controlId);
      needsLease();
      if (method === "DELETE") {
        await prompts.remove(id);
        await changed(cur.pultId, cur.controlId, "delete", id);
        return json(res, 200, { ok: true, undoMs: UNDO_WINDOW_MS });
      }
      const r = await prompts.update(id, limits, await readJson(req));
      if (!r.ok) throw new HttpError(r.status, r.message);
      await changed(cur.pultId, cur.controlId, "update", id);
      return json(res, 200, r.value);
    }
    throw new HttpError(405, "Method not allowed");
  }

  return {
    images,
    prompts,
    async handle(req, res, url) {
      try {
        return await route(req, res, url);
      } catch (e) {
        if (e instanceof HttpError) {
          if (e.status === 413) res.setHeader("connection", "close");
          json(res, e.status, { error: e.message });
          return true;
        }
        throw e;
      }
    },
  };
}

function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function json(res: ServerResponse, status: number, body: unknown): true {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
  return true;
}

/** Read a request body, refusing (413) as soon as it grows past `limit`. */
export function readBody(req: IncomingMessage, limit: number): Promise<Uint8Array> {
  const max = Math.min(limit, MAX_BODY_BYTES);
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max)
    return Promise.reject(
      new HttpError(413, `Upload is larger than ${Math.round(max / 1048576)} MB`),
    );
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        req.pause();
        fail(new HttpError(413, `Upload is larger than ${Math.round(max / 1048576)} MB`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => ok(new Uint8Array(Buffer.concat(chunks))));
    req.on("error", fail);
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(req, MAX_JSON_BYTES);
  try {
    const v = JSON.parse(Buffer.from(body).toString("utf8") || "{}");
    if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}
