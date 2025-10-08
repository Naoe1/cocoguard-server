import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

// GET /api/audit-events
// Supports optional query params: page, pageSize, action, resource_type, resource_id
export const getAuditEvents = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const {
      page = 1,
      pageSize = 50,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      actor_id: actorId,
      search,
    } = req.query;

    let query = supabase
      .from("audit_events")
      .select("*,actor_id(email, first_name, last_name)")
      .eq("farm_id", farmId)
      .order("created_at", { ascending: false });

    if (action) query = query.ilike("action", `%${action}%`);
    if (resourceType) query = query.ilike("resource_type", `%${resourceType}%`);
    if (resourceId) query = query.eq("resource_id", resourceId);
    if (actorId) query = query.eq("actor_id", actorId);

    if (search) {
      // Soft search across action/resource fields
      query = query.or(
        `action.ilike.%${search}%,resource_type.ilike.%${search}%,resource_id.ilike.%${search}%`
      );
    }

    const pageNum = Number(page) || 1;
    const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
    const from = (pageNum - 1) * size;
    const to = from + size - 1;

    const { data, error } = await query.range(from, to);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({ audit_events: data || [] });
  } catch (error) {
    console.error("Get audit events error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export default { getAuditEvents };
