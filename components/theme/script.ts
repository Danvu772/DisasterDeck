// Shared by the server layout (runs it before paint) and the client toggle. Not a client module,
// so the server gets the string itself.
export const THEME_KEY = "desk.theme";

export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;
