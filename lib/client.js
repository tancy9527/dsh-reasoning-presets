/**
 * dsh-reasoning-presets · 客户端半边
 *
 * 把官方模型菜单里的「推理等级」那一行改造成一条可拖动的滑条（含高亮刻度、
 * 能量层与星尘效果），而不是在输入框旁边再塞一个迷你控件。
 *
 * 定位方式（全部用官方语义属性，不猜 class）：
 *   <button aria-haspopup="menu" aria-expanded="true" aria-controls={`${id}-menu`}>
 *   <div role="menu" id={`${id}-menu`}>
 *     <button role="menuitem">模型 …</button>          ← 根面板第一行
 *     <button role="menuitem">推理等级 <span>High</span> <svg/></button>   ← 目标行
 *   子面板（模型列表 / 等级列表）用 menuitemradio，所以根面板恰好只有两个
 *   `button[role="menuitem"]` —— 这是主锚点。
 *
 * 三条纪律：
 *   1. 只动那一行：写 4 个内联样式（height / flex-wrap / padding-block）再 append
 *      一个容器；关菜单或卸载时逐个还原，不碰官方 class。
 *   2. fail-open：任何一步找不到（没有 aria-controls、不是两个 menuitem、会话
 *      作用域没就绪…）就什么都不做，绝不连累输入区。
 *   3. 绝不注入消息：不监听 agent/pre-step、不 append 会话事件。
 *
 * 收纳设计参考了 dsh-codex-effort-slider（MIT，作者 Microqian2th）在真实宿主里
 * 趟出来的锚点与还原顺序；本实现的滑条 DOM、动效与提交逻辑是独立重写的。
 */
window.__ModuleLoader__.load({
  id: "dsh-reasoning-presets",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    /* ════════════════════════════ 常量 ════════════════════════════ */

    var PACKAGE_ID = "dsh-reasoning-presets";
    var SLOT_NAME = "conversation.input.right";
    var ENTRY_ID = "reasoning-presets-effort";
    var ENTRY_ORDER = 40;

    var ROW_PADDING_BLOCK = "10px";
    var EFFORT_ROW_LABELS = ["推理等级", "Reasoning effort", "Reasoning", "Effort"];

    var MIN_LEVELS = 2;
    var RETRY_DELAYS = [60, 240, 540, 960, 1500, 3000, 3000];

    /* ⚠️ 这几个尺寸必须在 CSS 之前声明：样式表里是直接插值的，
     *    否则会写成 height:undefinedpx，真机轨道塌成 0 高。 */
    var TRACK_HEIGHT = 28;
    var KNOB_SIZE = 28;
    var KNOB_RADIUS = 14;

    var ENERGY_START = 1 / 3;
    var ENERGY_END = 2 / 3;
    var STAR_MAX = 10;
    var GOLDEN_RATIO = 0.6180339887498949;
    var STAR_DURATION_BASE = 6.2;
    var STAR_DURATION_MIN = 0.9;

    var COLOR_BLUE = [77, 147, 248];
    var COLOR_VIOLET = [147, 51, 234];

    var STYLE_MARKER = PACKAGE_ID;

    var LABELS = { title: "推理等级", failed: "切换失败" };

    var EMPTY_SNAPSHOT = { current: null, retainedEffort: undefined, groups: [], status: "idle" };

    /* ════════════════════════════ 样式 ════════════════════════════ */

    var CSS = [
      ".rp-inline{flex:1 0 100%;width:100%;margin-top:6px;display:block;}",
      ".rp-track{position:relative;height:" + TRACK_HEIGHT + "px;border-radius:999px;",
      "background:var(--dsw-alias-border-l1,rgba(127,127,127,.22));cursor:pointer;touch-action:none;",
      "user-select:none;-webkit-user-select:none;outline:none;overflow:visible;}",
      ".rp-track:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d93f8);}",
      ".rp-fill{position:absolute;top:0;bottom:0;left:0;border-radius:999px;",
      "transition:width .18s cubic-bezier(.22,.61,.36,1),background .18s linear;}",
      ".rp-energy{position:absolute;top:0;bottom:0;left:0;border-radius:999px;overflow:hidden;",
      "pointer-events:none;opacity:var(--rp-energy,0);",
      "transition:width .18s cubic-bezier(.22,.61,.36,1),opacity .3s linear;background:transparent;}",
      ".rp-energy__glow{position:absolute;inset:0;",
      "background:radial-gradient(120% 160% at 0% 50%,rgba(147,51,234,.55),rgba(76,29,149,.15) 60%,transparent 75%);}",
      ".rp-energy__sweep{position:absolute;top:0;bottom:0;width:42%;",
      "background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);",
      "filter:blur(1px);animation:rp-sweep 2.6s linear infinite;}",
      "@keyframes rp-sweep{from{transform:translateX(-120%)}to{transform:translateX(320%)}}",
      ".rp-stars{position:absolute;top:0;bottom:0;left:0;border-radius:999px;overflow:hidden;",
      "pointer-events:none;transition:width .18s cubic-bezier(.22,.61,.36,1),opacity .3s linear;}",
      ".rp-star{position:absolute;left:0;width:2px;height:2px;border-radius:50%;",
      "background:rgba(255,255,255,.95);box-shadow:0 0 4px rgba(196,181,253,.95);",
      "animation-name:rp-drift;animation-timing-function:linear;animation-iteration-count:infinite;}",
      "@keyframes rp-drift{from{left:0}to{left:100%}}",
      ".rp-tick{position:absolute;top:50%;width:3px;height:3px;border-radius:50%;",
      "margin:-1.5px 0 0 -1.5px;background:rgba(255,255,255,.55);pointer-events:none;",
      "transition:background .18s linear;}",
      ".rp-tick[data-on='1']{background:rgba(255,255,255,.95);}",
      ".rp-knob{position:absolute;top:50%;width:" + KNOB_SIZE + "px;height:" + KNOB_SIZE + "px;",
      "margin:-" + KNOB_RADIUS + "px 0 0 -" + KNOB_RADIUS + "px;border-radius:50%;background:#fff;",
      "box-shadow:0 1px 2px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.18);pointer-events:none;",
      "transition:left .18s cubic-bezier(.22,.61,.36,1),box-shadow .25s linear,transform .12s ease-out;}",
      ".rp-track[data-drag='1'] .rp-fill,.rp-track[data-drag='1'] .rp-energy,",
      ".rp-track[data-drag='1'] .rp-stars,.rp-track[data-drag='1'] .rp-knob{transition:none;}",
      ".rp-track[data-drag='1'] .rp-knob{transform:scale(1.08);}",
      ".rp-root[data-energy='1'] .rp-knob{",
      "box-shadow:0 1px 2px rgba(0,0,0,.3),0 0 12px 2px rgba(147,51,234,.75),0 0 26px 6px rgba(109,40,217,.45);}",
      ".rp-root[data-busy='1'] .rp-track{opacity:.72;}",
      ".rp-error{margin-top:4px;font-size:11px;line-height:1.3;",
      "color:var(--dsw-alias-state-error-primary,#e5484d);}",
    ].join("");

    function installStyles() {
      try {
        var doc = typeof document !== "undefined" ? document : null;
        if (doc === null || doc.head === null) return;
        if (doc.querySelector('style[data-plugin-css="' + STYLE_MARKER + '"]') !== null) return;
        var style = doc.createElement("style");
        style.setAttribute("data-plugin-css", STYLE_MARKER);
        style.textContent = CSS;
        doc.head.appendChild(style);
      } catch (error) {
        /* 样式注入失败只影响观感 */
      }
    }

    /* ════════════════════════ 纯几何 / 快照 ════════════════════════ */

    function clamp01(value) {
      if (!(typeof value === "number") || value !== value) return 0;
      if (value < 0) return 0;
      if (value > 1) return 1;
      return value;
    }

    function levelPct(index, count) {
      if (!(count > 1)) return 0;
      return clamp01(index / (count - 1));
    }

    function nearestIndex(pct, count) {
      if (!(count > 1)) return 0;
      var raw = clamp01(pct) * (count - 1);
      var rounded = Math.round(raw);
      if (rounded < 0) return 0;
      if (rounded > count - 1) return count - 1;
      return rounded;
    }

    function knobOffsetOf(pct) {
      return (clamp01(pct) * 100).toFixed(2) + "%";
    }

    function energyFor(pct) {
      return clamp01((clamp01(pct) - ENERGY_START) / (ENERGY_END - ENERGY_START));
    }

    function starCountFor(pct) {
      var energy = energyFor(pct);
      if (energy <= 0) return 0;
      return Math.max(1, Math.round(energy * STAR_MAX));
    }

    function starGeometry(index) {
      var y = ((index * GOLDEN_RATIO) % 1) * 0.72 + 0.14;
      var brightness = 0.45 + (((index * 0.37) % 1) * 0.55);
      var duration = STAR_DURATION_BASE - ((index * 0.53) % 1) * (STAR_DURATION_BASE - STAR_DURATION_MIN);
      return {
        top: (y * 100).toFixed(2) + "%",
        brightness: brightness,
        duration: duration.toFixed(3) + "s",
        delay: (-((index * 0.29) % 1) * duration).toFixed(3) + "s",
      };
    }

    function mixColor(from, to, t) {
      var k = clamp01(t);
      var r = Math.round(from[0] + (to[0] - from[0]) * k);
      var g = Math.round(from[1] + (to[1] - from[1]) * k);
      var b = Math.round(from[2] + (to[2] - from[2]) * k);
      return "rgb(" + r + "," + g + "," + b + ")";
    }

    function colorForPct(pct) {
      return mixColor(COLOR_BLUE, COLOR_VIOLET, energyFor(pct));
    }

    function fillBackgroundFor(pct) {
      var end = colorForPct(pct);
      return "linear-gradient(90deg,rgb(77,147,248),rgb(" +
        Math.round(COLOR_BLUE[0] + (COLOR_VIOLET[0] - COLOR_BLUE[0]) * energyFor(pct) * 0.55) + "," +
        Math.round(COLOR_BLUE[1] + (COLOR_VIOLET[1] - COLOR_BLUE[1]) * energyFor(pct) * 0.55) + "," +
        Math.round(COLOR_BLUE[2] + (COLOR_VIOLET[2] - COLOR_BLUE[2]) * energyFor(pct) * 0.55) + ") 62%," +
        end + ")";
    }

    function modelOf(snapshot) {
      if (snapshot === null || typeof snapshot !== "object") return null;
      var current = snapshot.current;
      if (current === null || typeof current !== "object") return null;
      if (typeof current.provider !== "string" || typeof current.model !== "string") return null;
      return current;
    }

    function reasoningOf(snapshot, current) {
      if (snapshot === null || typeof snapshot !== "object") return null;
      var groups = Array.isArray(snapshot.groups) ? snapshot.groups : [];
      for (var i = 0; i < groups.length; i += 1) {
        var group = groups[i];
        if (group === null || typeof group !== "object") continue;
        if (typeof group.id === "string" && group.id !== current.provider) continue;
        var list = Array.isArray(group.models) ? group.models : [];
        for (var j = 0; j < list.length; j += 1) {
          var item = list[j];
          if (item === null || typeof item !== "object" || item.id !== current.model) continue;
          return item.reasoning || null;
        }
      }
      return null;
    }

    function levelListOf(reasoning) {
      if (reasoning === null || typeof reasoning !== "object") return [];
      var efforts = Array.isArray(reasoning.efforts) ? reasoning.efforts : [];
      var out = [];
      for (var i = 0; i < efforts.length; i += 1) {
        var effort = efforts[i];
        if (effort === null || typeof effort !== "object") continue;
        if (typeof effort.id !== "string") continue;
        out.push({ id: effort.id, name: typeof effort.name === "string" ? effort.name : effort.id });
      }
      return out;
    }

    function indexOfLevel(list, id) {
      if (typeof id !== "string") return -1;
      for (var i = 0; i < list.length; i += 1) {
        if (list[i].id === id) return i;
      }
      return -1;
    }

    /**
     * 一个快照 → 滑条需要的全部信息。
     * index 为 -1 表示「这个模型没有可选的档位」或「当前档位不在列表里」，
     * 调用方据此决定不显示滑条 —— 宁可不显示，也不显示一条假档位。
     */
    function levelsOf(snapshot) {
      var current = modelOf(snapshot);
      if (current === null) return { list: [], index: -1, effective: null, current: null, key: "" };
      var reasoning = reasoningOf(snapshot, current);
      var list = levelListOf(reasoning);
      var effective = typeof current.reasoningEffort === "string" ? current.reasoningEffort : null;
      if (effective === null && reasoning !== null && typeof reasoning.defaultEffort === "string") {
        effective = reasoning.defaultEffort;
      }
      if (effective === null && snapshot && typeof snapshot.retainedEffort === "string") {
        effective = snapshot.retainedEffort;
      }
      var index = indexOfLevel(list, effective);
      if (index < 0) {
        effective = null;
        index = -1;
      }
      var ids = [];
      for (var i = 0; i < list.length; i += 1) ids.push(list[i].id);
      return {
        list: list,
        index: index,
        effective: effective,
        current: current,
        key: current.provider + "/" + current.model + "#" + ids.join(","),
      };
    }

    function selectionFor(levels, index) {
      if (levels === null || levels.current === null) return null;
      var level = levels.list[index];
      if (level === undefined) return null;
      return {
        provider: levels.current.provider,
        model: levels.current.model,
        reasoningEffort: level.id,
      };
    }

    /* ═══════════════════════ DOM 适配（可注入/可测） ═══════════════════ */

    function firstSpanText(doc, element) {
      if (element === null || element === undefined) return "";
      if (typeof element.querySelectorAll !== "function") {
        return typeof element.textContent === "string" ? element.textContent : "";
      }
      var spans = element.querySelectorAll("span");
      for (var i = 0; i < spans.length; i += 1) {
        var text = spans[i].textContent;
        if (typeof text === "string" && text.replace(/\s+/g, "").length > 0) return text;
      }
      return typeof element.textContent === "string" ? element.textContent : "";
    }

    function makeDomOps(doc) {
      return {
        doc: doc,
        queryAll: function (selector) {
          if (doc === null || typeof doc.querySelectorAll !== "function") return [];
          var found = doc.querySelectorAll(selector);
          return typeof found.length === "number" ? found : [];
        },
        byId: function (id) {
          if (doc === null || typeof doc.getElementById !== "function") return null;
          return doc.getElementById(id);
        },
        attr: function (element, name) {
          if (element === null || element === undefined) return null;
          if (typeof element.getAttribute !== "function") return null;
          return element.getAttribute(name);
        },
        text: function (element) {
          return firstSpanText(doc, element);
        },
        create: function (tag) {
          if (doc === null || typeof doc.createElement !== "function") return null;
          return doc.createElement(tag);
        },
        append: function (parent, child) {
          if (parent === null || child === null) return;
          if (typeof parent.appendChild === "function") parent.appendChild(child);
        },
        remove: function (parent, child) {
          if (parent === null || child === null) return;
          if (typeof parent.removeChild === "function") parent.removeChild(child);
        },
        contains: function (element) {
          var root = doc !== null && doc !== undefined && doc.documentElement ? doc.documentElement : null;
          if (root === null || typeof root.contains !== "function") return false;
          return root.contains(element);
        },
      };
    }

    function matchesLabel(text, labels) {
      if (typeof text !== "string") return false;
      var flat = text.replace(/\s+/g, "");
      for (var i = 0; i < labels.length; i += 1) {
        if (flat.indexOf(labels[i].replace(/\s+/g, "")) >= 0) return true;
      }
      return false;
    }

    /**
     * 找到「菜单已经展开」的那一行。返回 { row, menu, seat } 或 null。
     * 只看 aria-expanded="true" 的席，靠它的 aria-controls 找到 portal 到 body 的菜单。
     */
    function findEffortRow(ops, labels) {
      var wanted = Array.isArray(labels) ? labels : EFFORT_ROW_LABELS;
      var seats = ops.queryAll('button[aria-haspopup="menu"][aria-expanded="true"]');
      for (var i = 0; i < seats.length; i += 1) {
        var seat = seats[i];
        var menuId = ops.attr(seat, "aria-controls");
        if (typeof menuId !== "string" || menuId.length === 0) continue;
        var menu = ops.byId(menuId);
        if (menu === null) continue;
        var items = typeof menu.querySelectorAll === "function" ? menu.querySelectorAll('button[role="menuitem"]') : [];
        if (items.length !== 2) continue; // 根面板恰好两行；子面板是 menuitemradio
        for (var j = 0; j < items.length; j += 1) {
          if (!matchesLabel(ops.text(items[j]), wanted)) continue;
          return { row: items[j], menu: menu, seat: seat };
        }
      }
      return null;
    }

    /** 官方那一行右侧的数值文字（用来在最高档染成紫罗兰）；找不到就返回 null。 */
    function findValueElement(ops, row) {
      if (row === null || typeof row.querySelectorAll !== "function") return null;
      var spans = row.querySelectorAll("span");
      var fallback = null;
      for (var i = 0; i < spans.length; i += 1) {
        var span = spans[i];
        var text = span.textContent;
        if (typeof text !== "string") continue;
        var flat = text.replace(/\s+/g, "");
        if (flat.length === 0 || flat.length > 24) continue;
        var cls = ops.attr(span, "class");
        if (typeof cls === "string" && /cellvalue|value/i.test(cls)) return span;
        fallback = span;
      }
      return fallback;
    }

    /* ═══════════════════════ 滑条 DOM 与视觉 ═══════════════════════ */

    function buildSlider(ops) {
      var root = ops.create("div");
      if (root === null) return null;
      root.className = "rp-root";
      root.setAttribute("data-rp-part", "root");

      var track = ops.create("div");
      if (track === null) return null;
      track.className = "rp-track";
      track.setAttribute("data-rp-part", "track");
      track.setAttribute("role", "slider");
      track.setAttribute("tabindex", "0");
      track.setAttribute("aria-label", LABELS.title);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", "0");

      var fill = ops.create("div");
      fill.className = "rp-fill";
      fill.setAttribute("data-rp-part", "fill");

      var energy = ops.create("div");
      energy.className = "rp-energy";
      energy.setAttribute("data-rp-part", "energy");
      var energyGlow = ops.create("div");
      energyGlow.className = "rp-energy__glow";
      var energySweep = ops.create("div");
      energySweep.className = "rp-energy__sweep";
      ops.append(energy, energyGlow);
      ops.append(energy, energySweep);

      var stars = ops.create("div");
      stars.className = "rp-stars";
      stars.setAttribute("data-rp-part", "stars");

      var knob = ops.create("div");
      knob.className = "rp-knob";
      knob.setAttribute("data-rp-part", "knob");

      ops.append(track, fill);
      ops.append(track, energy);
      ops.append(track, stars);
      ops.append(track, knob);
      ops.append(root, track);

      return {
        root: root,
        track: track,
        fill: fill,
        energy: energy,
        stars: stars,
        ticks: [],
        knob: knob,
      };
    }

    function syncTicks(ops, slider, count) {
      while (slider.ticks.length > count) {
        var extra = slider.ticks.pop();
        ops.remove(slider.track, extra);
      }
      while (slider.ticks.length < count) {
        var tick = ops.create("span");
        tick.className = "rp-tick";
        tick.setAttribute("data-rp-part", "tick");
        tick.setAttribute("data-on", "0");
        ops.append(slider.track, tick);
        slider.ticks.push(tick);
      }
    }

    function syncStars(ops, slider, count) {
      var existing = slider.stars.childNodes;
      var have = existing && typeof existing.length === "number" ? existing.length : 0;
      while (have > count) {
        ops.remove(slider.stars, slider.stars.lastChild);
        have -= 1;
      }
      while (have < count) {
        var star = ops.create("span");
        star.className = "rp-star";
        star.setAttribute("data-rp-part", "star");
        ops.append(slider.stars, star);
        have += 1;
      }
      for (var i = 0; i < count; i += 1) {
        var node = slider.stars.childNodes[i];
        if (node === undefined || node === null) continue;
        var geometry = starGeometry(i);
        if (node.style) {
          node.style.top = geometry.top;
          node.style.opacity = geometry.brightness.toFixed(3);
          node.style.animationDuration = geometry.duration;
          node.style.animationDelay = geometry.delay;
        }
      }
    }

    /**
     * 把「第 index 档、共 count 档、连续位置 pct」画出来。
     * pct 单独给是为了拖动过程中旋钮能停在两档之间（松手才吸附）。
     */
    function paintSlider(ops, slider, visual) {
      if (slider === null) return;
      var count = visual.count;
      var pct = clamp01(visual.pct);
      var offset = knobOffsetOf(pct);
      var energy = energyFor(pct);
      var stars = starCountFor(pct);

      if (slider.fill.style) {
        slider.fill.style.width = offset;
        slider.fill.style.background = fillBackgroundFor(pct);
      }
      if (slider.energy.style) {
        slider.energy.style.width = offset;
        slider.energy.style.opacity = energy.toFixed(3);
      }
      if (slider.stars.style) {
        slider.stars.style.width = offset;
        slider.stars.style.opacity = (energy * 0.95).toFixed(3);
      }
      if (slider.knob.style) slider.knob.style.left = offset;
      if (slider.root.setAttribute) {
        slider.root.setAttribute("data-energy", energy > 0.02 ? "1" : "0");
        slider.root.setAttribute("data-busy", visual.busy === true ? "1" : "0");
      }
      if (slider.track.setAttribute) {
        slider.track.setAttribute("aria-valuemax", String(Math.max(0, count - 1)));
        slider.track.setAttribute("aria-valuenow", String(Math.max(0, Math.min(count - 1, visual.index))));
        slider.track.setAttribute("aria-valuetext", typeof visual.name === "string" ? visual.name : "");
        slider.track.setAttribute("title", LABELS.title + (typeof visual.name === "string" ? "：" + visual.name : ""));
        if (visual.locked === true) slider.track.setAttribute("aria-disabled", "true");
        else slider.track.removeAttribute("aria-disabled");
      }

      syncTicks(ops, slider, count);
      for (var t = 0; t < slider.ticks.length; t += 1) {
        var tick = slider.ticks[t];
        if (tick.style) tick.style.left = knobOffsetOf(levelPct(t, count));
        if (tick.setAttribute) tick.setAttribute("data-on", t <= visual.index ? "1" : "0");
      }
      syncStars(ops, slider, stars);
    }

    /* ═══════════════════════ 菜单桥（挂载/还原） ═══════════════════════ */

    function createMenuBridge(options) {
      var ops = options.ops;
      var win = options.win;
      var active = typeof options.active === "function" ? options.active : function () { return true; };
      var onPick = typeof options.onPick === "function" ? options.onPick : function () {};
      var onState = typeof options.onState === "function" ? options.onState : function () {};
      var owner = typeof options.owner === "string" ? options.owner : STYLE_MARKER;

      var current = null; // { row, container, slider, previous, value, error }
      var observer = null;
      var timer = null;
      var disposed = false;
      var levels = { list: [], index: -1 };
      var drag = null; // { pct }
      var pending = null; // 乐观档位：等目录快照回填前先画到位，避免松手回弹
      var errorText = "";
      var busy = false;
      var locked = false;
      var warned = false; // 「形状不认识」只提示一次，避免每次开菜单都刷日志

      /** 同一行只允许一个实例持有（多个会话各有一个组件，菜单却是全局的）。 */
      function rowOwner(row) {
        return ops.attr(row, "data-rp-owner");
      }

      function shownIndex() {
        var count = levels.list.length;
        var index = pending !== null ? pending : levels.index;
        if (index < 0) index = 0;
        if (count > 0 && index > count - 1) index = count - 1;
        return index;
      }

      function paint() {
        if (current === null) return;
        var count = levels.list.length;
        var index = shownIndex();
        var pct = drag !== null ? drag.pct : levelPct(index, count);
        var level = levels.list[index];
        paintSlider(ops, current.slider, {
          count: count,
          index: index,
          pct: pct,
          name: level ? level.name : "",
          busy: busy,
          locked: locked,
        });
        if (current.value !== null && current.value.style) {
          var energy = energyFor(pct);
          current.value.style.color = energy > 0.02
            ? "rgb(" + Math.round(COLOR_BLUE[0] + (COLOR_VIOLET[0] - COLOR_BLUE[0]) * energy) + "," +
              Math.round(COLOR_BLUE[1] + (COLOR_VIOLET[1] - COLOR_BLUE[1]) * energy) + "," +
              Math.round(COLOR_BLUE[2] + (COLOR_VIOLET[2] - COLOR_BLUE[2]) * energy) + ")"
            : current.previous.valueColor;
        }
        if (current.error !== null && current.error.textContent !== errorText) {
          current.error.textContent = errorText;
        }
      }

      function detach() {
        if (current === null) return;
        var row = current.row;
        var container = current.container;
        var previous = current.previous;
        try {
          if (row !== null && row.style) {
            row.style.height = previous.height;
            row.style.flexWrap = previous.flexWrap;
            row.style.paddingTop = previous.paddingTop;
            row.style.paddingBottom = previous.paddingBottom;
          }
          if (current.value !== null && current.value.style) current.value.style.color = previous.valueColor;
        } catch (error) {
          /* 还原失败也不该让菜单崩掉 */
        }
        ops.remove(row, container);
        ops.remove(row, current.error);
        try {
          if (typeof row.removeAttribute === "function" && rowOwner(row) === owner) row.removeAttribute("data-rp-owner");
        } catch (error) {
          /* 忽略 */
        }
        current = null;
      }

      function mount(row) {
        // 多个会话各有一个组件实例，菜单却是全局的：同一行只让一个实例持有。
        var currentOwner = rowOwner(row);
        if (currentOwner !== null && currentOwner !== owner) return;
        if (typeof row.setAttribute === "function") row.setAttribute("data-rp-owner", owner);

        var previous = {
          height: row.style ? row.style.height || "" : "",
          flexWrap: row.style ? row.style.flexWrap || "" : "",
          paddingTop: row.style ? row.style.paddingTop || "" : "",
          paddingBottom: row.style ? row.style.paddingBottom || "" : "",
          valueColor: "",
        };
        var value = findValueElement(ops, row);
        previous.valueColor = value !== null && value.style ? value.style.color || "" : "";

        if (row.style) {
          row.style.height = "auto";
          row.style.flexWrap = "wrap";
          row.style.paddingTop = ROW_PADDING_BLOCK;
          row.style.paddingBottom = ROW_PADDING_BLOCK;
        }

        var container = ops.create("div");
        if (container === null) return;
        container.className = "rp-inline";
        container.setAttribute("data-rp-part", "host");
        var slider = buildSlider(ops);
        if (slider !== null) ops.append(container, slider.root);

        var error = ops.create("div");
        if (error !== null) {
          error.className = "rp-error";
          error.setAttribute("data-rp-part", "error");
          error.setAttribute("role", "status");
        }

        ops.append(row, container);
        if (error !== null) ops.append(row, error);

        current = { row: row, container: container, slider: slider, previous: previous, value: value, error: error };

        attachHandlers(slider);
        paint();

        // 官方菜单是「测量后固定定位」的，加高后请它重测一次。
        try {
          if (win && typeof win.dispatchEvent === "function" && typeof win.Event === "function") {
            win.dispatchEvent(new win.Event("resize"));
          }
        } catch (error2) {
          /* 没有 Event 构造器就算了 */
        }
        onState({ mounted: true });
      }

      function pctFromEvent(event) {
        var track = current !== null && current.slider !== null ? current.slider.track : null;
        if (track === null || typeof track.getBoundingClientRect !== "function") return null;
        var rect = track.getBoundingClientRect();
        var usable = rect.width - KNOB_RADIUS * 2;
        if (!(usable > 0)) return null;
        return clamp01((event.clientX - rect.left - KNOB_RADIUS) / usable);
      }

      function attachHandlers(slider) {
        if (slider === null || slider.track === null) return;
        var track = slider.track;

        track.onpointerdown = function (event) {
          if (disposed || locked) return;
          var pct = pctFromEvent(event);
          if (pct === null) return;
          try {
            event.preventDefault();
            if (typeof track.setPointerCapture === "function" && event.pointerId !== undefined) {
              track.setPointerCapture(event.pointerId);
            }
          } catch (error) {
            /* 捕获失败不影响后续 move */
          }
          drag = { pct: pct };
          if (track.setAttribute) track.setAttribute("data-drag", "1");
          paint();
        };

        track.onpointermove = function (event) {
          if (drag === null) return;
          var pct = pctFromEvent(event);
          if (pct === null) return;
          try {
            event.preventDefault();
          } catch (error) {
            /* 忽略 */
          }
          drag.pct = pct;
          paint();
        };

        function endDrag(event) {
          if (drag === null) return;
          var pct = drag.pct;
          drag = null;
          if (track.setAttribute) track.setAttribute("data-drag", "0");
          var count = levels.list.length;
          var target = nearestIndex(pct, count);
          if (count > 0 && target !== shownIndex()) {
            pending = target; // 先画到位，等目录快照回填再交权
            onPick(target);
          }
          paint();
          try {
            if (typeof track.releasePointerCapture === "function" && event && event.pointerId !== undefined) {
              track.releasePointerCapture(event.pointerId);
            }
          } catch (error) {
            /* 忽略 */
          }
        }

        track.onpointerup = endDrag;
        track.onpointercancel = endDrag;

        track.onkeydown = function (event) {
          if (disposed || locked) return;
          var count = levels.list.length;
          if (count < MIN_LEVELS) return;
          var key = event.key;
          var index = shownIndex();
          var next = null;
          if (key === "ArrowLeft" || key === "ArrowDown") next = Math.max(0, index - 1);
          else if (key === "ArrowRight" || key === "ArrowUp") next = Math.min(count - 1, index + 1);
          else if (key === "Home") next = 0;
          else if (key === "End") next = count - 1;
          if (next === null) return;
          try {
            event.preventDefault();
          } catch (error) {
            /* 忽略 */
          }
          if (next !== index) {
            pending = next;
            onPick(next);
            paint();
          }
        };

        track.onclick = function (event) {
          try {
            event.stopPropagation();
          } catch (error) {
            /* 忽略 */
          }
        };
      }

      function scan() {
        if (disposed) return;
        try {
          if (!active()) {
            detach();
            return;
          }
          if (current !== null) {
            if (ops.contains(current.row) && ops.contains(current.container)) return;
            detach();
          }
          var found = findEffortRow(ops, EFFORT_ROW_LABELS);
          if (found === null) {
            detach();
            // 菜单开着但结构不是我们认识的形状：一次性提示，方便以后排查 DSH 升级带来的形状变化。
            if (!warned && ops.queryAll('button[aria-haspopup="menu"][aria-expanded="true"]').length > 0) {
              warned = true;
              console.warn(
                "[reasoning-presets] 菜单结构不是已知形状，本次没有挂上滑条（官方那一行保持原样）。",
              );
            }
            return;
          }
          // 没有可选的档位就完全不挂：官方那一行保持原样，不显示假滑条。
          if (levels.list.length < MIN_LEVELS) {
            detach();
            return;
          }
          mount(found.row);
        } catch (error) {
          try {
            detach();
          } catch (inner) {
            /* 兜到底 */
          }
        }
      }

      function start() {
        scan();
        var MO = win && (win.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null));
        if (typeof MO === "function") {
          try {
            observer = new MO(function () {
              scan();
            });
            var root = ops.doc !== null && ops.doc !== undefined && ops.doc.body ? ops.doc.body : null;
            observer.observe(root || ops.doc.documentElement, { childList: true, subtree: true });
            return;
          } catch (error) {
            observer = null;
          }
        }
        if (win && typeof win.setInterval === "function") {
          timer = win.setInterval(scan, 400);
        }
      }

      return {
        start: start,
        scan: scan,
        setLevels: function (next) {
          var index = next && typeof next.index === "number" ? next.index : -1;
          levels = { list: next && Array.isArray(next.list) ? next.list : [], index: index };
          // 目录快照已经追平乐观档位 → 交回真实快照，避免长期漂移
          if (pending !== null && index === pending) pending = null;
          if (levels.list.length < MIN_LEVELS) {
            detach();
            return;
          }
          paint();
          // 档位是后到的（组件先挂载、快照后回填）：这时才真正挂上去
          scan();
        },
        setStatus: function (status) {
          busy = status && status.busy === true;
          locked = status && status.locked === true;
          var nextError = status && typeof status.error === "string" ? status.error : "";
          if (nextError.length > 0) pending = null; // 失败就退回真实档位
          errorText = nextError;
          paint();
        },
        dispose: function () {
          disposed = true;
          if (observer !== null) {
            try {
              observer.disconnect();
            } catch (error) {
              /* 忽略 */
            }
            observer = null;
          }
          if (timer !== null) {
            try {
              win.clearInterval(timer);
            } catch (error) {
              /* 忽略 */
            }
            timer = null;
          }
          detach();
        },
        host: function () {
          return current;
        },
      };
    }

    /* ════════════════════════════ 组件 ════════════════════════════ */

    /**
     * 插槽里的立足点：只渲染一个不可见 span 拿 sessionId，真正的滑条由桥
     * portal 进官方菜单那一行。展开/收起菜单不会改变 hook 顺序。
     */
    function EffortSlot(props) {
      var sessionId = typeof props.sessionId === "string" && props.sessionId.length > 0 ? props.sessionId : null;
      var resolveDirectory = typeof props.__resolveDirectory === "function" ? props.__resolveDirectory : null;

      var accessState = React.useState(null);
      var access = accessState[0];
      var setAccess = accessState[1];

      var errorState = React.useState("");
      var error = errorState[0];
      var setError = errorState[1];

      var busyState = React.useState(false);
      var busy = busyState[0];
      var setBusy = busyState[1];

      var bridgeRef = React.useRef(null);
      var levelsRef = React.useRef({ list: [], index: -1, key: "" });

      React.useEffect(function () {
        if (sessionId === null || resolveDirectory === null) return undefined;
        var cancelled = false;
        var attempt = 0;
        var timer = null;

        function tick() {
          if (cancelled) return;
          var directory = null;
          try {
            directory = resolveDirectory(sessionId);
          } catch (ignored) {
            directory = null;
          }
          if (directory !== null) {
            setAccess(directory);
            try {
              directory.load();
            } catch (ignored) {
              /* store 自己会反映状态 */
            }
            return;
          }
          var delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
          attempt += 1;
          timer = setTimeout(tick, delay);
        }

        tick();
        return function () {
          cancelled = true;
          if (timer !== null) clearTimeout(timer);
        };
      }, [sessionId, resolveDirectory]);

      var store = access !== null ? access.store : null;

      var subscribe = React.useCallback(
        function (listener) {
          if (store === null || typeof store.subscribe !== "function") return function () {};
          return store.subscribe(listener);
        },
        [store],
      );

      var getSnapshot = React.useCallback(
        function () {
          if (store === null || typeof store.getSnapshot !== "function") return EMPTY_SNAPSHOT;
          try {
            var snapshot = store.getSnapshot();
            return snapshot === null || snapshot === undefined ? EMPTY_SNAPSHOT : snapshot;
          } catch (ignored) {
            return EMPTY_SNAPSHOT;
          }
        },
        [store],
      );

      var snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
      var levels = levelsOf(snapshot);
      var visible = levels.list.length >= MIN_LEVELS && levels.index >= 0;

      var commit = React.useCallback(
        function (index) {
          var currentLevels = levelsRef.current;
          if (access === null || typeof access.select !== "function") return;
          var selection = selectionFor(currentLevels, index);
          if (selection === null) return;
          setBusy(true);
          setError("");
          var result;
          try {
            result = access.select(selection);
          } catch (ignored) {
            setBusy(false);
            setError(LABELS.failed + "：" + String(ignored && ignored.message ? ignored.message : ignored));
            return;
          }
          Promise.resolve(result)
            .then(function (outcome) {
              if (outcome !== null && typeof outcome === "object" && outcome.ok === false) {
                setError(LABELS.failed + "：" + (outcome.error && outcome.error.code ? outcome.error.code : "unknown"));
              }
            })
            .catch(function (failure) {
              setError(LABELS.failed + "：" + String(failure && failure.message ? failure.message : failure));
            })
            .then(function () {
              setBusy(false);
            });
        },
        [access],
      );

      var commitRef = React.useRef(commit);
      commitRef.current = commit;

      React.useEffect(function () {
        levelsRef.current = levels;
      }, [levels.key, levels.index]);

      React.useEffect(
        function () {
          var doc = typeof document !== "undefined" ? document : null;
          if (doc === null) return undefined;
          var bridge = createMenuBridge({
            ops: makeDomOps(doc),
            win: typeof window !== "undefined" ? window : null,
            active: function () {
              return true;
            },
            onPick: function (index) {
              commitRef.current(index);
            },
            onState: function () {},
          });
          bridgeRef.current = bridge;
          try {
            bridge.start();
          } catch (ignored) {
            /* 起不来就只是没有滑条 */
          }
          return function () {
            bridgeRef.current = null;
            try {
              bridge.dispose();
            } catch (ignored) {
              /* 忽略 */
            }
          };
        },
        [],
      );

      React.useEffect(
        function () {
          var bridge = bridgeRef.current;
          if (bridge === null) return;
          try {
            bridge.setLevels({ list: levels.list, index: levels.index });
            bridge.setStatus({ busy: busy, error: error, locked: false });
          } catch (ignored) {
            /* 忽略 */
          }
        },
        [levels.key, levels.index, visible, busy, error],
      );

      return React.createElement("span", {
        "data-rp-part": "anchor",
        "aria-hidden": "true",
        style: { display: "none" },
      });
    }

    /* ════════════════════════════ 接线 ════════════════════════════ */

    /** `remote` / `remote.session` 必须一起声明，否则目录在会话绑定就绪前长期解析失败。 */
    var inject = ["slots", "modelDirectories", "sessions", "remote", "remote.session"];

    function apply(ctx) {
      installStyles();
      // 宿主没给这几个服务时什么都不做（例如离线冒烟调用），连日志都不必留。
      if (ctx === null || ctx === undefined || ctx.slots === null || ctx.slots === undefined) return;
      try {
        var models = ctx.modelDirectories;

        function resolveDirectory(sessionId) {
          try {
            var directory = models.directoryFor(sessionId);
            return {
              store: directory.store,
              load: function () {
                try {
                  var loading = directory.load();
                  if (loading && typeof loading.catch === "function") loading.catch(function () {});
                } catch (ignored) {
                  /* 加载失败由 store 自己反映状态 */
                }
              },
              select: function (selection) {
                return directory.select(selection);
              },
            };
          } catch (ignored) {
            return null;
          }
        }

        ctx.slots.inject(SLOT_NAME, function () {
          return ctx.slots.register(
            {
              name: SLOT_NAME,
              id: ENTRY_ID,
              order: ENTRY_ORDER,
              label: function () {
                return LABELS.title;
              },
              inject: function (sessionId) {
                return { sessionId: sessionId };
              },
            },
            function EffortSeat(props) {
              return React.createElement(
                EffortSlot,
                Object.assign({}, props, { __resolveDirectory: resolveDirectory }),
              );
            },
          );
        });
      } catch (error) {
        try {
          console.error("[reasoning-presets] 滑条插槽注册失败：", error);
        } catch (ignored) {
          /* 连日志都不能抛 */
        }
      }
    }

    installStyles();

    exports.apply = apply;
    exports.inject = inject;

    /** 离线测试接缝：纯函数 + DOM 桥，运行时无副作用。 */
    exports.__internals = {
      PACKAGE_ID: PACKAGE_ID,
      SLOT_NAME: SLOT_NAME,
      ENTRY_ID: ENTRY_ID,
      ENTRY_ORDER: ENTRY_ORDER,
      MIN_LEVELS: MIN_LEVELS,
      TRACK_HEIGHT: TRACK_HEIGHT,
      CSS: CSS,
      clamp01: clamp01,
      levelPct: levelPct,
      nearestIndex: nearestIndex,
      knobOffsetOf: knobOffsetOf,
      energyFor: energyFor,
      starCountFor: starCountFor,
      starGeometry: starGeometry,
      colorForPct: colorForPct,
      fillBackgroundFor: fillBackgroundFor,
      levelsOf: levelsOf,
      selectionFor: selectionFor,
      findEffortRow: findEffortRow,
      findValueElement: findValueElement,
      makeDomOps: makeDomOps,
      buildSlider: buildSlider,
      paintSlider: paintSlider,
      createMenuBridge: createMenuBridge,
      EffortSlot: EffortSlot,
    };

    return module.exports;
  },
});
