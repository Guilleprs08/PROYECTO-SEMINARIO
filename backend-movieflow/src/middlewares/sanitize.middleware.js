// middlewares/sanitize.middleware.js
const sanitize = (req, res, next) => {
  const sanitizeText = (str) => {
    if (typeof str !== "string") return str;
    return str
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // sanitizar body
  if (req.body) {
    for (const key in req.body) {
      req.body[key] = sanitizeText(req.body[key]);
    }
  }

  // sanitizar query
  if (req.query) {
    for (const key in req.query) {
      req.query[key] = sanitizeText(req.query[key]);
    }
  }

  next();
};

module.exports = sanitize;
