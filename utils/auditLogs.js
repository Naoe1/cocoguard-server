import "dotenv/config";
import supabase from "../supabase.js";

export const recordAuditEvent = async ({
  actorId,
  action,
  resourceType,
  resourceId,
  previous,
  changes,
  next,
  farmId,
}) => {
  try {
    const payload = {
      actor_id: actorId || null,
      action,
      resource_type: resourceType,
      resource_id: String(resourceId),
      previous: previous ?? null,
      changes: changes ?? null,
      next: next ?? null,
      farm_id: farmId,
    };
    const { error } = await supabase.from("audit_events").insert(payload);
    if (error) {
      console.error("Audit insert error:", error);
    }
  } catch (e) {
    console.error("Audit insert exception:", e);
  }
};

export const computeDiff = (prev, nxt, keys) => {
  const diff = {};
  keys.forEach((k) => {
    const pv = prev ? prev[k] : null;
    const nv = nxt ? nxt[k] : null;
    if (JSON.stringify(pv) !== JSON.stringify(nv)) {
      diff[k] = { from: pv ?? null, to: nv ?? null };
    }
  });
  return diff;
};
