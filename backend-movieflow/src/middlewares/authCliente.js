const jwt = require("jsonwebtoken");

/**
 * 📌 Middleware para verificar token de clientes externos (Google)
 */
exports.verificarTokenCliente = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return res.status(403).json({ message: "Token requerido" });
    }

    const token = authHeader.split(" ")[1]; // formato: Bearer <token>

    if (!token) {
      return res.status(403).json({ message: "Token no proporcionado" });
    }

    // Verificar token con la clave secreta de tu .env
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Guardar info del cliente en la request para usar en controladores
    req.cliente = decoded; // contiene googleId, email, name, tipo
    next();
  } catch (error) {
    console.error("Error verificando token del cliente:", error);
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
};
