// src/services/authService.js
import api from '../api/axiosConfig';

// 🔐 Login tradicional con usuario y contraseña
export const login = async (username, password) => {
  try {
    const response = await api.post('/login', { username, password });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { message: 'Error de conexión' };
  }
};

// 🔐 Login con Google (correo + nombre desde Google)
export const loginWithGoogle = async (email, name) => {
  try {
    const response = await api.post('/login-google', { email, name });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : { message: 'Error de conexión' };
  }
};
