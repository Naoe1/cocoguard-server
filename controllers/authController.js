import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

export const register = async (req, res, next) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      barangay,
      postal_code,
      province,
      region,
      street,
      city,
      paypal_email,
    } = req.body;

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      next(new HttpError(authError.message, authError.status));
    }

    if (authData.user) {
      const { error: profileError } = await supabase.from("user").insert({
        id: authData.user.id,
        first_name: firstName || "",
        last_name: lastName || "",
        role: "ADMIN",
        email: email,
      });

      if (profileError) {
        next(new HttpError(profileError.message, 400));
      }
    }

    const { data: farmData, error: farmError } = await supabase
      .from("farm")
      .insert({
        owner: authData.user.id,
        street,
        barangay,
        province,
        region,
        postal_code,
        city,
        paypal_email,
      })
      .select("*");

    const { error: updateError } = await supabase
      .from("user")
      .update({ farm_id: farmData[0].id })
      .eq("id", authData.user.id);

    if (updateError) next(new HttpError(updateError.message, 400));

    const { error: inventoryError } = await supabase.from("inventory").insert([
      {
        name: "Coconut",
        unit: "kg",
        stock_qty: 0,
        category: "Product",
        farm_id: farmData[0].id,
      },
      {
        name: "Copra",
        unit: "kg",
        stock_qty: 0,
        category: "Product",
        farm_id: farmData[0].id,
      },
    ]);

    if (inventoryError || farmError) {
      next(new HttpError("Error creating farm or inventory:", 400));
    }

    if (authData.session) {
      res.cookie("refresh_token", authData.session.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/api/auth/refresh",
      });

      return res.status(201).json({
        message: "User created successfully",
        user: {
          firstName: firstName,
          lastName: lastName,
          email: email,
          role: "ADMIN",
          farmId: farmData[0].id,
        },
        access_token: authData.session.access_token,
        expires_in: authData.session.expires_in,
      });
    }

    return res.status(201).json({
      message: "User created successfully",
      user: authData.user,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new HttpError("Email and password are required", 400));
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return next(new HttpError(error.message, error.status));
    }

    const { data: userData, error: userError } = await supabase
      .from("user")
      .select("id, first_name, last_name, farm_id, role")
      .eq("id", data.user.id)
      .single();

    res.cookie("refresh_token", data.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: "/api/auth/refresh",
    });

    return res.status(200).json({
      message: "Login successful",
      user: {
        firstName: userData.first_name,
        lastName: userData.last_name,
        email: data.user.email,
        role: userData.role,
        farmId: userData.farm_id,
      },
      access_token: data.session.access_token,
      expires_in: data.expires_in,
    });
  } catch (error) {
    return next(new HttpError("Internal server error", 500));
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const refresh_token = req.cookies.refresh_token;

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token,
    });

    if (error) {
      console.error("Token refresh error:", error);
      return next(new HttpError(error.message, error.status));
    }

    const { data: userData, error: userError } = await supabase
      .from("user")
      .select("first_name, last_name, farm_id, role")
      .eq("id", data.user.id)
      .single();

    return res.status(200).json({
      message: "Token refreshed successfully",
      accessToken: data.session?.access_token,
      user: {
        firstName: userData.first_name,
        lastName: userData.last_name,
        email: data.user.email,
        role: userData.role,
        farmId: userData.farm_id,
      },
      expires_in: data.session?.expires_in,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const logout = async (req, res, next) => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return next(new HttpError(error.message, error.status));
    }

    res.clearCookie("refresh_token", { path: "/api/auth/refresh" });

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getCurrentUser = async (req, res, next) => {
  try {
    const sub = res.locals.authData.sub;
    const email = res.locals.authData.email;
    const farmId = res.locals.farmId;

    const { data, error } = await supabase
      .from("user")
      .select("first_name, last_name, farm_id(*), role")
      .eq("id", sub)
      .single();

    console.log("Current user data:", data);

    if (error) {
      console.log(error);
      return next(new HttpError("Unauthorized", 401));
    }

    if (!data) {
      return next(new HttpError("User not found", 404));
    }

    return res.status(200).json({
      email,
      firstName: data.first_name,
      lastName: data.last_name,
      role: data.role,
      farmId,
      farmAddress: {
        street: data.farm_id.street,
        barangay: data.farm_id.barangay,
        city: data.farm_id.city,
        province: data.farm_id.province,
        region: data.farm_id.region,
        postal_code: data.farm_id.postal_code,
      },
    });
  } catch (error) {
    console.error("Get current user error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const { data: userData, error: userErr } = await supabase
      .from("user")
      .select("email")
      .eq("email", email)
      .single();

    if (!userData) return next(new HttpError("User not found", 404));

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      return next(new HttpError(error.message, error.status));
    }

    return res.status(200).json({
      message:
        "Password reset link has been successfully sent. It may take 5-10 minutes to arrive in your inbox.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return next(new HttpError("Something went wrong!", 500));
  }
};

export const updatePassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    const token = req.query.token;
    const { data: userData, error: userErr } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: "email",
    });

    const userId = userData?.user?.id;
    if (userErr || !userId) return next(new HttpError("Invalid token", 400));

    const { error: updateErr } = await supabase.auth.admin.updateUserById(
      userId,
      { password: password }
    );

    if (updateErr) {
      return next(new HttpError(updateErr.message, updateErr.status));
    }

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Update password error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const {
      firstName,
      lastName,
      street,
      barangay,
      city,
      province,
      region,
      postal_code,
    } = req.body;

    const userId = res.locals.authData.sub;
    const farmId = res.locals.farmId;

    const { error: updateError } = await supabase
      .from("user")
      .update({
        first_name: firstName,
        last_name: lastName,
      })
      .eq("id", userId);

    const { error: farmError } = await supabase
      .from("farm")
      .update({
        street,
        barangay,
        city,
        province,
        region,
        postal_code,
      })
      .eq("id", farmId);

    if (updateError || farmError) {
      return next(new HttpError(updateError.message, 400));
    }

    return res.status(200).json({
      message: "Account updated successfully",
      data: {
        firstName,
        lastName,
        street,
        barangay,
        city,
        province,
        region,
        postal_code,
      },
    });
  } catch (error) {
    console.error("Update account error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
