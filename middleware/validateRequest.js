import HttpError from "../utils/httpError.js";

export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      console.log(error);
      const formattedErrors = error.errors.map((err) => ({
        path: err.path.join("."),
        message: err.message,
      }));

      next(new HttpError("Validation failed", 400, formattedErrors));
    }
  };
};
