const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 📌 Autenticación segura con Google
exports.autenticarConGoogle = async (req, res) => {
  try {
    const { idToken } = req.body; // viene del frontend como credentialResponse.credential
    if (!idToken) {
      return res.status(400).json({ success: false, message: "ID Token requerido" });
    }

    // Verificar token con Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;   // identificador único
    const email = payload.email;    // correo del cliente
    const name = payload.name;      // nombre del cliente

    // Generar token propio de la app
    const appToken = jwt.sign(
      { googleId, email, name, tipo: "cliente_externo" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      message: "Autenticación con Google exitosa",
      token: appToken,
      name,     // 👈 agregado
      email     // 👈 agregado
    });
  } catch (error) {
    console.error("Error verificando ID Token de Google:", error);
    return res.status(401).json({ success: false, message: "Token de Google inválido" });
  }
};
