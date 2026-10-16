
const API_URL = "http://127.0.0.1:5001/api";

export async function login(identitas, kataSandi) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identitas,
      kata_sandi: kataSandi,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login gagal.");
  }

  return data;
}

export async function getProfil(token) {
  const response = await fetch(`${API_URL}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Gagal mengambil profil.");
  }

  return data;
}