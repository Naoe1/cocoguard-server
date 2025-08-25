import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

export const getAllProducts = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const { data, error } = await supabase
      .from("products")
      .select(
        "id,description,price,image,amount_to_sell,inventory(id, name, amount_per_unit, unit)"
      )
      .eq("farm_id", farmId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("Get products join error:", error);
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({ products: data });
  } catch (error) {
    console.error("Get products error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getProductById = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("products")
      .select(
        "id,description,price,amount_to_sell,inventory(id, name, stock_qty)"
      )
      .eq("id", productId)
      .eq("farm_id", farmId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return next(new HttpError("Product not found", 404));
      }
      console.error("Get product by ID join error:", error);
      return next(new HttpError(error.message, 400));
    }

    if (!data) {
      return next(new HttpError("Product not found", 404));
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Get product by ID error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const { inventoryItemId, description, price, amountToSell, image } =
      req.body;
    const farmId = res.locals.farmId;

    const { data: inventoryItem, error: inventoryError } = await supabase
      .from("inventory")
      .select("id, total_available, name")
      .eq("id", inventoryItemId)
      .eq("farm_id", farmId)
      .single();

    if (inventoryError || !inventoryItem) {
      return next(
        new HttpError("Selected inventory item not found for this farm.", 404)
      );
    }

    const { data: existingProduct, error: existingError } = await supabase
      .from("products")
      .select("id")
      .eq("farm_id", farmId)
      .eq("inventory_id", inventoryItemId)
      .maybeSingle();

    if (existingError) {
      return next(new HttpError("Error checking existing products", 400));
    }
    if (existingProduct) {
      return next(
        new HttpError(
          `A product listing for '${inventoryItem.name}' already exists. You can update the existing one.`,
          409
        )
      );
    }

    const { data, error } = await supabase
      .from("products")
      .insert({
        farm_id: farmId,
        inventory_id: inventoryItemId,
        description,
        price,
        amount_to_sell: amountToSell,
        image: image || null,
      })
      .select(`*, inventory ( name )`)
      .single();

    if (error) {
      console.error("Create product insert error:", error);
      return next(new HttpError(error.message, 400));
    }

    return res.status(201).json({
      message: `Product listing for '${data.inventory.name}' created successfully`,
      product: data,
    });
  } catch (error) {
    console.error("Create product error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { description, price, amountToSell, image } = req.body;
    const farmId = res.locals.farmId;

    const { data: currentProduct, error: findError } = await supabase
      .from("products")
      .select("id, amount_to_sell, inventory_id")
      .eq("id", productId)
      .eq("farm_id", farmId)
      .single();

    if (findError || !currentProduct) {
      return next(new HttpError("Product not found", 404));
    }

    const updatePayload = {};
    if (description !== undefined) updatePayload.description = description;
    if (price !== undefined) updatePayload.price = price;
    if (image !== undefined) updatePayload.image = image || null;
    if (amountToSell !== undefined) updatePayload.amount_to_sell = amountToSell;

    if (Object.keys(updatePayload).length === 0) {
      const { data: unchangedData, error: fetchError } = await supabase
        .from("products")
        .select(`*, inventory ( name )`)
        .eq("id", productId)
        .single();
      if (fetchError) return next(new HttpError(fetchError.message, 400));
      return res
        .status(200)
        .json({ message: "No changes provided", product: unchangedData });
    }

    const { data, error } = await supabase
      .from("products")
      .update(updatePayload)
      .eq("id", productId)
      .select(`*, inventory ( name )`)
      .single();

    if (error) {
      console.error("Update product error (potentially from trigger):", error);
      if (error.message?.includes("Insufficient stock in inventory")) {
        return next(new HttpError(error.message, 400));
      }
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      message: `Product listing for '${data.inventory.name}' updated successfully`,
      product: data,
    });
  } catch (error) {
    console.error("Update product controller error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

// Delete a product listing
export const deleteProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const farmId = res.locals.farmId;

    const { data: existingProduct, error: findError } = await supabase
      .from("products")
      .select("id, inventory ( name )")
      .eq("id", productId)
      .eq("farm_id", farmId)
      .single();

    if (findError || !existingProduct) {
      return next(new HttpError("Product not found", 404));
    }

    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (error) {
      console.error("Delete product error:", error);
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      message: `Product listing for '${existingProduct.inventory.name}' deleted successfully`,
    });
  } catch (error) {
    console.error("Delete product error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getSalesStats = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentSales, error } = await supabase
      .from("sales")
      .select("*")
      .eq("farm_id", farmId)
      .gte("created_at", thirtyDaysAgoISO)
      .order("created_at", { ascending: false });

    const { data: totalSalesData, error: totalSalesError } = await supabase.rpc(
      "get_farm_sales_total",
      { p_farm_id: farmId }
    );

    const { data: totalOrdersCount, error: totalOrdersError } =
      await supabase.rpc("get_farm_sales_count", { p_farm_id: farmId });

    const { data: totalCustomersCount, error: totalCustomersError } =
      await supabase.rpc("get_farm_customer_count", { p_farm_id: farmId });

    if (totalSalesError || totalOrdersError || totalCustomersError)
      return next(new HttpError("Can't fetch sales data.", 500));

    const totalNetAmount = totalSalesData;

    if (error) {
      console.error("Supabase Get Recent Sales Error:", error);
      return next(new HttpError(error.message, 400));
    }
    let ordersLast7Days = 0;
    if (recentSales) {
      recentSales.forEach((sale) => {
        const saleDate = new Date(sale.created_at);
        if (saleDate >= sevenDaysAgo) {
          ordersLast7Days++;
        }
      });
    }
    return res.status(200).json({
      sales: {
        recentSales: recentSales || [],
        totalSales: totalNetAmount || 0,
        totalOrders: totalOrdersCount || 0,
        totalCustomers: totalCustomersCount || 0,
        ordersLast7Days: ordersLast7Days || 0,
      },
    });
  } catch (error) {
    console.error("Get Sales Stats Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getCopraPriceHistory = async (req, res, next) => {
  try {
    const region = res.locals.region;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    const { data, error } = await supabase
      .from("copra_price_history")
      .select("id, date, price")
      .eq("region", region)
      .gte("date", thirtyDaysAgoISO)
      .order("date", { ascending: false });

    const thirtyDaysFromNow = new Date();
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 1);
    thirtyDaysFromNow.setDate(currentDate.getDate() + 30);
    const thirtyDaysFromNowISO = thirtyDaysFromNow.toISOString();
    const currentDateISO = currentDate.toISOString();

    const { data: dataPred, error: errPred } = await supabase
      .from("copra_price_prediction")
      .select("id, date, price")
      .eq("region", region)
      .gte("date", currentDateISO)
      .lte("date", thirtyDaysFromNowISO)
      .order("date", { ascending: true });

    const { data: peakPrice4mos, error: peakPriceErr } = await supabase.rpc(
      "get_peak_copra_prediction",
      { p_region: region }
    );

    const { data: currCopraPrice, error: errCopra } = await supabase.rpc(
      "get_latest_copra_price",
      { p_region: region }
    );

    if (error || errPred || peakPriceErr || errCopra) {
      console.error("Get copra price error:", error);
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({
      copraPriceHistory: data,
      copraPricePrediction: dataPred,
      peakPrediction: peakPrice4mos[0],
      latestPriceData: currCopraPrice[0],
      region,
    });
  } catch (error) {
    console.error("Get copra price history error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getSaleHistory = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("sales")
      .select(
        `id,order_id,amount,paypal_fee,net_amount,
        sale_items(*)
      `
      )
      .eq("farm_id", Number(farmId));
    if (error) {
      console.error("Get sale history error:", error);
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({ sales: data });
  } catch (error) {
    console.error("Get sale history error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
