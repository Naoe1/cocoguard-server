import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

export const getAllTreatments = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const { coconutId } = req.query;

    let query = supabase
      .from("treatment")
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

    return res.status(200).json({ treatments: data });
  } catch (error) {
    console.error("Get treatments error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getTreatmentById = async (req, res, next) => {
  try {
    const { treatmentId } = req.params;
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("treatment")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", treatmentId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    const treatment = data[0];

    if (!treatment) {
      return res.status(404).json({ message: "Treatment not found" });
    }

    return res.status(200).json(treatment);
  } catch (error) {
    console.error("Get treatment error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const createTreatment = async (req, res, next) => {
  try {
    const {
      dateApplied,
      type,
      product,
      endDate,
      treeCode,
      amount,
      inventoryItemId,
      unit,
    } = req.body;
    console.log("Request body:", req.body);
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
      .from("treatment")
      .insert({
        date_applied: dateApplied,
        type: type,
        product: product,
        end_date: endDate,
        applied_to: tree.id,
        amount: amount,
        unit: unit,
      })
      .select();

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(201).json({
      message: "treatment created successfully",
      treatment: data,
    });
  } catch (error) {
    console.error("Create treatment error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateTreatment = async (req, res, next) => {
  try {
    const { treatmentId } = req.params;
    const {
      dateApplied,
      type,
      product,
      endDate,
      amount, // Added
      unit, // Added
    } = req.body;
    const farmId = res.locals.farmId;

    const { data: treatmentData, error: treatmentError } = await supabase
      .from("treatment")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", treatmentId);

    console.log(treatmentData);
    if (treatmentError) {
      return next(new HttpError(treatmentError.message, 400));
    }

    const existingTreatment = treatmentData[0];
    if (!existingTreatment) {
      return next(new HttpError("treatment not found", 404));
    }
    const { error } = await supabase
      .from("treatment")
      .update({
        date_applied: dateApplied,
        type: type,
        product: product,
        end_date: endDate,
        amount,
        unit,
      })
      .eq("id", treatmentId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      message: "Treatment updated successfully",
    });
  } catch (error) {
    console.error("Update treatment error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const deleteTreatment = async (req, res, next) => {
  try {
    const { treatmentId } = req.params;
    const farmId = res.locals.farmId;

    // First check if harvest exists and belongs to user's farm
    const { data: treatmentData, error: treatmentError } = await supabase
      .from("treatment")
      .select("*,tree!inner(id,tree_code,farm!inner(id))")
      .eq("tree.farm.id", farmId)
      .eq("id", treatmentId);

    if (treatmentError) {
      return next(new HttpError(treatmentError.message, 400));
    }
    const existingTreatment = treatmentData[0];
    if (!existingTreatment) {
      return next(new HttpError("Treatment not found", 404));
    }
    const { error } = await supabase
      .from("treatment")
      .delete()
      .eq("id", treatmentId);
    if (error) {
      return next(new HttpError(error.message, 400));
    }
    return res.status(200).json({
      message: "Treatment deleted successfully",
    });
  } catch (error) {
    console.error("Treatment error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
