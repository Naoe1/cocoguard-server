import "dotenv/config";
import supabase from "../supabase.js";

const { PAYPAL_CLIENT_ID, PAYPAL_APP_SECRET } = process.env;
const base = "https://api-m.sandbox.paypal.com";

const generateAccessToken = async () => {
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_APP_SECRET) {
      throw new Error("MISSING_API_CREDENTIALS");
    }
    const auth = Buffer.from(
      PAYPAL_CLIENT_ID + ":" + PAYPAL_APP_SECRET
    ).toString("base64");
    const response = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Failed to generate Access Token:", error);
    throw error;
  }
};

export const createOrder = async (cart) => {
  console.log(
    "Shopping cart information passed from the frontend createOrder() callback:",
    cart
  );
  const productIds = cart.map((item) => item.sku);
  if (productIds.length === 0) {
    throw new Error("Cart is empty.");
  }
  const { data: itemDetails, error: dbError } = await supabase
    .from("products")
    .select("id, price, inventory(id, name, stock_qty, amount_per_unit, unit)")
    .in("id", productIds);

  if (dbError) {
    throw new Error("Failed to fetch item details from the database.");
  }
  const detailMap = itemDetails.reduce((map, item) => {
    map[item.id] = {
      price: parseFloat(item.price),
      name: item.inventory.name,
    };
    return map;
  }, {});
  const totalAmount = cart
    .reduce((sum, item) => {
      const price = detailMap[item.sku].price;
      const quantity = parseInt(item.quantity, 10) || 0;
      return sum + quantity * price;
    }, 0)
    .toFixed(2);

  if (totalAmount <= 0) {
    throw new Error("Calculated total amount must be positive.");
  }

  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders`;
  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "PHP",
          value: totalAmount.toString(),
          breakdown: {
            item_total: {
              currency_code: "PHP",
              value: totalAmount.toString(),
            },
            // Can add tax_total, shipping, discount etc. here
          },
        },
        items: cart.map((item) => {
          const details = detailMap[item.sku];
          const itemPrice = details.price.toFixed(2);
          return {
            name: details.name,
            unit_amount: {
              currency_code: "PHP",
              value: itemPrice,
            },
            quantity: item.quantity.toString(),
            sku: item.sku.toString(),
          };
        }),
      },
    ],
    // Optional: Add application context like return/cancel URLs if needed
    // application_context: {
    //   return_url: 'YOUR_RETURN_URL',
    //   cancel_url: 'YOUR_CANCEL_URL',
    // }
  };

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // 'PayPal-Request-Id': 'SOME_UNIQUE_ID', // Helps PayPal debug issues
      // 'Prefer': 'return=representation', // Use this to get the full resource representation on creation
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};

export const captureOrder = async (orderID) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderID}/capture`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // Uncomment one of these buttons if you encounter issues.
      // 'PayPal-Request-Id': 'SOME_UNIQUE_ID',
      // 'Prefer': 'return=representation',
    },
  });

  return handleResponse(response);
};

async function handleResponse(response) {
  try {
    const jsonResponse = await response.json();
    if (!response.ok) {
      console.error(`PayPal API Error (${response.status}):`, jsonResponse);
      const errorMessage =
        jsonResponse.message || `HTTP ${response.status} error from PayPal`;
      const error = new Error(errorMessage);
      error.status = response.status;
      error.paypal_debug_id = jsonResponse.debug_id;
      throw error;
    }
    return {
      jsonResponse,
      httpStatusCode: response.status,
    };
  } catch (err) {
    // Handle cases where response is not JSON or network errors
    console.error("Failed to parse PayPal response or network error:", err);
    const errorMessage = err.message || "Failed to process PayPal response";
    const error = new Error(errorMessage);
    error.status = response.status || 500;
    throw error;
  }
}

export const getOrderDetails = async (orderID) => {
  const accessToken = await generateAccessToken();
  const url = `${base}/v2/checkout/orders/${orderID}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return handleResponse(response);
};
