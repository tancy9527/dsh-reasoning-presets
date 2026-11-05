/**
 * 客户端滑条的离线测试：不启动 Electron、不启动浏览器。
 *
 * 做法：垫一个假的 `window.__ModuleLoader__`（DSH 客户端产物就是这样被装配的），
 * 用假 React 调 `factory(require)` 拿到 exports，再验证
 *   ①bundle 身份/注入面  ②插槽注册契约  ③纯函数几何  ④fail-open 纪律
 */
import test from "node:test";
import assert from "node:assert/strict";

/** 假 React：只提供 factory 求值时真正会用到的那几个 API。 */
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

/** 载入 bundle，返回 { definition, exports }。 */
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

test("apply 在会话插槽上注册一条自己的条目", async () => {
  const { exports } = await loadBundle();
  const registrations = [];
  const injected = [];
  let component = null;
  const ctx = {
    modelDirectories: {
      directoryFor() {
        return { store: { getSnapshot: () => null, subscribe: () => () => {} }, load: async () => {}, select: async () => ({ ok: true }) };
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
  assert.equal(typeof entry.label, "function");
  assert.equal(entry.label(), "推理等级");
  assert.equal(typeof entry.inject, "function", "会话作用域插槽必须显式注入 sessionId");
  assert.deepEqual(entry.inject("session-1"), { sessionId: "session-1" });
  assert.equal(typeof component, "function");
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

test("levelsOf：从目录快照里取出当前模型的档位与下标", async () => {
  const { exports } = await loadBundle();
  const { levelsOf } = exports.__internals;
  const snapshot = {
    current: { provider: "glm", model: "glm-5.3-flash", reasoningEffort: "high" },
    groups: [
      {
        id: "glm",
        models: [
          { id: "glm-5.3-flash", reasoning: { efforts: [{ id: "low", name: "低" }, { id: "high", name: "高" }, { id: "max", name: "最大" }], defaultEffort: "max" } },
        ],
      },
    ],
  };
  const levels = levelsOf(snapshot);
  assert.deepEqual(levels.efforts.map((e) => e.id), ["low", "high", "max"]);
  assert.equal(levels.index, 1, "current.reasoningEffort 优先于 defaultEffort");
  assert.equal(levels.effective, "high");

  // 没选档位时回落到模型默认档
  const fallback = levelsOf({ ...snapshot, current: { provider: "glm", model: "glm-5.3-flash" } });
  assert.equal(fallback.index, 2);
  assert.equal(fallback.effective, "max");

  // 模型没有推理元数据 / 会话没有选中模型
  assert.equal(levelsOf({ current: { provider: "glm", model: "nope" }, groups: snapshot.groups }).efforts.length, 0);
  assert.equal(levelsOf(null).index, -1);
  assert.equal(levelsOf(undefined).efforts.length, 0);
});

test("indexFromX：拖动落点映射到最近档位并夹在两端", async () => {
  const { exports } = await loadBundle();
  const { indexFromX, TRACK_WIDTH, THUMB_SIZE } = exports.__internals;
  const left = 100;
  const width = TRACK_WIDTH;
  const usable = width - THUMB_SIZE;
  const at = (fraction) => left + THUMB_SIZE / 2 + usable * fraction;

  assert.equal(indexFromX(at(0), left, width, 3), 0);
  assert.equal(indexFromX(at(0.5), left, width, 3), 1);
  assert.equal(indexFromX(at(1), left, width, 3), 2);
  // 越界夹取
  assert.equal(indexFromX(left - 500, left, width, 3), 0);
  assert.equal(indexFromX(left + width + 500, left, width, 3), 2);
  // 两档 / 单档 / 退化宽度
  assert.equal(indexFromX(at(1), left, width, 2), 1);
  assert.equal(indexFromX(at(0.9), left, width, 1), 0);
  assert.equal(indexFromX(at(0.5), left, 0, 3), 0);
});

test("xPercentOf：滑块位置在两端贴合轨道", async () => {
  const { exports } = await loadBundle();
  const { xPercentOf, TRACK_WIDTH, THUMB_SIZE } = exports.__internals;
  assert.equal(xPercentOf(0, 3), (THUMB_SIZE / 2 / TRACK_WIDTH) * 100);
  assert.equal(xPercentOf(2, 3), ((TRACK_WIDTH - THUMB_SIZE / 2) / TRACK_WIDTH) * 100);
  assert.equal(xPercentOf(1, 1), 0);
});

test("selectionFor：写回入参只带 provider/model/reasoningEffort", async () => {
  const { exports } = await loadBundle();
  const { selectionFor, levelsOf } = exports.__internals;
  const levels = levelsOf({ current: { provider: "claude", model: "claude-opus-5" }, groups: [] });
  assert.deepEqual(selectionFor(levels, "max"), { provider: "claude", model: "claude-opus-5", reasoningEffort: "max" });
  assert.deepEqual(selectionFor(levels, undefined), { provider: "claude", model: "claude-opus-5" });
  assert.equal(selectionFor({ current: null }, "max"), null);
});

test("宿主半边自检：本仓库的 dsh.client / exports[./client] / 产物内容齐全", async () => {
  const { auditClientBundle } = await import("../lib/index.mjs");
  const warnings = [];
  const debug = [];
  auditClientBundle({ logger: { warn: (line) => warnings.push(line), debug: (line) => debug.push(line) } });
  assert.deepEqual(warnings, [], `不应有自检告警：${warnings.join("；")}`);
  assert.ok(debug.some((line) => line.includes("自检通过")));
  // 连自检本身也不能抛错
  assert.doesNotThrow(() => auditClientBundle({}));
});
