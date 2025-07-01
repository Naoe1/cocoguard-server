import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

export const getAllNutrients = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const { coconutId } = req.query;

    let query = supabase
      .from("nutrient")
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

    return res.status(200).json({ nutrients: data });
  } catch (error) {
    console.error("Get nutrients error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getNutrientById = async (req, res, next) => {
  try {
    const { nutrientId } = req.params;
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("nutrient")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", nutrientId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    const nutrient = data[0];

    if (!nutrient) {
      return res.status(404).json({ message: "Nutrient not found" });
    }

    return res.status(200).json(nutrient);
  } catch (error) {
    console.error("Get nutrient error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const createNutrient = async (req, res, next) => {
  try {
    const {
      dateApplied,
      product,
      amount,
      applicationMethod,
      treeCode,
      inventoryItemId,
      unit,
    } = req.body;
    const farmId = res.locals.farmId;

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

    if (inventoryItemId) {
      const { data: inventoryData, error: inventoryError } = await supabase
        .from("inventory")
        .select("*")
        .eq("id", Number(inventoryItemId))
        .eq("farm_id", farmId);
      const inventoryItem = inventoryData[0];
      if (inventoryError || !inventoryItem) {
        return res.status(404).json({
          validationError: {
            field: "inventoryId",
            message: "Inventory not found",
          },
        });
      }
      if (inventoryItem.total_available < amount) {
        return res.status(400).json({
          validationError: {
            field: "amount",
            message: "Amount exceeds available inventory",
          },
        });
      }
      const { error: inventoryErrorUpdate } = await supabase
        .from("inventory")
        .update({
          total_available: inventoryItem.total_available - amount,
        })
        .eq("id", Number(inventoryItemId));
      if (inventoryErrorUpdate) {
        return next(new HttpError(inventoryErrorUpdate.message, 400));
      }
    }

    const { data, error } = await supabase
      .from("nutrient")
      .insert({
        date_applied: dateApplied,
        product: product,
        amount: amount,
        application_method: applicationMethod,
        applied_to: tree.id,
        unit: unit,
      })
      .select();

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(201).json({
      message: "Nutrient application created successfully",
      nutrient: data,
    });
  } catch (error) {
    console.error("Create nutrient error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateNutrient = async (req, res, next) => {
  try {
    const { nutrientId } = req.params;
    const { dateApplied, product, amount, applicationMethod, unit } = req.body;
    const farmId = res.locals.farmId;

    const { data: nutrientData, error: nutrientError } = await supabase
      .from("nutrient")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", nutrientId);

    if (nutrientError) {
      return next(new HttpError(nutrientError.message, 400));
    }

    const existingNutrient = nutrientData[0];
    if (!existingNutrient) {
      return next(new HttpError("Nutrient not found", 404));
    }
    const { error } = await supabase
      .from("nutrient")
      .update({
        date_applied: dateApplied,
        product: product,
        amount: amount,
        application_method: applicationMethod,
        unit: unit,
      })
      .eq("id", nutrientId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      message: "Nutrient updated successfully",
    });
  } catch (error) {
    console.error("Update nutrient error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const deleteNutrient = async (req, res, next) => {
  try {
    const { nutrientId } = req.params;
    const farmId = res.locals.farmId;

    // First check if nutrient exists and belongs to user's farm
    const { data: nutrientData, error: nutrientError } = await supabase
      .from("nutrient")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", nutrientId);

    if (nutrientError) {
      return next(new HttpError(nutrientError.message, 400));
    }
    const existingNutrient = nutrientData[0];
    if (!existingNutrient) {
      return next(new HttpError("Nutrient not found", 404));
    }
    const { error } = await supabase
      .from("nutrient")
      .delete()
      .eq("id", nutrientId);
    if (error) {
      return next(new HttpError(error.message, 400));
    }
    return res.status(200).json({
      message: "Nutrient deleted successfully",
    });
  } catch (error) {
    console.error("Delete nutrient error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
