import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";
import { createOrder, captureOrder, getOrderDetails } from "../utils/paypal.js";

export const getAllFarmProducts = async (req, res, next) => {
  try {
    const { farmId } = req.params;

    if (isNaN(Number(farmId))) {
      return next(new HttpError("Farm not found", 404));
    }
    const { data: farmData, error: farmError } = await supabase
      .from("farm")
      .select("id")
      .eq("id", farmId);

    console.log(farmData);

    if (!farmData.length) return next(new HttpError("Farm not found", 404));

    const { data, error } = await supabase
      .from("products")
      .select(
        "id,description,price,image,amount_to_sell,inventory(name, amount_per_unit, unit)"
      )
      .eq("farm_id", Number(farmId))
      .order("created_at", { ascending: false });

    console.log(data);

    if (error || farmError) {
      console.error("Fetch error:", error);
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
    const { productId, farmId } = req.params;

    const { data, error } = await supabase
      .from("products")
      .select(
        "id,description,price,image,amount_to_sell,inventory(id, name, stock_qty, amount_per_unit, unit)"
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

export const createPaypalOrder = async (req, res, next) => {
  try {
    const { cart } = req.body;
    const { farmId } = req.params;

    const { data, error } = await supabase
      .from("farm")
      .select("id,paypal_email")
      .eq("id", farmId)
      .single();

    console.log(data);

    if (error) return next(new HttpError("Retrieve farm details failed", 500));

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res
        .status(400)
        .json({ message: "Invalid or empty cart data provided." });
    }
    const { paypal_email } = data;

    const { jsonResponse, httpStatusCode } = await createOrder(
      cart,
      paypal_email
    );
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to create order:", error);
    res
      .status(error.status || 500)
      .json({ message: `Failed to create order: ${error.message}` });
  }
};

export const capturePaypalOrder = async (req, res, next) => {
  try {
    const { orderID } = req.body;
    const { farmId } = req.params;
    if (!orderID) {
      return res
        .status(400)
        .json({ message: "Missing orderID in request body." });
    }

    const { jsonResponse, httpStatusCode } = await captureOrder(orderID);
    if (jsonResponse.status === "COMPLETED") {
      try {
        const { jsonResponse: orderDetails } = await getOrderDetails(orderID);
        console.log(orderDetails);
        const { data: sales, error: salesError } = await supabase
          .from("sales")
          .insert({
            order_id: orderDetails.id,
            farm_id: Number(farmId),
            amount: Number(orderDetails.purchase_units[0].amount.value),
            payer_email: jsonResponse.payer.email_address,
            paypal_fee: Number(
              orderDetails.purchase_units[0].payments.captures[0]
                .seller_receivable_breakdown.paypal_fee.value
            ),
            net_amount: Number(
              orderDetails.purchase_units[0].payments.captures[0]
                .seller_receivable_breakdown.net_amount.value
            ),
            paypal_order_details: orderDetails,
          });
        if (salesError) return next(new HttpError(salesError.message, 400));
        const saleItems = orderDetails.purchase_units[0].items.map((item) => ({
          sale_id: orderDetails.id,
          product_id: Number(item.sku),
          unit_price: Number(item.unit_amount.value),
          quantity: Number(item.quantity),
          subtotal: Number(item.unit_amount.value) * Number(item.quantity),
          name: item.name,
        }));
        console.log("Sale items:", saleItems);
        const { error: itemsError } = await supabase
          .from("sale_items")
          .insert(saleItems);
        if (itemsError) return next(new HttpError(itemsError.message, 400));
        for (const item of saleItems) {
          const { error } = await supabase.rpc("increment_total_sales", {
            sku_input: Number(item.product_id),
            qty: Number(item.quantity),
          });
          if (error) {
            console.error(
              `Error updating total_sales for SKU ${item.sku}`,
              error
            );
          }
        }
      } catch (error) {
        return next(
          new HttpError("Failed to save order details to the database.", 500)
        );
      }
    }
    res.status(httpStatusCode).json(jsonResponse);
  } catch (error) {
    console.error("Failed to capture order:", error);
    res
      .status(error.status || 500)
      .json({ message: `Failed to capture order: ${error.message}` });
  }
};
