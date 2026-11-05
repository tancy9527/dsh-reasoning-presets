/**
 * 客户端滑条的离线测试：不启动 Electron、不启动浏览器。
 *
 * 做法：垫一个假的 `window.__ModuleLoader__`（DSH 客户端产物就是这样被装配的），
 * 用假 React 调 `factory(require)` 拿到 exports；DOM 部分用最小假 document
 * 验证「找到官方那一行 → 加高 → 挂滑条 → 拖 → 还原」的完整链路。
 */
import test from "node:test";
import assert from "node:assert/strict";

/* ══════════════════════════ 假 React / 假 DOM ══════════════════════════ */

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children, key: props?.key };
    },
    useState(initial) {
      return [typeof initial === "function" ? initial() : initial, () => {}];
    },
    useRef(initial) {
      return { current: initial };
    },
    useEffect() {},
    useCallback(fn) {
      return fn;
    },
    useMemo(fn) {
      return fn();
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot();
    },
  };
}

function parseSelector(selector) {
  const match = /^([a-zA-Z]+)((?:\[[^\]]+\])*)$/.exec(selector.trim());
  if (match === null) throw new Error(`测试用的假 DOM 不支持选择器：${selector}`);
  const attrs = [];
  for (const raw of match[2].match(/\[[^\]]+\]/g) ?? []) {
    const inner = raw.slice(1, -1);
    const eq = inner.indexOf("=");
    if (eq < 0) attrs.push([inner, undefined]);
    else attrs.push([inner.slice(0, eq), inner.slice(eq + 1).replace(/^"|"$/g, "")]);
  }
  return { tag: match[1].toLowerCase(), attrs };
}

function matchesSpec(element, spec) {
  if (element.tagName !== spec.tag.toUpperCase()) return false;
  for (const [name, value] of spec.attrs) {
    const actual = element.attrs[name];
    if (value === undefined) {
      if (actual === undefined) return false;
    } else if (String(actual) !== value) {
      return false;
    }
  }
  return true;
}

function descendantsOf(element, spec, out) {
  for (const child of element.children) {
    if (matchesSpec(child, spec)) out.push(child);
    descendantsOf(child, spec, out);
  }
  return out;
}

function makeElement(doc, tag) {
  const element = {
    tagName: tag.toUpperCase(),
    attrs: {},
    style: {},
    children: [],
    textContent: "",
    ownerDocument: doc,
    parentElement: null,
    getAttribute(name) {
      const value = this.attrs[name];
      return value === undefined ? null : String(value);
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentElement = null;
      return child;
    },
    get childNodes() {
      return this.children;
    },
    get lastChild() {
      return this.children.length === 0 ? null : this.children[this.children.length - 1];
    },
    querySelectorAll(selector) {
      return descendantsOf(this, parseSelector(selector), []);
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    },
    contains(other) {
      let node = other;
      while (node !== null && node !== undefined) {
        if (node === this) return true;
        node = node.parentElement;
      }
      return false;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 28 };
    },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
  return element;
}

function makeDocument() {
  const doc = {
    byId: new Map(),
    createElement(tag) {
      return makeElement(doc, tag);
    },
    getElementById(id) {
      return doc.byId.get(id) ?? null;
    },
    querySelectorAll(selector) {
      return descendantsOf(doc.documentElement, parseSelector(selector), []);
    },
    querySelector() {
      return null;
    },
  };
  doc.documentElement = makeElement(doc, "html");
  doc.head = makeElement(doc, "head");
  doc.body = makeElement(doc, "body");
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

/** 造一个「模型菜单已展开」的官方结构：根面板恰好两行。 */
function makeOpenModelMenu(doc, { labels = ["模型", "推理等级"], values = [null, "高"] } = {}) {
  const seat = doc.createElement("button");
  seat.setAttribute("aria-haspopup", "menu");
  seat.setAttribute("aria-expanded", "true");
  seat.setAttribute("aria-controls", "model-menu");

  const menu = doc.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("id", "model-menu");
  doc.byId.set("model-menu", menu);

  for (let index = 0; index < labels.length; index += 1) {
    const item = doc.createElement("button");
    item.setAttribute("role", "menuitem");
    const label = doc.createElement("span");
    label.textContent = labels[index];
    item.appendChild(label);
    if (typeof values[index] === "string") {
      const value = doc.createElement("span");
      value.setAttribute("class", "cellValue");
      value.textContent = values[index];
      item.appendChild(value);
    }
    menu.appendChild(item);
  }

  doc.body.appendChild(seat);
  doc.body.appendChild(menu);
  return { seat, menu, items: menu.children };
}

/* ══════════════════════════ bundle 装配 ══════════════════════════ */

async function loadBundle() {
  let definition = null;
  globalThis.window = {
    __ModuleLoader__: {
      load(next) {
        definition = next;
      },
    },
  };
  await import(`../lib/client.js?test=${Date.now()}`);
  assert.ok(definition !== null, "client.js 必须调用 window.__ModuleLoader__.load");
  const exports = definition.factory((id) => {
    assert.equal(id, "react", "客户端产物只应 require react");
    return fakeReact();
  });
  return { definition, exports };
}

const THREE_LEVELS = [
  { id: "low", name: "低" },
  { id: "high", name: "高" },
  { id: "max", name: "最大" },
];

const SAMPLE_SNAPSHOT = {
  current: { provider: "glm", model: "glm-5.3-flash", reasoningEffort: "high" },
  groups: [
    {
      id: "glm",
      models: [
        {
          id: "glm-5.3-flash",
          reasoning: { efforts: THREE_LEVELS, defaultEffort: "max" },
        },
      ],
    },
  ],
};

/* ══════════════════════════════ 用例 ══════════════════════════════ */

test("bundle 身份与导出面", async () => {
  const { definition, exports } = await loadBundle();
  assert.equal(definition.id, "dsh-reasoning-presets");
  assert.equal(typeof definition.factory, "function");
  assert.equal(typeof exports.apply, "function");
  assert.ok(Array.isArray(exports.inject));
  for (const service of ["slots", "modelDirectories", "sessions", "remote", "remote.session"]) {
    assert.ok(exports.inject.includes(service), `inject 必须声明 ${service}`);
  }
});

test("apply 在会话插槽上注册一条自己的条目，且只渲染不可见立足点", async () => {
  const { exports } = await loadBundle();
  const registrations = [];
  const injected = [];
  let component = null;
  const ctx = {
    modelDirectories: {
      directoryFor() {
        return {
          store: { getSnapshot: () => null, subscribe: () => () => {} },
          load: async () => {},
          select: async () => ({ ok: true }),
        };
      },
    },
    slots: {
      inject(name, callback) {
        injected.push(name);
        return callback();
      },
      register(entry, render) {
        registrations.push(entry);
        component = render;
        return () => {};
      },
    },
  };
  exports.apply(ctx);
  assert.deepEqual(injected, ["conversation.input.right"]);
  assert.equal(registrations.length, 1);
  const entry = registrations[0];
  assert.equal(entry.name, "conversation.input.right");
  assert.equal(entry.id, exports.__internals.ENTRY_ID);
  assert.equal(entry.label(), "推理等级");
  assert.deepEqual(entry.inject("session-1"), { sessionId: "session-1" });

  const tree = exports.__internals.EffortSlot({ sessionId: "session-1", __resolveDirectory: () => null });
  assert.equal(tree.type, "span", "插槽里只应有一个不可见立足点");
  assert.equal(tree.props["data-rp-part"], "anchor");
  assert.equal(tree.props.style.display, "none");
});

test("apply 是 fail-open：目录服务缺失/注册抛错都不外泄异常", async () => {
  const { exports } = await loadBundle();
  assert.doesNotThrow(() => exports.apply({}));
  assert.doesNotThrow(() =>
    exports.apply({
      modelDirectories: {},
      slots: {
        inject() {
          throw new Error("boom");
        },
      },
    }),
  );
});

test("levelsOf：档位列表、当前下标与模型键", async () => {
  const { exports } = await loadBundle();
  const { levelsOf } = exports.__internals;

  const levels = levelsOf(SAMPLE_SNAPSHOT);
  assert.deepEqual(levels.list.map((item) => item.id), ["low", "high", "max"]);
  assert.equal(levels.index, 1, "current.reasoningEffort 优先于 defaultEffort");
  assert.equal(levels.effective, "high");
  assert.equal(levels.key, "glm/glm-5.3-flash#low,high,max");

  const fallback = levelsOf({ ...SAMPLE_SNAPSHOT, current: { provider: "glm", model: "glm-5.3-flash" } });
  assert.equal(fallback.index, 2, "没选档位时回落到模型默认档");
  assert.equal(fallback.effective, "max");

  // 档位对不上 / 没有推理元数据 / 没有会话 → index = -1（调用方据此不显示滑条）
  assert.equal(levelsOf({ ...SAMPLE_SNAPSHOT, current: { provider: "glm", model: "glm-5.3-flash", reasoningEffort: "xhigh" } }).index, -1);
  assert.equal(levelsOf({ current: { provider: "glm", model: "nope" }, groups: SAMPLE_SNAPSHOT.groups }).list.length, 0);
  assert.equal(levelsOf(null).index, -1);
  assert.equal(levelsOf(undefined).list.length, 0);
});

test("selectionFor：写回入参只带 provider/model/reasoningEffort", async () => {
  const { exports } = await loadBundle();
  const { selectionFor, levelsOf } = exports.__internals;
  const levels = { current: { provider: "claude", model: "claude-opus-5" }, list: THREE_LEVELS, index: 1, key: "claude/claude-opus-5#low,high,max" };
  assert.deepEqual(selectionFor(levels, 2), { provider: "claude", model: "claude-opus-5", reasoningEffort: "max" });
  assert.equal(selectionFor(levels, 9), null, "越界档位不能编出请求");
  assert.equal(selectionFor(levelsOf({ current: { provider: "claude", model: "claude-opus-5" }, groups: [] }), 0), null, "没有档位时不能写回");
  assert.equal(selectionFor({ current: null, list: THREE_LEVELS }, 0), null);
});

test("几何：档位位置、拖动落点吸附、能量层与星尘", async () => {
  const { exports } = await loadBundle();
  const { levelPct, nearestIndex, knobOffsetOf, energyFor, starCountFor } = exports.__internals;

  assert.equal(levelPct(0, 3), 0);
  assert.equal(levelPct(1, 3), 0.5);
  assert.equal(levelPct(2, 3), 1);
  assert.equal(levelPct(1, 1), 0);

  assert.equal(nearestIndex(0, 3), 0);
  assert.equal(nearestIndex(0.4, 3), 1);
  assert.equal(nearestIndex(0.49, 3), 1);
  assert.equal(nearestIndex(0.9, 3), 2);
  assert.equal(nearestIndex(-4, 3), 0);
  assert.equal(nearestIndex(4, 3), 2);
  assert.equal(nearestIndex(0.5, 1), 0);

  assert.equal(knobOffsetOf(0.5), "50.00%");
  assert.equal(energyFor(1 / 3), 0);
  assert.equal(energyFor(1), 1);
  assert.equal(energyFor(0.2), 0);
  assert.equal(starCountFor(0.2), 0, "1/3 之前不该有星尘");
  assert.ok(starCountFor(1) >= 5);
});

test("findEffortRow：只认「展开的席 + 根面板恰好两行」", async () => {
  const { exports } = await loadBundle();
  const { findEffortRow, makeDomOps } = exports.__internals;

  const doc = makeDocument();
  const { items } = makeOpenModelMenu(doc);
  const found = findEffortRow(makeDomOps(doc), ["推理等级", "Effort"]);
  assert.ok(found !== null);
  assert.equal(found.row, items[1], "第二行才是推理等级");
  assert.equal(found.menu.getAttribute("id"), "model-menu");

  // 三行（说明不是根面板，可能是别的菜单）→ 什么都不做
  const wide = makeDocument();
  makeOpenModelMenu(wide, { labels: ["模型", "推理等级", "工作目录"] });
  assert.equal(findEffortRow(makeDomOps(wide), ["推理等级"]), null);

  // 席没有 aria-controls → 找不到菜单
  const broken = makeDocument();
  const seat = broken.createElement("button");
  seat.setAttribute("aria-haspopup", "menu");
  seat.setAttribute("aria-expanded", "true");
  broken.body.appendChild(seat);
  assert.equal(findEffortRow(makeDomOps(broken), ["推理等级"]), null);

  // 菜单收起（aria-expanded=false）→ 不认
  const closed = makeDocument();
  const openMenu = makeOpenModelMenu(closed);
  openMenu.seat.setAttribute("aria-expanded", "false");
  assert.equal(findEffortRow(makeDomOps(closed), ["推理等级"]), null);
});

test("桥：加高官方那一行、挂上滑条、拖动只在松手时提交一次", async () => {
  const { exports } = await loadBundle();
  const { createMenuBridge, makeDomOps } = exports.__internals;

  const doc = makeDocument();
  const { items } = makeOpenModelMenu(doc);
  const row = items[1];

  const picks = [];
  const bridge = createMenuBridge({
    ops: makeDomOps(doc),
    win: { setInterval() {}, clearInterval() {} },
    active: () => true,
    onPick: (index) => picks.push(index),
    onState: () => {},
  });

  bridge.setLevels({ list: THREE_LEVELS, index: 1 });
  bridge.start();

  // 那一行被加高并允许折行，滑条挂在它下面
  assert.equal(row.style.height, "auto");
  assert.equal(row.style.flexWrap, "wrap");
  assert.equal(row.style.paddingTop, "10px");
  assert.equal(row.style.paddingBottom, "10px");
  const host = row.children.find((child) => child.attrs["data-rp-part"] === "host");
  assert.ok(host !== undefined, "应在官方那一行里 append 一个容器");
  assert.equal(host.className, "rp-inline");

  const root = host.children[0];
  const track = root.children.find((child) => child.attrs["data-rp-part"] === "track");
  assert.ok(track !== undefined);
  assert.equal(track.getAttribute("role"), "slider");
  assert.equal(track.getAttribute("aria-valuenow"), "1");
  assert.equal(track.getAttribute("aria-valuetext"), "高");

  const fill = track.children.find((child) => child.attrs["data-rp-part"] === "fill");
  assert.equal(fill.style.width, "50.00%");
  const ticks = track.children.filter((child) => child.attrs["data-rp-part"] === "tick");
  assert.equal(ticks.length, 3, "每个档位一个刻度");
  assert.deepEqual(ticks.map((tick) => tick.attrs["data-on"]), ["1", "1", "0"]);

  // 拖到最右（松手前不提交）
  track.onpointerdown({ clientX: 186, pointerId: 1, preventDefault() {} });
  assert.equal(track.getAttribute("data-drag"), "1");
  track.onpointermove({ clientX: 186, pointerId: 1, preventDefault() {} });
  assert.deepEqual(picks, [], "拖动过程中不能提交");
  track.onpointerup({ clientX: 186, pointerId: 1 });
  assert.deepEqual(picks, [2], "松手吸附到最近档位并提交一次");
  assert.equal(track.getAttribute("data-drag"), "0");

  // 目录快照回填（真实宿主会这样推回来），乐观值交还给快照
  bridge.setLevels({ list: THREE_LEVELS, index: 2 });

  // 落点与当前档位相同 → 不提交
  track.onpointerdown({ clientX: 186, pointerId: 1, preventDefault() {} });
  track.onpointerup({ clientX: 186, pointerId: 1 });
  assert.deepEqual(picks, [2], "落点没变就不该发请求");

  // 键盘：← 退一档
  track.onkeydown({ key: "ArrowLeft", preventDefault() {} });
  assert.deepEqual(picks, [2, 1], "当前是第 3 档，退一档到第 2 档（index 1）");

  // 卸载还原：内联样式回到空串，容器被摘掉
  bridge.dispose();
  assert.equal(row.style.height, "");
  assert.equal(row.style.flexWrap, "");
  assert.equal(row.style.paddingTop, "");
  assert.equal(row.children.some((child) => child.attrs["data-rp-part"] === "host"), false);
});

test("桥：最高档点亮能量层并给数值文字上色，收起时还原颜色", async () => {
  const { exports } = await loadBundle();
  const { createMenuBridge, makeDomOps } = exports.__internals;

  const doc = makeDocument();
  const { items } = makeOpenModelMenu(doc);
  const row = items[1];
  const value = row.children.find((child) => child.attrs.class === "cellValue");
  value.style.color = "";

  const bridge = createMenuBridge({
    ops: makeDomOps(doc),
    win: { setInterval() {}, clearInterval() {} },
    active: () => true,
    onPick: () => {},
  });
  bridge.setLevels({ list: THREE_LEVELS, index: 2 });
  bridge.start();

  const host = row.children.find((child) => child.attrs["data-rp-part"] === "host");
  const root = host.children[0];
  assert.equal(root.attrs["data-energy"], "1");
  const energy = root.children
    .find((child) => child.attrs["data-rp-part"] === "track")
    .children.find((child) => child.attrs["data-rp-part"] === "energy");
  assert.equal(energy.style.opacity, "1.000");
  assert.match(value.style.color, /^rgb\(/, "最高档要把数值文字染成紫罗兰");

  bridge.dispose();
  assert.equal(value.style.color, "", "收起后必须还原官方文字颜色");
});
