// المتجر: المنتجات، السلة، الطلب
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var FLAME =
    '<svg viewBox="0 0 60 120" fill="currentColor" aria-hidden="true"><path d="M38 4C24 28 44 44 40 68c-2 14-10 24-18 32 22-6 32-26 28-48C47 32 30 24 38 4Z"/><path d="M14 46C6 62 20 74 16 94c12-12 10-32-2-48Z"/></svg>';
  var PAY_LABELS = {
    cod: "الدفع عند الاستلام",
    zaincash: "زين كاش",
    qicard: "كي كارد"
  };
  var MAX_QTY = 20;

  var products = [];
  var settings = {};
  var cart = loadCart();
  var cat = "الكل";
  var query = "";
  var layers = 0;

  /* ---------- أدوات ---------- */

  function loadCart() {
    try {
      var raw = JSON.parse(localStorage.getItem("gv_cart") || "[]");
      if (!Array.isArray(raw)) return [];
      return raw
        .filter(function (l) { return l && typeof l.id === "string" && l.qty > 0; })
        .map(function (l) { return { id: l.id, qty: Math.min(Math.floor(l.qty), MAX_QTY) }; });
    } catch (e) { return []; }
  }
  function saveCart() {
    try { localStorage.setItem("gv_cart", JSON.stringify(cart)); } catch (e) {}
  }
  function num(key, def) {
    var v = settings[key];
    if (v === undefined || v === null || String(v).trim() === "") return def;
    var n = Number(v);
    return isFinite(n) ? n : def;
  }
  function byId(id) { return products.find(function (p) { return p.id === id; }); }
  function subtotal() {
    return cart.reduce(function (s, l) {
      var p = byId(l.id);
      return s + (p ? p.price * l.qty : 0);
    }, 0);
  }
  function deliveryFor(sub) {
    var fee = num("delivery_fee", 5000);
    var free = num("free_delivery_over", 0);
    return free > 0 && sub >= free ? 0 : fee;
  }
  function imgHtml(p) {
    var u = safeUrl(p.image_url);
    return u ? '<img src="' + esc(u) + '" alt="' + esc(p.name) + '" loading="lazy">' : FLAME;
  }
  function syncLock() {
    document.body.classList.toggle("lock", layers > 0);
  }

  /* ---------- بوابة العمر ---------- */

  function ageGate() {
    var gate = $("#agegate");
    var ok = false;
    try { ok = localStorage.getItem("gv_18") === "1"; } catch (e) {}
    if (ok) { gate.remove(); return; }
    layers++; syncLock();
    $("#ageYes").onclick = function () {
      try { localStorage.setItem("gv_18", "1"); } catch (e) {}
      gate.remove(); layers--; syncLock();
    };
    $("#ageNo").onclick = function () {
      $("#ageMain").hidden = true;
      $("#ageDeny").hidden = false;
    };
    $("#ageYes").focus();
  }

  /* ---------- عرض المنتجات ---------- */

  function renderCats() {
    var set = [];
    products.forEach(function (p) { if (p.category && set.indexOf(p.category) < 0) set.push(p.category); });
    var all = ["الكل"].concat(set);
    if (all.indexOf(cat) < 0) cat = "الكل";
    $("#cats").innerHTML = all.map(function (c) {
      return '<button type="button" class="cat-btn' + (c === cat ? " on" : "") + '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
  }

  function renderGrid() {
    var q = query.trim().toLowerCase();
    var list = products.filter(function (p) {
      if (cat !== "الكل" && p.category !== cat) return false;
      if (!q) return true;
      return (p.name + " " + p.description + " " + p.category).toLowerCase().indexOf(q) >= 0;
    });
    var grid = $("#grid");
    if (!products.length) {
      grid.innerHTML = '<p class="state-msg"><b>لا توجد منتجات حالياً.</b><br>ارجع قريباً، نضيف منتجات جديدة باستمرار.</p>';
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<p class="state-msg"><b>ما لقينا شي بهذا البحث.</b><br>جرب كلمة ثانية أو اختر "الكل".</p>';
      return;
    }
    grid.innerHTML = list.map(function (p) {
      var out = p.stock <= 0;
      return '<article class="tile">' +
        '<div class="tile-img" data-open="' + esc(p.id) + '">' + imgHtml(p) + (out ? '<span class="tag-out">نفدت الكمية</span>' : "") + "</div>" +
        '<div class="tile-body">' +
          '<span class="cat">' + esc(p.category) + "</span>" +
          '<h3 data-open="' + esc(p.id) + '">' + esc(p.name) + "</h3>" +
          '<span class="price">' + fmt(p.price) + "</span>" +
          '<div class="buy"><button type="button" class="btn block" data-add="' + esc(p.id) + '"' + (out ? " disabled" : "") + ">" + (out ? "غير متوفر" : "أضف للسلة") + "</button></div>" +
        "</div></article>";
    }).join("");
  }

  function renderInfo() {
    var fee = num("delivery_fee", 5000);
    var free = num("free_delivery_over", 0);
    var d = "لكل المحافظات. أجرة التوصيل " + fmt(fee) + (free > 0 ? "، ومجاناً للطلبات من " + fmt(free) + " فأكثر" : "") + ". نتصل بك لتأكيد الطلب قبل الإرسال.";
    $("#infoDelivery").textContent = d;
    var pays = ["الدفع عند الاستلام"];
    if (settings.zaincash_number) pays.push("زين كاش");
    if (settings.qicard_number) pays.push("كي كارد");
    $("#infoPay").textContent = pays.join("، ") + ".";
    var ph = (settings.shop_phone || "").trim();
    var a = $("#footPhone");
    if (ph) {
      a.textContent = "للتواصل: " + ph;
      a.href = "tel:" + ph.replace(/[^\d+]/g, "");
      a.hidden = false;
    }
  }

  /* ---------- السلة ---------- */

  function reconcileCart() {
    cart = cart.filter(function (l) { return byId(l.id) && byId(l.id).stock > 0; });
    cart.forEach(function (l) { l.qty = Math.min(l.qty, byId(l.id).stock, MAX_QTY); });
    saveCart();
  }

  function addToCart(id, n) {
    var p = byId(id);
    if (!p) return;
    var line = cart.find(function (l) { return l.id === id; });
    var cur = line ? line.qty : 0;
    var next = Math.min(cur + n, p.stock, MAX_QTY);
    if (next <= cur) {
      toast(p.stock <= cur ? "وصلت لأقصى كمية متوفرة" : "الحد الأقصى " + MAX_QTY + " قطعة", "warn");
      return;
    }
    if (line) line.qty = next; else cart.push({ id: id, qty: next });
    saveCart(); renderCart();
    var c = $("#cartCount");
    c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
    toast("أضيف إلى السلة");
  }

  function setQty(id, qty) {
    var p = byId(id);
    var line = cart.find(function (l) { return l.id === id; });
    if (!p || !line) return;
    if (qty <= 0) { cart = cart.filter(function (l) { return l.id !== id; }); }
    else {
      if (qty > p.stock) { toast("المتوفر " + p.stock + " فقط", "warn"); qty = p.stock; }
      line.qty = Math.min(qty, MAX_QTY);
    }
    saveCart(); renderCart();
  }

  function renderCart() {
    var count = cart.reduce(function (s, l) { return s + l.qty; }, 0);
    $("#cartCount").textContent = count;
    var box = $("#cartItems");
    if (!cart.length) {
      box.innerHTML = '<p class="state-msg"><b>السلة فارغة.</b><br>اختر منتجاً من القائمة وأضفه هنا.</p>';
    } else {
      box.innerHTML = cart.map(function (l) {
        var p = byId(l.id);
        if (!p) return "";
        return '<div class="line">' +
          '<div class="thumb">' + imgHtml(p) + "</div>" +
          "<div><h4>" + esc(p.name) + '</h4><div class="u">' + fmt(p.price) + "</div>" +
          '<button type="button" class="rm" data-rm="' + esc(p.id) + '">حذف</button></div>' +
          '<div class="qty"><button type="button" data-inc="' + esc(p.id) + '" aria-label="زيادة">+</button><span>' + l.qty +
          '</span><button type="button" data-dec="' + esc(p.id) + '" aria-label="تقليل">−</button></div></div>';
      }).join("");
    }
    var sub = subtotal();
    $("#cartSub").textContent = fmt(sub);
    var hint = $("#cartHint");
    var free = num("free_delivery_over", 0);
    if (!cart.length) hint.textContent = "";
    else if (free > 0 && sub < free) hint.textContent = "أضف " + fmt(free - sub) + " للحصول على توصيل مجاني.";
    else if (free > 0) hint.textContent = "التوصيل مجاني لهذا الطلب.";
    else hint.textContent = "أجرة التوصيل " + fmt(num("delivery_fee", 5000)) + " تُضاف عند إتمام الطلب.";
    $("#checkoutBtn").disabled = !cart.length;
  }

  function openDrawer() {
    $("#drawer").classList.add("on"); $("#scrim").classList.add("on");
    $("#drawer").setAttribute("aria-hidden", "false");
    layers++; syncLock(); $("#closeCart").focus();
  }
  function closeDrawer() {
    if (!$("#drawer").classList.contains("on")) return;
    $("#drawer").classList.remove("on"); $("#scrim").classList.remove("on");
    $("#drawer").setAttribute("aria-hidden", "true");
    layers--; syncLock();
  }

  /* ---------- النوافذ ---------- */

  function openModal(el) { el.hidden = false; layers++; syncLock(); }
  function closeModal(el) {
    if (el.hidden) return;
    el.hidden = true; layers--; syncLock();
  }

  function openProduct(id) {
    var p = byId(id);
    if (!p) return;
    var out = p.stock <= 0;
    var stockLine = out
      ? '<p class="stockline out">نفدت الكمية</p>'
      : p.stock <= 5 ? '<p class="stockline low">بقي ' + p.stock + " فقط</p>" : '<p class="stockline">متوفر</p>';
    $("#pView").innerHTML =
      '<div class="pimg">' + imgHtml(p) + "</div>" +
      "<div><h2 id=\"pName\">" + esc(p.name) + "</h2>" +
      '<span class="cat" style="color:var(--muted)">' + esc(p.category) + "</span>" +
      '<p class="price" style="font-size:24px;margin-top:6px">' + fmt(p.price) + "</p>" +
      '<p class="desc">' + esc(p.description || "") + "</p>" + stockLine +
      '<div class="buyrow"><button type="button" class="btn gold" data-add-close="' + esc(p.id) + '"' + (out ? " disabled" : "") + ">" + (out ? "غير متوفر" : "أضف للسلة") + "</button></div></div>";
    openModal($("#pModal"));
  }

  /* ---------- إتمام الطلب ---------- */

  function payOptions() {
    var opts = [{ id: "cod", title: "الدفع عند الاستلام", sub: "تدفع للمندوب عند وصول الطلب" }];
    if (settings.zaincash_number) opts.push({ id: "zaincash", title: "زين كاش", sub: "حوّل المبلغ ثم اكتب رقم العملية" });
    if (settings.qicard_number) opts.push({ id: "qicard", title: "كي كارد", sub: "حوّل المبلغ ثم اكتب رقم العملية" });
    return opts;
  }

  function selectedPay() {
    var r = document.querySelector('input[name="pay"]:checked');
    return r ? r.value : "cod";
  }

  function renderSummary() {
    var sub = subtotal();
    var del = deliveryFor(sub);
    $("#sum").innerHTML =
      "<div><span>المنتجات</span><span>" + fmt(sub) + "</span></div>" +
      "<div><span>التوصيل</span><span>" + (del === 0 ? "مجاني" : fmt(del)) + "</span></div>" +
      '<div class="grand"><span>الكلي</span><b>' + fmt(sub + del) + "</b></div>";
    updatePayBox();
  }

  function updatePayBox() {
    var m = selectedPay();
    var box = $("#payBox");
    var ref = $("#refField");
    if (m === "cod") { box.hidden = true; ref.hidden = true; return; }
    var number = m === "zaincash" ? settings.zaincash_number : settings.qicard_number;
    var total = subtotal() + deliveryFor(subtotal());
    box.innerHTML = "حوّل <b>" + fmt(total) + "</b> عبر " + esc(PAY_LABELS[m]) + " إلى الرقم<br><strong>" + esc(number) + "</strong><br>ثم اكتب رقم العملية بالحقل التالي.";
    box.hidden = false; ref.hidden = false;
  }

  function openCheckout() {
    if (!cart.length) return;
    closeDrawer();
    $("#cFormWrap").hidden = false; $("#cDone").hidden = true;
    $("#cErr").textContent = "";
    var opts = payOptions();
    $("#pays").innerHTML = opts.map(function (o, i) {
      return '<label class="pay"><input type="radio" name="pay" value="' + o.id + '"' + (i === 0 ? " checked" : "") + "><span><b>" + o.title + "</b><small>" + o.sub + "</small></span></label>";
    }).join("");
    renderSummary();
    openModal($("#cModal"));
    $("#fName").focus();
  }

  function showDone(orderNo, method) {
    var extra = method === "cod"
      ? "سنتصل بك على رقم هاتفك لتأكيد الطلب، وتدفع للمندوب عند الاستلام."
      : "سنتحقق من التحويل ونتصل بك لتأكيد الطلب.";
    $("#cFormWrap").hidden = true;
    var d = $("#cDone");
    d.innerHTML =
      '<h2 style="padding:0;margin-bottom:0">تم استلام طلبك</h2><div class="no">#' + esc(orderNo) + "</div><p>" + extra +
      "</p><p>احتفظ برقم الطلب للمراجعة.</p>" +
      '<button type="button" class="btn gold" style="margin-top:14px" data-close>متابعة التسوق</button>';
    d.hidden = false;
  }

  function submitOrder(ev) {
    ev.preventDefault();
    var err = $("#cErr");
    err.textContent = "";
    var name = $("#fName").value.trim();
    var phone = $("#fPhone").value.replace(/\s/g, "");
    var city = $("#fCity").value;
    var addr = $("#fAddr").value.trim();
    var method = selectedPay();
    var ref = $("#fRef").value.trim();

    if (name.length < 2) return fail("اكتب اسمك الكامل", "#fName");
    if (!/^(\+?964|0)7\d{9}$/.test(phone)) return fail("رقم الهاتف غير صحيح. مثال: 07701234567", "#fPhone");
    if (!city) return fail("اختر المحافظة", "#fCity");
    if (addr.length < 5) return fail("اكتب عنوان التوصيل بالتفصيل", "#fAddr");
    if (method !== "cod" && ref.length < 4) return fail("اكتب رقم عملية التحويل", "#fRef");
    if (!$("#fAge").checked) return fail("لازم تأكد أن عمرك 18 سنة أو أكثر", "#fAge");

    function fail(msg, sel) { err.textContent = msg; $(sel).focus(); }

    var btn = $("#sendBtn");
    btn.disabled = true; btn.textContent = "جاري إرسال الطلب...";

    sb.rpc("place_order", {
      p_name: name,
      p_phone: phone,
      p_city: city,
      p_address: addr,
      p_notes: $("#fNotes").value.trim(),
      p_payment_method: method,
      p_payment_ref: method === "cod" ? "" : ref,
      p_items: cart.map(function (l) { return { id: l.id, qty: l.qty }; })
    }).then(function (res) {
      btn.disabled = false; btn.textContent = "تأكيد الطلب";
      if (res.error) {
        err.textContent = res.error.message || "صار خطأ. حاول مرة ثانية.";
        loadData(true);
        return;
      }
      cart = []; saveCart(); renderCart();
      showDone(res.data, method);
      loadData(true);
    }).catch(function () {
      btn.disabled = false; btn.textContent = "تأكيد الطلب";
      err.textContent = "تعذر الاتصال بالانترنت. حاول مرة ثانية.";
    });
  }

  /* ---------- تحميل البيانات ---------- */

  function loadData(silent) {
    return Promise.all([
      sb.from("products").select("*").eq("active", true).order("created_at", { ascending: false }),
      sb.from("settings").select("*")
    ]).then(function (r) {
      var p = r[0], s = r[1];
      if (p.error) {
        if (!silent) $("#grid").innerHTML = '<p class="state-msg"><b>تعذر تحميل المنتجات.</b><br>تأكد من اتصالك وحدّث الصفحة.</p>';
        return;
      }
      products = p.data || [];
      settings = {};
      (s.data || []).forEach(function (row) { settings[row.key] = row.value; });
      reconcileCart(); renderCats(); renderGrid(); renderCart(); renderInfo();
    });
  }

  /* ---------- الأحداث ---------- */

  function bind() {
    $("#cats").addEventListener("click", function (e) {
      var b = e.target.closest("[data-cat]");
      if (!b) return;
      cat = b.getAttribute("data-cat");
      renderCats(); renderGrid();
    });
    $("#search").addEventListener("input", function (e) { query = e.target.value; renderGrid(); });

    $("#grid").addEventListener("click", function (e) {
      var a = e.target.closest("[data-add]");
      if (a) { addToCart(a.getAttribute("data-add"), 1); return; }
      var o = e.target.closest("[data-open]");
      if (o) openProduct(o.getAttribute("data-open"));
    });

    $("#pView").addEventListener("click", function (e) {
      var a = e.target.closest("[data-add-close]");
      if (!a) return;
      addToCart(a.getAttribute("data-add-close"), 1);
      closeModal($("#pModal"));
    });

    $("#cartBtn").addEventListener("click", openDrawer);
    $("#closeCart").addEventListener("click", closeDrawer);
    $("#scrim").addEventListener("click", closeDrawer);
    $("#cartItems").addEventListener("click", function (e) {
      var t = e.target.closest("[data-inc],[data-dec],[data-rm]");
      if (!t) return;
      var id = t.getAttribute("data-inc") || t.getAttribute("data-dec") || t.getAttribute("data-rm");
      var line = cart.find(function (l) { return l.id === id; });
      if (!line) return;
      if (t.hasAttribute("data-inc")) setQty(id, line.qty + 1);
      else if (t.hasAttribute("data-dec")) setQty(id, line.qty - 1);
      else setQty(id, 0);
    });
    $("#checkoutBtn").addEventListener("click", openCheckout);

    $("#pays").addEventListener("change", updatePayBox);
    $("#cForm").addEventListener("submit", submitOrder);

    document.addEventListener("click", function (e) {
      var c = e.target.closest("[data-close]");
      if (c) { var m = c.closest(".modal"); if (m) closeModal(m); return; }
      if (e.target.classList && e.target.classList.contains("modal")) closeModal(e.target);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      closeModal($("#pModal")); closeModal($("#cModal")); closeDrawer();
    });
  }

  /* ---------- تشغيل ---------- */

  ageGate();
  bind();
  renderCart();

  if (!window.CONFIG_OK) {
    $("#grid").innerHTML =
      '<p class="state-msg"><b>الموقع غير مربوط بقاعدة البيانات بعد.</b><br>افتح الملف config.js وضع رابط مشروع Supabase والمفتاح العام.</p>';
    return;
  }
  loadData(false);
})();
