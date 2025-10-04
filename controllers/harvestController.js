import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";
import { recordAuditEvent, computeDiff } from "../utils/auditLogs.js";

const harvestFields = [
  "tree_id",
  "harvest_date",
  "coconut_count",
  "total_weight",
  "estimated_value",
  "added_to_inventory",
];

export const getAllHarvests = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const { coconutId } = req.query;

    let query = supabase
      .from("harvest")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId);

    if (coconutId) {
      query = query.eq("tree.id", coconutId);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({ harvests: data });
  } catch (error) {
    console.error("Get harvests error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getHarvestById = async (req, res, next) => {
  try {
    const { harvestId } = req.params;
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("harvest")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", harvestId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    const harvest = data[0];

    if (!harvest) {
      return res.status(404).json({ message: "Harvest not found" });
    }

    return res.status(200).json(harvest);
  } catch (error) {
    console.error("Get harvest error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const createHarvest = async (req, res, next) => {
  try {
    const { coconutCount, totalWeight, treeCode, harvestDate } = req.body;
    const farmId = res.locals.farmId;
    const region = "REGION IV-A";
    // Verify that the tree belongs to the user's farm
    const { data: treeData, error: treeError } = await supabase
      .from("tree")
      .select("*")
      .eq("farm_id", farmId)
      .eq("tree_code", treeCode);

    const tree = treeData[0];

    if (treeError || !tree) {
      return res.status(404).json({
        validationError: { field: "treeCode", message: "Tree not found" },
      });
    }

    const { data: currCopraPriceData, error: errCopra } = await supabase.rpc(
      "get_latest_copra_price",
      { p_region: region }
    );

    if (errCopra) {
      return next(new HttpError("Failed to fetch copra price", 400));
    }

    const currCopraPrice = currCopraPriceData[0].copra_price || 68;

    const { data, error } = await supabase
      .from("harvest")
      .insert({
        tree_id: tree.id,
        harvest_date: harvestDate,
        coconut_count: coconutCount,
        total_weight: totalWeight,
        estimated_value: totalWeight * currCopraPrice,
      })
      .select();

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    const created = Array.isArray(data) ? data[0] : data;
    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "create",
      resourceType: "harvest",
      resourceId: created?.id,
      previous: null,
      changes: computeDiff(null, created, harvestFields),
      next: created,
      farmId,
    });

    return res.status(201).json({
      message: "Harvest created successfully",
      harvest: data,
    });
  } catch (error) {
    console.error("Create harvest error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateHarvest = async (req, res, next) => {
  try {
    const { harvestId } = req.params;
    const { coconutCount, totalWeight, estimatedValue, harvestDate } = req.body;
    const farmId = res.locals.farmId;

    const { data: harvestData, error: harvestError } = await supabase
      .from("harvest")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", harvestId);

    if (harvestError) {
      return next(new HttpError(harvestError.message, 400));
    }

    const existingHarvest = harvestData[0];
    if (!existingHarvest) {
      return next(new HttpError("Harvest not found", 404));
    }

    const { error } = await supabase
      .from("harvest")
      .update({
        coconut_count: coconutCount,
        total_weight: totalWeight,
        estimated_value: estimatedValue,
        harvest_date: harvestDate,
      })
      .eq("id", harvestId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    const prev = existingHarvest;
    const nextState = {
      ...prev,
      coconut_count: coconutCount,
      total_weight: totalWeight,
      estimated_value: estimatedValue,
      harvest_date: harvestDate,
    };

    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "update",
      resourceType: "harvest",
      resourceId: harvestId,
      previous: prev,
      changes: computeDiff(prev, nextState, harvestFields),
      next: nextState,
      farmId,
    });

    return res.status(200).json({
      message: "Coconut updated successfully",
    });
  } catch (error) {
    console.error("Update harvest error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const deleteHarvest = async (req, res, next) => {
  try {
    const { harvestId } = req.params;
    const farmId = res.locals.farmId;

    // First check if harvest exists and belongs to user's farm
    const { data: harvestData, error: harvestError } = await supabase
      .from("harvest")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", harvestId);

    if (harvestError) {
      return next(new HttpError(harvestError.message, 400));
    }
    const existingHarvest = harvestData[0];
    if (!existingHarvest) {
      return next(new HttpError("Harvest not found", 404));
    }
    const { error } = await supabase
      .from("harvest")
      .delete()
      .eq("id", harvestId);
    if (error) {
      return next(new HttpError(error.message, 400));
    }

    // Audit: delete (best-effort)
    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "delete",
      resourceType: "harvest",
      resourceId: harvestId,
      previous: existingHarvest,
      changes: { deleted: { from: false, to: true } },
      next: null,
      farmId,
    });
    return res.status(200).json({
      message: "Harvest deleted successfully",
    });
  } catch (error) {
    console.error("Delete harvest error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const addToInventory = async (req, res, next) => {
  try {
    const { harvestId } = req.params;
    const farmId = res.locals.farmId;
    const { data: harvest, error: fetchError } = await supabase
      .from("harvest")
      .select(
        `
        *,
        tree:tree_id (
          farm_id
        )
      `
      )
      .eq("id", harvestId)
      .single();

    if (fetchError || !harvest) {
      return next(new HttpError("Harvest not found", 404));
    }

    if (harvest.tree.farm_id !== farmId) {
      return next(new HttpError("Not authorized to update this harvest", 403));
    }

    if (harvest.added_to_inventory) {
      return next(new HttpError("Harvest already added to inventory", 400));
    }

    // Start a transaction to add to inventory and update harvest
    const { data, error } = await supabase.rpc("add_harvest_to_inventory", {
      harvest_id: harvestId,
      farm_id: farmId,
      quantity: harvest.coconut_count || 0,
      weight: harvest.total_weight || 0,
      value: harvest.estimated_value,
    });

    if (error) {
      return next(
        new HttpError(`Failed to add to inventory: ${error.message}`, 400)
      );
    }

    // Audit: add to inventory flag flip (best-effort)
    const prev = { ...harvest };
    const nextState = { ...harvest, added_to_inventory: true };
    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "add_to_inventory",
      resourceType: "harvest",
      resourceId: harvestId,
      previous: prev,
      changes: computeDiff(prev, nextState, ["added_to_inventory"]),
      next: nextState,
      farmId,
    });

    return res.status(200).json({
      message: "Harvest successfully added to inventory",
    });
  } catch (error) {
    console.error("Add to inventory error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getHarvestStats = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoISO = threeMonthsAgo.toISOString();

    const { data: recentHarvests, error } = await supabase
      .from("harvest")
      .select(
        `
        *,
        tree!inner (
          id,
          tree_code,
          farm_id
        )
      `
      )
      .eq("tree.farm_id", farmId)
      .gte("harvest_date", threeMonthsAgoISO)
      .order("harvest_date", { ascending: false });

    if (error) {
      console.error("Supabase Get Recent Harvests Error:", error);
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      harvest: {
        recentHarvests: recentHarvests || [],
      },
    });
  } catch (error) {
    console.error("Get Harvest Stats Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
