// أدوات مشتركة بين المتجر ولوحة الأدمن
(function () {
  var cfg = window.APP_CONFIG || {};
  var ok =
    typeof cfg.SUPABASE_URL === "string" &&
    /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.SUPABASE_URL.trim()) &&
    typeof cfg.SUPABASE_ANON_KEY === "string" &&
    cfg.SUPABASE_ANON_KEY.trim().length > 40;

  window.CONFIG_OK = ok;
  window.sb = ok && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL.trim(), cfg.SUPABASE_ANON_KEY.trim())
    : null;

  window.fmt = function (n) {
    return Number(n || 0).toLocaleString("en-US") + " د.ع";
  };

  window.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  window.safeUrl = function (u) {
    u = String(u || "").trim();
    return /^https:\/\//i.test(u) ? u : "";
  };

  window.fmtDate = function (iso) {
    var d = new Date(iso);
    try {
      return d.toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
    } catch (e) {
      return d.toLocaleString();
    }
  };

  var toastTimer;
  window.toast = function (msg, kind) {
    var el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = "show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.className = "";
    }, 2600);
  };
})();
