import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

export const getInventory = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const userId = res.locals.authData.sub;
    const { category } = req.query;
    let query = supabase.from("inventory").select("*").eq("farm_id", farmId);
    if (category) {
      query = query.eq("category", category);
    }
    query = query.order("updated_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({ inventory: data });
  } catch (error) {
    console.error("Get inventory error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getInventoryItemById = async (req, res, next) => {
  try {
    const { inventoryId } = req.params;
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("id", inventoryId)
      .eq("farm_id", farmId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    const inventoryItem = data[0];

    if (!inventoryItem) {
      return res.status(404).json({ message: "Inventory item not found" });
    }

    return res.status(200).json(inventoryItem);
  } catch (error) {
    console.error("Get inventory item error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const createInventoryItem = async (req, res, next) => {
  try {
    const {
      name,
      category,
      stockQty,
      amountPerUnit,
      unit,
      lowStockAlert,
      stockPrice,
    } = req.body;
    const farmId = res.locals.farmId;

    const { data: existingItems, error: checkError } = await supabase
      .from("inventory")
      .select("id")
      .eq("farm_id", farmId)
      .ilike("name", name);

    if (checkError) {
      return next(new HttpError("Error checking inventory items", 400));
    }

    if (existingItems && existingItems.length > 0) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [
          {
            field: "name",
            message: "An inventory item name already exists",
          },
        ],
      });
    }

    const { data, error } = await supabase
      .from("inventory")
      .insert({
        farm_id: farmId,
        name,
        category,
        stock_qty: stockQty,
        amount_per_unit: amountPerUnit,
        unit,
        low_stock_alert: lowStockAlert || 0,
        stock_price: stockPrice,
        total_available: stockQty * amountPerUnit,
      })
      .select()
      .single();

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(201).json({
      message: "Inventory item created successfully",
      inventoryItem: data,
    });
  } catch (error) {
    console.error("Create inventory item error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateInventoryItem = async (req, res, next) => {
  try {
    const { inventoryId } = req.params;
    const {
      name,
      category,
      stockQty,
      amountPerUnit,
      unit,
      lowStockAlert,
      stockPrice,
      totalAvailable,
    } = req.body;
    const farmId = res.locals.farmId;

    const { data: existingItems, error: checkError } = await supabase
      .from("inventory")
      .select("id")
      .eq("farm_id", farmId)
      .ilike("name", name);

    if (checkError) {
      return next(new HttpError("Error checking inventory items", 400));
    }

    if (
      existingItems &&
      existingItems.length > 0 &&
      existingItems[0].id != inventoryId
    ) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [
          {
            field: "name",
            message: "An inventory item name already exists",
          },
        ],
      });
    }

    // First check if inventory item exists and belongs to the farm
    const { data: existingItem, error: findError } = await supabase
      .from("inventory")
      .select("*")
      .eq("id", inventoryId)
      .eq("farm_id", farmId);

    if (findError) {
      return next(new HttpError(findError.message, 400));
    }

    if (!existingItem || existingItem.length === 0) {
      return next(new HttpError("Inventory item not found", 404));
    }

    const { error } = await supabase
      .from("inventory")
      .update({
        name,
        category,
        stock_qty: stockQty,
        amount_per_unit: amountPerUnit,
        unit,
        low_stock_alert: lowStockAlert,
        stock_price: stockPrice,
        total_available: totalAvailable || stockQty * amountPerUnit,
      })
      .eq("id", inventoryId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      message: "Inventory item updated successfully",
    });
  } catch (error) {
    console.error("Update inventory item error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const deleteInventoryItem = async (req, res, next) => {
  try {
    const { inventoryId } = req.params;
    const farmId = res.locals.farmId;

    // First check if inventory item exists and belongs to the farm
    const { data: existingItem, error: findError } = await supabase
      .from("inventory")
      .select("*")
      .eq("id", inventoryId)
      .eq("farm_id", farmId);

    if (findError) {
      return next(new HttpError(findError.message, 400));
    }

    if (!existingItem || existingItem.length === 0) {
      return next(new HttpError("Inventory item not found", 404));
    }

    const { error } = await supabase
      .from("inventory")
      .delete()
      .eq("id", inventoryId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      message: "Inventory item deleted successfully",
    });
  } catch (error) {
    console.error("Delete inventory item error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getLowStockItems = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;

    const { data, error } = await supabase.rpc("get_low_stock_items", {
      farm_id_param: farmId,
    });

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({ lowStockItems: data || [] });
  } catch (error) {
    console.error("Get low stock items error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const addCoconutToInventory = async (req, res, next) => {
  try {
    const { quantity, harvestId } = req.body;
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .eq("farm_id", farmId)
      .eq("name", "Coconut")
      .single();

    const { error: harvestError } = await supabase
      .from("harvest")
      .update({
        added_to_inventory: true,
      })
      .eq("id", harvestId)
      .single();

    if (error || harvestError) {
      return next(new HttpError(error.message, 400));
    }

    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        total_available: data.total_available + quantity,
      })
      .eq("id", data.id)
      .select()
      .single();

    if (updateError) {
      return next(new HttpError(updateError.message, 400));
    }

    return res.status(201).json({
      message: "Coconut added to inventory successfully",
    });
  } catch (error) {
    console.error("Add coconut to inventory error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getInventoryStats = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const { count: totalItemsCount, error: totalCountError } = await supabase
      .from("inventory")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", farmId);

    if (totalCountError) {
      console.error(
        "Supabase Get Total Inventory Count Error:",
        totalCountError
      );
      return next(new HttpError(totalCountError.message, 400));
    }

    const { data: lowStockItems, error: lowStockError } = await supabase.rpc(
      "get_low_stock_items",
      {
        farm_id_param: farmId,
      }
    );

    if (lowStockError) {
      console.error("Supabase RPC get_low_stock_items Error:", lowStockError);
      return next(new HttpError(lowStockError.message, 400));
    }
    // Fetch stock quantity sum for specific categories
    const categoriesToSum = [
      "Fungicide",
      "Product",
      "Fertilizer",
      "Herbicide",
      "Others",
      "Pesticide",
    ];
    const { data: categoryStockData, error: categoryStockError } =
      await supabase
        .from("inventory")
        .select("category, stock_qty")
        .eq("farm_id", farmId)
        .in("category", categoriesToSum);

    if (categoryStockError) {
      console.error("Supabase Get Category Stock Error:", categoryStockError);
      return next(new HttpError(categoryStockError.message, 400));
    }
    const categoryCounts = categoriesToSum.reduce((acc, category) => {
      acc[category] = 0;
      return acc;
    }, {});

    if (categoryStockData) {
      categoryStockData.forEach((item) => {
        if (categoryCounts.hasOwnProperty(item.category)) {
          categoryCounts[item.category] += item.stock_qty || 0;
        }
      });
    }

    const lowStockItemsCount = lowStockItems ? lowStockItems.length : 0;
    const limitedLowStockItems = lowStockItems
      ? lowStockItems.slice(0, 10)
      : [];

    return res.status(200).json({
      inventory: {
        count: totalItemsCount || 0,
        lowStockCount: lowStockItemsCount || 0,
        categoryCounts,
        lowStockItems: limitedLowStockItems,
      },
    });
  } catch (error) {
    console.error("Get Inventory Stats Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
