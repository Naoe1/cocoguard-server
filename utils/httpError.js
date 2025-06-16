export default class HttpError extends Error {
  constructor(message, errCode, validationErrors = null) {
    super(message);
    this.code = errCode;
    this.validationErrors = validationErrors;
  }
}
