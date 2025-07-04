import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

export const getDashboardStats = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const userId = res.locals.authData.sub;
    const { count: totalTrees, error: treeCountError } = await supabase
      .from("tree")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", farmId);

    const { count: healthyTrees, error: healthyTreeError } = await supabase
      .from("tree")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .eq("status", "Healthy");

    const { count: diseasedTrees, error: diseasedTreeError } = await supabase
      .from("tree")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .eq("status", "Diseased");

    const { data: harvests, error: harvestError } = await supabase
      .from("harvest")
      .select("total_weight, estimated_value, tree!inner(farm_id)")
      .eq("tree.farm_id", farmId);

    let totalHarvestWeight = 0;
    let totalHarvestValue = 0;
    if (harvests) {
      totalHarvestWeight = harvests.reduce(
        (sum, h) => sum + (parseFloat(h.total_weight) || 0),
        0
      );
      totalHarvestValue = harvests.reduce(
        (sum, h) => sum + (parseFloat(h.estimated_value) || 0),
        0
      );
    }

    const { count: totalInventoryItems, error: inventoryCountError } =
      await supabase
        .from("inventory")
        .select("*", { count: "exact", head: true })
        .eq("farm_id", farmId);

    // const { data: lowStockItemsData, error: lowStockError } =
    //   await supabase.rpc("get_low_stock_items", {
    //     farm_id_param: farmId,
    //   });
    // const lowStockCount = lowStockItemsData?.length ?? 0;

    const { count: totalStaff, error: staffCountError } = await supabase
      .from("user")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .eq("role", "STAFF")
      .neq("id", userId);

    // --- Activity Stats (Optional - Example: Recent Harvests) ---
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const { count: recentHarvestsCount, error: recentHarvestError } =
      await supabase
        .from("harvest")
        .select("*, tree!inner(farm_id)", { count: "exact", head: true })
        .eq("tree.farm_id", farmId)
        .gte("created_at", thirtyDaysAgo.toISOString());

    const errors = [
      treeCountError,
      healthyTreeError,
      diseasedTreeError,
      harvestError,
      inventoryCountError,
      //   lowStockError,
      staffCountError,
      recentHarvestError,
    ].filter(Boolean);
    if (errors.length > 0) {
      console.error("Dashboard Stats Errors:", errors);
      return next(
        new HttpError("Failed to fetch some dashboard statistics.", 500)
      );
    }

    const stats = {
      trees: {
        total: totalTrees ?? 0,
        healthy: healthyTrees ?? 0,
        diseased: diseasedTrees ?? 0,
      },
      harvests: {
        totalWeight: totalHarvestWeight,
        totalValue: totalHarvestValue,
        countLast30Days: recentHarvestsCount ?? 0,
      },
      inventory: {
        totalItems: totalInventoryItems ?? 0,
        // lowStockItems: lowStockCount,
      },
      staff: {
        total: totalStaff ?? 0,
      },
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error("Get Dashboard Stats Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
