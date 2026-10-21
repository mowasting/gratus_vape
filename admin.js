// لوحة الأدمن: الطلبات، المنتجات، الإعدادات
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var FLAME =
    '<svg viewBox="0 0 60 120" fill="currentColor" aria-hidden="true"><path d="M38 4C24 28 44 44 40 68c-2 14-10 24-18 32 22-6 32-26 28-48C47 32 30 24 38 4Z"/><path d="M14 46C6 62 20 74 16 94c12-12 10-32-2-48Z"/></svg>';

  var STATUS = { new: "جديد", confirmed: "مؤكد", shipped: "تم الشحن", delivered: "تم التسليم", cancelled: "ملغي" };
  var PAY = { cod: "عند الاستلام", zaincash: "زين كاش", qicard: "كي كارد" };

  var orders = [];
  var products = [];
  var knownIds = null;
  var filter = "all";
  var sound = true;
  var audioCtx = null;
  var pollTimer = null;
  var channel = null;
  var editing = null;       // المنتج الذي يتم تعديله (null = جديد)
  var pendingImage = null;  // ملف الصورة الجديدة بعد التصغير

  /* ---------- تشغيل ---------- */

  if (!window.CONFIG_OK) {
    document.body.innerHTML =
      '<div class="login"><h1>الموقع غير مربوط بعد</h1><p class="hint" style="text-align:center">افتح الملف config.js وضع رابط مشروع Supabase والمفتاح العام، ثم حدّث الصفحة.</p></div>';
    return;
  }

  sb.auth.getSession().then(function (r) {
    if (r.data && r.data.session) checkAdmin();
    else showLogin();
  });

  function showLogin() {
    $("#app").hidden = true;
    $("#loginBox").hidden = false;
  }

  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#lBtn"), err = $("#lErr");
    err.textContent = "";
    btn.disabled = true;
    unlockAudio();
    sb.auth.signInWithPassword({ email: $("#lEmail").value.trim(), password: $("#lPass").value }).then(function (r) {
      btn.disabled = false;
      if (r.error) { err.textContent = "الايميل أو كلمة المرور غير صحيحة."; return; }
      checkAdmin();
    });
  });

  function checkAdmin() {
    sb.rpc("is_admin").then(function (r) {
      if (r.error || r.data !== true) {
        sb.auth.signOut();
        showLogin();
        $("#lErr").textContent = "هذا الحساب ليس أدمن. تأكد أنك شغّلت ملف 2-add-admin.sql بنفس الايميل.";
        return;
      }
      $("#loginBox").hidden = true;
      $("#app").hidden = false;
      startApp();
    });
  }

  $("#logoutBtn").addEventListener("click", function () {
    stopLive();
    sb.auth.signOut().then(function () { location.reload(); });
  });

  function startApp() {
    loadOrders(true);
    loadProducts();
    loadSettings();
    startLive();
  }

  /* ---------- التبويبات ---------- */

  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.toggle("on", x === t); });
      ["orders", "products", "settings"].forEach(function (n) {
        $("#tab-" + n).hidden = n !== t.getAttribute("data-tab");
      });
    });
  });

  /* ---------- الصوت ---------- */

  function unlockAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) {}
  }
  function beep() {
    if (!sound) return;
    try {
      unlockAudio();
      [0, 0.22].forEach(function (d, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = i ? 1100 : 820;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + d);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + d + 0.25);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(audioCtx.currentTime + d); o.stop(audioCtx.currentTime + d + 0.3);
      });
    } catch (e) {}
  }
  $("#soundBtn").addEventListener("click", function () {
    sound = !sound;
    this.textContent = "الصوت: " + (sound ? "يعمل" : "متوقف");
    this.setAttribute("aria-pressed", String(sound));
    if (sound) beep();
  });
  document.addEventListener("click", unlockAudio, { once: true });

  /* ---------- الطلبات ---------- */

  function startLive() {
    stopLive();
    channel = sb.channel("orders-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, function () { loadOrders(false); })
      .subscribe();
    pollTimer = setInterval(function () { loadOrders(false); }, 30000);
  }
  function stopLive() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function loadOrders(first) {
    return sb.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(300).then(function (r) {
      if (r.error) { $("#orders").innerHTML = '<p class="empty-adm">تعذر تحميل الطلبات: ' + esc(r.error.message) + "</p>"; return; }
      orders = r.data || [];
      var fresh = [];
      if (knownIds) orders.forEach(function (o) { if (!knownIds.has(o.id)) fresh.push(o); });
      knownIds = new Set(orders.map(function (o) { return o.id; }));
      if (fresh.length) {
        beep();
        toast("طلب جديد: #" + fresh[0].order_no + (fresh.length > 1 ? " و" + (fresh.length - 1) + " غيره" : ""));
      }
      renderChips();
      renderOrders();
      updateNewCount();
    });
  }

  function updateNewCount() {
    var n = orders.filter(function (o) { return o.status === "new"; }).length;
    var b = $("#newCount");
    b.textContent = n; b.hidden = n === 0;
    document.title = (n ? "(" + n + ") " : "") + "لوحة التحكم | Gratus Vape";
  }

  function renderChips() {
    var keys = ["all", "new", "confirmed", "shipped", "delivered", "cancelled"];
    $("#chips").innerHTML = keys.map(function (k) {
      var n = k === "all" ? orders.length : orders.filter(function (o) { return o.status === k; }).length;
      return '<button type="button" class="chip' + (k === filter ? " on" : "") + '" data-f="' + k + '">' + (k === "all" ? "الكل" : STATUS[k]) + " (" + n + ")</button>";
    }).join("");
  }
  $("#chips").addEventListener("click", function (e) {
    var c = e.target.closest("[data-f]");
    if (!c) return;
    filter = c.getAttribute("data-f");
    renderChips(); renderOrders();
  });

  function waLink(phone) {
    var p = String(phone).replace(/[^\d+]/g, "").replace(/^\+/, "");
    if (/^07\d{9}$/.test(p)) p = "964" + p.slice(1);
    return "https://wa.me/" + p;
  }

  function nextActions(status) {
    var a = [];
    if (status === "new") a.push(["confirmed", "تأكيد الطلب", "gold"]);
    if (status === "confirmed") a.push(["shipped", "تم الشحن", "gold"]);
    if (status === "shipped") a.push(["delivered", "تم التسليم", "gold"]);
    if (status === "cancelled") a.push(["new", "إعادة الطلب", ""]);
    if (status !== "cancelled" && status !== "delivered") a.push(["cancelled", "إلغاء", "danger"]);
    return a;
  }

  function renderOrders() {
    var list = orders.filter(function (o) { return filter === "all" || o.status === filter; });
    var box = $("#orders");
    if (!list.length) {
      box.innerHTML = '<p class="empty-adm">' + (orders.length ? "لا توجد طلبات بهذه الحالة." : "لا توجد طلبات بعد. أول طلب يوصل راح يظهر هنا مع صوت تنبيه.") + "</p>";
      return;
    }
    box.innerHTML = list.map(function (o) {
      var items = (o.order_items || []).map(function (i) {
        return "<li><span>" + esc(i.product_name) + " × " + i.quantity + "</span><span>" + fmt(i.unit_price * i.quantity) + "</span></li>";
      }).join("");
      var acts = nextActions(o.status).map(function (a) {
        return '<button type="button" class="btn small ' + a[2] + '" data-st="' + a[0] + '" data-id="' + esc(o.id) + '">' + a[1] + "</button>";
      }).join("");
      return '<article class="order' + (o.status === "new" ? " is-new" : "") + '">' +
        '<div class="order-top"><span class="no">#' + esc(o.order_no) + '</span><span class="badge ' + esc(o.status) + '">' + esc(STATUS[o.status] || o.status) + '</span><span class="when">' + esc(fmtDate(o.created_at)) + "</span></div>" +
        '<div class="order-cols"><dl>' +
          "<div><dt>الاسم</dt><dd>" + esc(o.customer_name) + "</dd></div>" +
          '<div><dt>الهاتف</dt><dd dir="ltr" style="text-align:right"><a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a> · <a href="' + esc(waLink(o.phone)) + '" target="_blank" rel="noopener">واتساب</a></dd></div>' +
          "<div><dt>المحافظة</dt><dd>" + esc(o.city) + "</dd></div>" +
          "<div><dt>العنوان</dt><dd>" + esc(o.address) + "</dd></div>" +
          (o.notes ? "<div><dt>ملاحظات</dt><dd>" + esc(o.notes) + "</dd></div>" : "") +
          "<div><dt>الدفع</dt><dd>" + esc(PAY[o.payment_method] || o.payment_method) + (o.payment_ref ? ' · رقم العملية: <span dir="ltr">' + esc(o.payment_ref) + "</span>" : "") + "</dd></div>" +
        "</dl><div><ul>" + items + '</ul><div class="totals"><div><span>المنتجات</span><span>' + fmt(o.subtotal) + "</span></div><div><span>التوصيل</span><span>" + (o.delivery_fee ? fmt(o.delivery_fee) : "مجاني") + '</span></div><div class="g"><span>الكلي</span><span>' + fmt(o.total) + "</span></div></div></div></div>" +
        '<div class="order-acts">' + acts + "</div></article>";
    }).join("");
  }

  $("#orders").addEventListener("click", function (e) {
    var b = e.target.closest("[data-st]");
    if (!b) return;
    var st = b.getAttribute("data-st");
    if (st === "cancelled" && !confirm("إلغاء هذا الطلب؟ راح ترجع الكمية للمخزن.")) return;
    b.disabled = true;
    sb.rpc("set_order_status", { p_id: b.getAttribute("data-id"), p_status: st }).then(function (r) {
      if (r.error) { toast(r.error.message, "bad"); b.disabled = false; return; }
      toast("تم تحديث الحالة");
      loadOrders(false);
      loadProducts();
    });
  });

  /* ---------- المنتجات ---------- */

  function loadProducts() {
    return sb.from("products").select("*").order("created_at", { ascending: false }).then(function (r) {
      if (r.error) { $("#ptable").innerHTML = "<tr><td>تعذر التحميل: " + esc(r.error.message) + "</td></tr>"; return; }
      products = r.data || [];
      renderProducts();
    });
  }

  function renderProducts() {
    $("#pCount").textContent = products.length + " منتج";
    if (!products.length) {
      $("#ptable").innerHTML = '<tr><td class="empty-adm">لا توجد منتجات. اضغط "إضافة منتج".</td></tr>';
      return;
    }
    $("#ptable").innerHTML =
      "<thead><tr><th></th><th>المنتج</th><th>السعر</th><th>المخزن</th><th class=\"hide-m\">الحالة</th><th></th></tr></thead><tbody>" +
      products.map(function (p) {
        var u = safeUrl(p.image_url);
        return '<tr class="' + (p.active ? "" : "off") + '"><td><div class="th">' + (u ? '<img src="' + esc(u) + '" alt="">' : FLAME) + "</div></td>" +
          "<td><b>" + esc(p.name) + '</b><br><span class="hint">' + esc(p.category) + "</span></td>" +
          "<td>" + fmt(p.price) + "</td><td>" + p.stock + '</td><td class="hide-m">' + (p.active ? "ظاهر" : "مخفي") + "</td>" +
          '<td><div class="acts"><button class="btn small" type="button" data-edit="' + esc(p.id) + '">تعديل</button>' +
          '<button class="btn small danger" type="button" data-del="' + esc(p.id) + '">حذف</button></div></td></tr>';
      }).join("") + "</tbody>";
  }

  $("#ptable").addEventListener("click", function (e) {
    var ed = e.target.closest("[data-edit]");
    if (ed) { openProductForm(products.find(function (p) { return p.id === ed.getAttribute("data-edit"); })); return; }
    var del = e.target.closest("[data-del]");
    if (del) {
      var p = products.find(function (x) { return x.id === del.getAttribute("data-del"); });
      if (!p || !confirm('حذف "' + p.name + '" نهائياً؟ (الطلبات القديمة تبقى محفوظة)')) return;
      sb.from("products").delete().eq("id", p.id).then(function (r) {
        if (r.error) { toast(r.error.message, "bad"); return; }
        toast("تم الحذف"); loadProducts();
      });
    }
  });

  $("#addProduct").addEventListener("click", function () { openProductForm(null); });

  function setPreview(url) {
    var u = safeUrl(url) || (url && String(url).indexOf("blob:") === 0 ? url : "");
    $("#pPrev").innerHTML = u ? '<img src="' + esc(u) + '" alt="">' : FLAME;
  }

  function openProductForm(p) {
    editing = p;
    pendingImage = null;
    $("#pmTitle").textContent = p ? "تعديل منتج" : "إضافة منتج";
    $("#pName").value = p ? p.name : "";
    $("#pDesc").value = p ? p.description : "";
    $("#pPrice").value = p ? p.price : "";
    $("#pStock").value = p ? p.stock : "";
    $("#pCat").value = p ? p.category : "";
    $("#pActive").checked = p ? p.active : true;
    $("#pFile").value = "";
    $("#pErr").textContent = "";
    setPreview(p ? p.image_url : "");
    $("#pModal").hidden = false;
    document.body.classList.add("lock");
  }
  function closeProductForm() {
    $("#pModal").hidden = true;
    document.body.classList.remove("lock");
  }
  $("#pmClose").addEventListener("click", closeProductForm);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeProductForm(); });

  // تصغير الصورة قبل الرفع لتوفير المساحة
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1200, w = img.width, h = img.height;
        var k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("تعذر معالجة الصورة")); }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("الملف ليس صورة صالحة")); };
      img.src = url;
    });
  }

  $("#pFile").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    shrink(f).then(function (blob) {
      pendingImage = blob;
      setPreview(URL.createObjectURL(blob));
    }).catch(function (e) { $("#pErr").textContent = e.message; });
  });

  $("#pForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#pErr"), btn = $("#pSave");
    err.textContent = "";
    var data = {
      name: $("#pName").value.trim(),
      description: $("#pDesc").value.trim(),
      price: parseInt($("#pPrice").value, 10),
      stock: parseInt($("#pStock").value, 10),
      category: $("#pCat").value.trim(),
      active: $("#pActive").checked
    };
    if (!data.name) { err.textContent = "اكتب اسم المنتج"; return; }
    if (!(data.price >= 0)) { err.textContent = "اكتب السعر"; return; }
    if (!(data.stock >= 0)) { err.textContent = "اكتب الكمية"; return; }
    if (!data.category) { err.textContent = "اكتب التصنيف"; return; }

    btn.disabled = true; btn.textContent = "جاري الحفظ...";

    var upload = Promise.resolve(editing ? editing.image_url : "");
    if (pendingImage) {
      var path = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".jpg";
      upload = sb.storage.from("products").upload(path, pendingImage, { contentType: "image/jpeg" }).then(function (r) {
        if (r.error) throw r.error;
        return sb.storage.from("products").getPublicUrl(path).data.publicUrl;
      });
    }

    upload.then(function (imageUrl) {
      data.image_url = imageUrl || "";
      return editing
        ? sb.from("products").update(data).eq("id", editing.id)
        : sb.from("products").insert(data);
    }).then(function (r) {
      btn.disabled = false; btn.textContent = "حفظ";
      if (r.error) { err.textContent = r.error.message; return; }
      closeProductForm();
      toast("تم الحفظ");
      loadProducts();
    }).catch(function (ex) {
      btn.disabled = false; btn.textContent = "حفظ";
      err.textContent = "تعذر رفع الصورة: " + (ex.message || ex);
    });
  });

  /* ---------- الإعدادات ---------- */

  function loadSettings() {
    sb.from("settings").select("*").then(function (r) {
      var s = {};
      (r.data || []).forEach(function (x) { s[x.key] = x.value; });
      $("#sFee").value = s.delivery_fee || "0";
      $("#sFree").value = s.free_delivery_over || "0";
      $("#sZain").value = s.zaincash_number || "";
      $("#sQi").value = s.qicard_number || "";
      $("#sPhone").value = s.shop_phone || "";
    });
  }

  $("#setForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#setErr");
    err.textContent = "";
    var fee = parseInt($("#sFee").value || "0", 10);
    var free = parseInt($("#sFree").value || "0", 10);
    if (!(fee >= 0) || !(free >= 0)) { err.textContent = "المبالغ لازم تكون أرقام صحيحة"; return; }
    var rows = [
      { key: "delivery_fee", value: String(fee) },
      { key: "free_delivery_over", value: String(free) },
      { key: "zaincash_number", value: $("#sZain").value.trim() },
      { key: "qicard_number", value: $("#sQi").value.trim() },
      { key: "shop_phone", value: $("#sPhone").value.trim() }
    ];
    sb.from("settings").upsert(rows).then(function (r) {
      if (r.error) { err.textContent = r.error.message; return; }
      toast("تم حفظ الإعدادات");
    });
  });
})();
