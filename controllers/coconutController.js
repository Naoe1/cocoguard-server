import supabase from "../supabase.js";
import HttpError from "../utils/httpError.js";
import axios from "axios";
import fs from "fs";
import { recordAuditEvent, computeDiff } from "../utils/auditLogs.js";

const coconutFields = [
  "tree_code",
  "trunk_diameter",
  "planting_date",
  "height",
  "status",
];

export const getAllCoconuts = async (req, res, next) => {
  const farmId = res.locals.farmId;
  try {
    const { data, error } = await supabase
      .from("tree")
      .select(`*,harvest(total_weight,harvest_date)`)
      .eq("farm_id", farmId)
      .order("harvest_date", { referencedTable: "harvest", ascending: false })
      .limit(1, { referencedTable: "harvest" })
      .order("updated_at", { ascending: false });

    if (error) {
      console.log("Error fetching coconuts:", error);
      return next(new HttpError(error.message, 400));
    }

    return res.status(200).json({ coconuts: data });
  } catch (error) {
    console.error("Get coconuts error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getCoconutById = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const { coconutId } = req.params;

    if (!coconutId || isNaN(coconutId) === "undefined") {
      return next(new HttpError("Coconut ID is required", 400));
    }

    const { data, error } = await supabase
      .from("tree")
      .select("*")
      .eq("id", coconutId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }
    const coconut = data[0];
    if (!coconut) {
      return res.status(404).json({ message: "Coconut not found" });
    }

    if (coconut.farm_id !== farmId) {
      return res
        .status(404)
        .json({ message: `No coconut with id ${coconutId} found` });
    }

    if (!coconut) {
      return res.status(404).json({ message: "Coconut not found" });
    }

    return res.status(200).json(coconut);
  } catch (error) {
    console.error("Get coconut error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const createCoconut = async (req, res, next) => {
  try {
    const { treeCode, trunkDiameter, plantingDate, height, status } = req.body;
    const farmId = res.locals.farmId;

    const { data: treeData, error: treeError } = await supabase
      .from("tree")
      .select("*")
      .eq("farm_id", farmId)
      .eq("tree_code", treeCode);

    const tree = treeData[0];
    if (treeError) {
      return next(new HttpError(treeError.message, 400));
    }
    if (tree) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [
          {
            field: "treeCode",
            message: "Tree code already exists",
          },
        ],
      });
    }

    const { data, error } = await supabase
      .from("tree")
      .insert({
        farm_id: farmId,
        tree_code: treeCode,
        trunk_diameter: trunkDiameter,
        planting_date: plantingDate,
        height,
        status,
      })
      .select()
      .single();

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "create",
      resourceType: "coconut",
      resourceId: data.id,
      previous: null,
      changes: computeDiff(null, data, coconutFields),
      next: data,
      farmId,
    });

    return res.status(201).json({
      message: "Coconut created successfully",
      coconut: data,
    });
  } catch (error) {
    console.error("Create coconut error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateCoconut = async (req, res, next) => {
  try {
    const { coconutId } = req.params;
    const { treeCode, trunkDiameter, plantingDate, height, status } = req.body;
    const farmId = res.locals.farmId;

    const { data: existingCoconut, error: findError } = await supabase
      .from("tree")
      .select("*")
      .eq("id", coconutId);

    if (!existingCoconut) {
      return res.status(404).json({ message: "Coconut not found" });
    }

    const coconut = existingCoconut[0];
    if (coconut.farm_id !== farmId) {
      return res.status(403).json({ message: `Forbidden` });
    }

    const { data: treeData, error: treeError } = await supabase
      .from("tree")
      .select("*")
      .eq("farm_id", farmId)
      .eq("tree_code", treeCode);

    const tree = treeData[0];
    if (treeError) {
      return next(new HttpError(treeError.message, 400));
    }

    if (tree && existingCoconut[0].tree_code !== treeCode) {
      return res.status(400).json({
        message: "Validation failed",
        errors: [
          {
            field: "treeCode",
            message: "Tree code already exists",
          },
        ],
      });
    }

    const { error } = await supabase
      .from("tree")
      .update({
        tree_code: treeCode,
        trunk_diameter: trunkDiameter,
        planting_date: plantingDate,
        height: height,
        status: status,
      })
      .eq("id", coconutId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    const nextState = {
      ...coconut,
      tree_code: treeCode,
      trunk_diameter: trunkDiameter,
      planting_date: plantingDate,
      height,
      status,
    };

    recordAuditEvent({
      actorId: res.locals.authData?.sub,
      action: "update",
      resourceType: "coconut",
      resourceId: coconutId,
      previous: coconut,
      changes: computeDiff(coconut, nextState, coconutFields),
      next: nextState,
      farmId,
    });

    return res.status(200).json({
      message: "Coconut updated successfully",
    });
  } catch (error) {
    console.error("Update coconut error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const deleteCoconut = async (req, res, next) => {
  try {
    const { coconutId } = req.params;
    const userId = res.locals.authData.sub;
    const farmId = res.locals.farmId;

    const { data: existingCoconut, error: findError } = await supabase
      .from("tree")
      .select("*")
      .eq("id", coconutId);

    if (!existingCoconut) {
      return res.status(404).json({ message: "Coconut not found" });
    }
    const coconut = existingCoconut[0];
    if (coconut.farm_id !== farmId) {
      return res.status(403).json({ message: `Forbidden` });
    }

    const { error } = await supabase.from("tree").delete().eq("id", coconutId);

    if (error) {
      return next(new HttpError(error.message, 400));
    }

    recordAuditEvent({
      actorId: userId,
      action: "delete",
      resourceType: "coconut",
      resourceId: coconutId,
      previous: coconut,
      changes: { deleted: { from: false, to: true } },
      next: null,
      farmId,
    });

    return res.status(200).json({
      message: "Coconut deleted successfully",
    });
  } catch (error) {
    console.error("Delete coconut error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getCoconutStatsById = async (req, res, next) => {
  try {
    const { coconutId } = req.params;
    const farmId = res.locals.farmId;

    const { data: treeData, error: treeError } = await supabase
      .from("tree")
      .select("id, farm_id")
      .eq("id", coconutId)
      .single();

    if (treeError) {
      if (treeError.code === "PGRST116") {
        return next(new HttpError("Coconut not found", 404));
      }
      return next(new HttpError(treeError.message, 400));
    }

    if (!treeData) {
      return next(new HttpError("Coconut not found", 404));
    }

    if (treeData.farm_id !== farmId) {
      return next(new HttpError("Forbidden", 403));
    }

    const { data: latestHarvests, error: harvestError } = await supabase
      .from("harvest")
      .select(
        "coconut_count, total_weight, estimated_value, harvest_date, created_at"
      )
      .eq("tree_id", coconutId)
      .order("created_at", { ascending: false })
      .limit(5);

    const formattedHarvests = latestHarvests.map((h) => ({
      ...h,
      harvest_date: h.harvest_date
        ? new Date(h.harvest_date).toISOString().split("T")[0]
        : null,
    }));

    const { data: latestTreatments, error: treatmentError } = await supabase
      .from("treatment")
      .select("*")
      .eq("applied_to", coconutId)
      .order("created_at", { ascending: false })
      .limit(5);

    const formattedTreatments = latestTreatments.map((t) => ({
      ...t,
      amount: `${t.amount} ${t.unit}`,
    }));

    const { data: latestNutrients, error: nutrientError } = await supabase
      .from("nutrient")
      .select("*")
      .eq("applied_to", coconutId)
      .order("created_at", { ascending: false })
      .limit(5);

    const formattedNutrients = latestNutrients.map((n) => ({
      ...n,
      amount: `${n.amount} ${n.unit}`,
    }));

    // Handle potential errors during fetches
    if (harvestError || treatmentError || nutrientError) {
      return next(new HttpError("Error fetching data", 400));
    }

    let allActivities = [];

    if (latestHarvests) {
      allActivities = allActivities.concat(
        latestHarvests.map((h) => ({
          ...h,
          type: "harvest",
          date: h.created_at,
        }))
      );
    }
    if (latestTreatments) {
      allActivities = allActivities.concat(
        latestTreatments.map((t) => ({
          ...t,
          type: "treatment",
          date: t.created_at,
        }))
      );
    }
    if (latestNutrients) {
      allActivities = allActivities.concat(
        latestNutrients.map((n) => ({
          ...n,
          type: "nutrient",
          date: n.created_at,
        }))
      );
    }

    allActivities.sort((a, b) => new Date(b.date) - new Date(a.date));

    const latestOverallActivities = allActivities.slice(0, 5);

    return res.status(200).json({
      latestOverallActivities: latestOverallActivities,
      latestHarvests: formattedHarvests || [],
      latestTreatments: formattedTreatments || [],
      latestNutrients: formattedNutrients || [],
    });
  } catch (error) {
    console.error("Get coconut stats error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const getCoconuStats = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;

    const { count: totalCount, error: totalCountError } = await supabase
      .from("tree")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", farmId);

    if (totalCountError) {
      console.error("Supabase Get Total Tree Count Error:", totalCountError);
      return next(new HttpError(totalCountError.message, 400));
    }

    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const oneMonthAgoISO = oneMonthAgo.toISOString();

    const { count: newTreesLastMonth, error: newTreesError } = await supabase
      .from("tree")
      .select("*", { count: "exact", head: true })
      .eq("farm_id", farmId)
      .gte("created_at", oneMonthAgoISO);

    if (newTreesError) {
      console.error("Supabase Get New Trees Count Error:", newTreesError);
      return next(new HttpError(newTreesError.message, 400));
    }
    const { data: totalHarvestWeight, error: weightError } = await supabase.rpc(
      "get_total_harvest_weight",
      {
        farm_id_param: farmId,
      }
    );

    if (weightError) {
      return next(new HttpError(weightError.message, 400));
    }

    return res.status(200).json({
      coconut: {
        count: totalCount || 0,
        newTrees: newTreesLastMonth || 0,
        totalHarvestWeight,
      },
    });
  } catch (error) {
    return next(new HttpError("Internal server error", 500));
  }
};

export const checkDisease = async (req, res, next) => {
  if (!req.file) {
    return next(new HttpError("No image file uploaded", 400));
  }
  try {
    const filePath = req.file.path;
    const treeId = req.body.treeId;
    const image = fs.readFileSync(filePath, {
      encoding: "base64",
    });

    const url = process.env.ROBOFLOW_URL;
    const response = await axios(url, {
      method: "POST",
      data: image,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const data = await response.data;
    if (data.predictions.length > 0) {
      let uniqueDisease = [...new Set(data.predictions.map((p) => p.class))];
      const { data: tree, error: treeErr } = await supabase
        .from("tree")
        .update({ status: "Diseased", disease: uniqueDisease })
        .eq("id", treeId)
        .select();
      if (treeErr) next(new HttpError(error.message, 400));
    }
    fs.unlinkSync(filePath);
    res.status(200).json(data);
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error(
          "Error cleaning up file after check disease error:",
          unlinkError
        );
      }
    }
    console.error("Check disease error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};

export const updateCoconutLayout = async (req, res, next) => {
  try {
    const farmId = res.locals.farmId;
    const layout = req.body?.layout;

    const updates = layout
      .filter(
        (item) =>
          item &&
          typeof item.coconut_id !== "undefined" &&
          (typeof item.x === "number" || !isNaN(Number(item.x))) &&
          (typeof item.z === "number" || !isNaN(Number(item.z)))
      )
      .map((item) => ({
        coconut_id: Number(item.coconut_id),
        x: Number(item.x),
        z: Number(item.z),
      }));

    if (updates.length === 0) {
      return res.status(200).json({ message: "No valid updates", updated: [] });
    }

    const ids = [...new Set(updates.map((u) => u.coconut_id))];

    const { data: trees, error: fetchError } = await supabase
      .from("tree")
      .select("id, farm_id, coord, tree_code")
      .in("id", ids);

    if (fetchError) {
      return next(new HttpError(fetchError.message, 400));
    }

    if (!trees || trees.length !== ids.length) {
      const found = new Set((trees || []).map((t) => t.id));
      const missing = ids.filter((id) => !found.has(id));
      return next(
        new HttpError(`Coconuts not found: ${missing.join(", ")}`, 404)
      );
    }

    const forbidden = trees
      .filter((t) => t.farm_id !== farmId)
      .map((t) => t.id);
    if (forbidden.length) {
      return next(
        new HttpError(`Forbidden coconut ids: ${forbidden.join(", ")}`, 403)
      );
    }

    const dedupedMap = new Map();
    for (const u of updates) {
      dedupedMap.set(u.coconut_id, { x: u.x, z: u.z });
    }

    const treeMetaById = new Map(trees.map((t) => [t.id, t]));
    const upsertRows = Array.from(dedupedMap.entries()).map(([id, coord]) => {
      const meta = treeMetaById.get(Number(id));
      return {
        id: Number(id),
        farm_id: meta?.farm_id,
        tree_code: meta?.tree_code,
        coord: { x: Number(coord.x), z: Number(coord.z) },
      };
    });

    const { data: upserted, error: upsertError } = await supabase
      .from("tree")
      .upsert(upsertRows, { onConflict: "id", ignoreDuplicates: false })
      .select("id, coord");

    if (upsertError) {
      return next(new HttpError(upsertError.message, 400));
    }

    const results = (upserted || upsertRows).map((r) => ({
      id: r.id,
      coord: r.coord,
    }));

    return res.status(200).json({
      message: "Coconut layout updated",
      updated: results,
    });
  } catch (error) {
    console.error("Update coconut layout error:", error);
    return next(new HttpError("Internal server error", 500));
  }
};
