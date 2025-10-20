import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";
import { recordAuditEvent, computeDiff } from "../utils/auditLogs.js";

const staffFields = ["first_name", "last_name", "role", "email", "farm_id"];

export const inviteStaff = async (req, res, next) => {
  try {
    const adminFarmId = res.locals.farmId;
    const role = res.locals.role;
    if (role !== "ADMIN") return next(new HttpError("Unauthorized.", 403));

    const { email, firstName, lastName } = req.body;
    const { data: userData, error: userError } = await supabase
      .from("user")
      .select("*")
      .eq("farm_id", adminFarmId)
      .eq("email", email);

    const user = userData[0];
    if (userError) {
      return next(new HttpError(userError.message, 400));
    }
    if (user) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [
          {
            field: "email",
            message: "User already exists",
          },
        ],
      });
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: process.env.SUPABASE_AUTH_REDIRECT_URL,
        data: { firstName, lastName, farmId: adminFarmId },
      },
    });

    if (error) {
      return next(new HttpError(error.message, error.status));
    }

    return res.status(200).json({
      message: "Invitation sent successfully",
    });
  } catch (error) {
    console.error("Invite Staff Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const createStaff = async (req, res, next) => {
  try {
    const adminFarmId = res.locals.farmId;
    const role = res.locals.role;
    if (role !== "ADMIN") return next(new HttpError("Unauthorized.", 403));
    const { email, password, firstName, lastName } = req.body;

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
        role: "STAFF",
        farm_id: adminFarmId,
        email: email,
      });

      if (profileError) {
        next(new HttpError(profileError.message, 400));
      }

      const createdProfile = {
        id: authData.user.id,
        first_name: firstName || "",
        last_name: lastName || "",
        role: "STAFF",
        farm_id: adminFarmId,
        email,
      };
      recordAuditEvent({
        actorId: res.locals.authData?.sub,
        action: "create",
        resourceType: "staff",
        resourceId: createdProfile.id,
        previous: null,
        changes: computeDiff(null, createdProfile, staffFields),
        next: createdProfile,
        farmId: adminFarmId,
      });
    }

    return res.status(201).json({
      message: "Staff member created successfully",
    });
  } catch (error) {
    console.error("Create Staff Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getStaffById = async (req, res, next) => {
  try {
    const resRole = res.locals.role;
    const { staffId } = req.params;
    if (resRole !== "ADMIN") return next(new HttpError("Unauthorized.", 403));

    if (!staffId) {
      return next(new HttpError("Staff ID is required.", 400));
    }

    const { data: users } = await supabase
      .from("user")
      .select("*")
      .eq("id", staffId);

    const existingUserData = users[0];

    return res.status(200).json(existingUserData);
  } catch (error) {
    console.error("Get Staff By ID Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getAllStaff = async (req, res, next) => {
  try {
    const adminFarmId = res.locals.farmId;
    const role = res.locals.role;
    const userId = res.locals.authData.sub;
    if (role !== "ADMIN") return next(new HttpError("Unauthorized.", 403));

    const { data: staffData, error: staffError } = await supabase
      .from("user")
      .select("id, first_name, last_name, role, email")
      .eq("farm_id", adminFarmId)
      .neq("id", userId);
    if (staffError) {
      console.error("Supabase Get All Staff Error:", staffError);
      return next(new HttpError(staffError.message, 400));
    }

    return res.status(200).json({ staff: staffData });
  } catch (error) {
    console.error("Get All Staff Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { firstName, lastName, role } = req.body;
    const adminFarmId = res.locals.farmId;
    const resRole = res.locals.role;
    if (resRole !== "ADMIN") return next(new HttpError("Unauthorized.", 403));

    if (!staffId) {
      return next(new HttpError("Staff ID is required.", 400));
    }

    const { data: users } = await supabase
      .from("user")
      .select("*")
      .eq("id", staffId);

    const existingUserData = users[0];

    if (!existingUserData) return next(new HttpError("Staff  not found.", 404));
    if (existingUserData.farm_id !== adminFarmId)
      return next(new HttpError("Access denied", 403));

    const { error: updateError } = await supabase
      .from("user")
      .update({
        first_name: firstName || existingUserData.first_name,
        last_name: lastName || existingUserData.last_name,
        role: role || existingUserData.role,
      })
      .eq("id", staffId);
    if (updateError) return next(new HttpError(updateError.message, 400));

    const prev = existingUserData;
    const nextState = {
      ...prev,
      first_name: firstName || existingUserData.first_name,
      last_name: lastName || existingUserData.last_name,
      role: role || existingUserData.role,
    };
    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "update",
      resourceType: "staff",
      resourceId: staffId,
      previous: prev,
      changes: computeDiff(prev, nextState, staffFields),
      next: nextState,
      farmId: adminFarmId,
    });

    return res.status(200).json({
      message: "Staff member updated successfully",
    });
  } catch (error) {
    return next(new HttpError("Internal server error", 500));
  }
};
export const deleteStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const adminFarmId = res.locals.farmId;
    const resRole = res.locals.role;
    if (resRole !== "ADMIN") return next(new HttpError("Unauthorized.", 403));

    if (!staffId) {
      return next(new HttpError("Staff ID is required.", 400));
    }

    const { data: user, error: userError } = await supabase
      .from("user")
      .select("*")
      .eq("id", staffId);

    const existingUserData = user[0];
    if (!existingUserData) return next(new HttpError("Staff not found.", 404));
    if (existingUserData.farm_id !== adminFarmId) {
      return next(new HttpError("Access denied", 403));
    }
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      staffId
    );

    if (deleteError) {
      console.error("Supabase Admin Delete User Error:", deleteError);
      return next(new HttpError("Could not delete staff member.", 500));
    }
    const { error: deleteProfileError } = await supabase
      .from("user")
      .delete()
      .eq("id", staffId);
    if (deleteProfileError) {
      return next(new HttpError("Could not delete staff member.", 500));
    }
    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "delete",
      resourceType: "staff",
      resourceId: staffId,
      previous: existingUserData,
      changes: { deleted: { from: false, to: true } },
      next: null,
      farmId: adminFarmId,
    });
    return res
      .status(200)
      .json({ message: "Staff member deleted successfully" });
  } catch (error) {
    console.error("Delete Staff Error:", error);
    if (error.message?.includes("invalid input syntax for type uuid")) {
      return next(new HttpError("Invalid Staff ID format.", 400));
    }
    return next(new HttpError("Internal server error", 500));
  }
};

export const getStaffCount = async (req, res, next) => {
  try {
    const adminFarmId = res.locals.farmId;

    const { count, error: countError } = await supabase
      .from("user")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", adminFarmId);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const { count: newCountLast7Days, error: newCountError } = await supabase
      .from("user")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", adminFarmId)
      .gte("created_at", sevenDaysAgoISO);

    if (newCountError || countError) {
      console.error("Supabase Get New Staff Count Error:", newCountError);
      return next(new HttpError(newCountError.message, 400));
    }

    return res
      .status(200)
      .json({ staff: { count: count || 0, newHires: newCountLast7Days } });
  } catch (error) {
    console.error("Get Staff Count Error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
