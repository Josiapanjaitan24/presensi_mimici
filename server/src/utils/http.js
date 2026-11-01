export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function sendError(res, status, message) {
  return res.status(status).json({ success: false, message });
}
