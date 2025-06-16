import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const accessToken = req.headers.authorization?.split(" ")[1];

    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) {
      console.log("Error in authMiddleware:", error);
      return next(new HttpError("Unauthorized", 403));
    }
    console.log(error);
    const id = data.user.id;
    const { data: userData, error: userError } = await supabase
      .from("user")
      .select("id, role, farm_id(id,region)")
      .eq("id", id);

    if (userError) {
      return next(new HttpError("User not found", 404));
    }
    res.locals.authData = data.user.user_metadata;
    res.locals.role = userData[0].role;
    res.locals.farmId = userData[0].farm_id.id;
    res.locals.region = userData[0].farm_id.region;

    next();
  } catch (error) {
    return next(new HttpError());
  }
};

export const restrictToAdmin = (req, res, next) => {
  const userRole = res.locals.role;

  if (userRole !== "ADMIN") {
    return res.status(403).json({
      message: "Unauthorized: Admin access only",
    });
  }

  next();
};
