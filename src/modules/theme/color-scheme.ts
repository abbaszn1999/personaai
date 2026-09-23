export type ColorScheme = "dark" | "light";

export const COLOR_SCHEME_STORAGE_KEY = "persona-color-scheme";

/** Runs before paint from the root layout so the first frame already matches the saved choice. */
export const colorSchemeBootScript = `(function(){try{var t=localStorage.getItem("${COLOR_SCHEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t="dark";var r=document.documentElement;r.setAttribute("data-theme",t);r.style.colorScheme=t;}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;
