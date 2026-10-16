// Classic script in <head>: MV3 forbids inline scripts, and a module would run
// after the first paint and flash the wrong theme.
try {
  const theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }
} catch {}
