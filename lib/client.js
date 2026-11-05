/**
 * dsh-reasoning-presets —— 客户端半边：输入框工具行上的推理等级滑条
 *
 * 为什么需要客户端半边：
 *   官方模型菜单里的「推理等级」只有在模型描述符带 `reasoning.efforts` 时才出现，
 *   而且它是一列档位按钮。本插件（宿主半边）负责把 `reasoningEfforts` 补进
 *   `llm-pi-ai` 配置，让档位「存在」；这一半负责把档位「画成一条可拖动的滑条」，
 *   并且不依赖任何第三方滑条插件。
 *
 * 三条纪律（照抄 DSH 生态里被事故验证过的形状）：
 *   1. fail-open：拿不到模型目录 / 只有 0~1 个档位时**不渲染任何东西**，输入框保持原样；
 *      任何异常都吞掉，绝不连累宿主输入区。
 *   2. 只读官方服务，不碰官方 DOM：档位读写走 `ctx.modelDirectories.directoryFor(sessionId)`
 *      的 store 与 select，不重排、不改写官方菜单结构（升级 DSH 也不会崩）。
 *   3. 不声明不确定的服务：inject 只列官方插件确实提供的
 *      `slots / modelDirectories / sessions / remote / remote.session`
 *      （后两个是目录解析的必需项，少声明会让 `directoryFor` 长期失败 → 档位为空）。
 *
 * 打包形态：DSH 的客户端产物是「模块加载器 bundle」，由 `__ModuleLoader__.load` 装配，
 * 面向 `dsh.client` 声明加载，因此这里不引入构建工具，直接写运行态 JS。
 */
window.__ModuleLoader__.load({
  id: "dsh-reasoning-presets",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    /** 官方输入框工具行右侧的会话作用域插槽（「紧凑控件」）。 */
    var SLOT_NAME = "conversation.input.right";
    var ENTRY_ID = "reasoning-presets-effort";
    var ENTRY_ORDER = 30;
    var STYLE_ID = "dsh-reasoning-presets-client-style";

    /** 滑条几何：轨道宽度、滑块直径（px）。 */
    var TRACK_WIDTH = 104;
    var THUMB_SIZE = 12;

    var LABELS = {
      title: "推理等级",
      noEfforts: "当前模型未声明推理档位",
      busy: "正在切换…",
    };

    var CSS = [
      ".dshrp-effort{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 6px;border-radius:999px;",
      "background:transparent;border:0;color:var(--dsw-alias-label-secondary,#6b7280);",
      "font:500 11px/1 var(--dsw-font-family-ui,system-ui,sans-serif);cursor:pointer;user-select:none;",
      "transition:background .12s ease,opacity .12s ease;outline:none}",
      ".dshrp-effort:hover,.dshrp-effort:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));",
      "color:var(--dsw-alias-label-primary,#111)}",
      ".dshrp-effort:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary,#4d6bfe) inset}",
      ".dshrp-effort[data-busy='1']{opacity:.6;cursor:progress}",
      ".dshrp-effort[data-error='1'] .dshrp-name{color:var(--dsw-alias-state-error-primary,#e5484d)}",
      ".dshrp-track{position:relative;flex:0 0 auto;height:18px;touch-action:none}",
      ".dshrp-rail{position:absolute;left:0;right:0;top:50%;height:2px;transform:translateY(-50%);",
      "border-radius:2px;background:var(--dsw-alias-fill-l2,rgba(127,127,127,.28))}",
      ".dshrp-fill{position:absolute;left:0;top:50%;height:2px;transform:translateY(-50%);",
      "border-radius:2px;background:var(--dsw-alias-brand-primary,#4d6bfe)}",
      ".dshrp-dot{position:absolute;top:50%;width:4px;height:4px;border-radius:50%;transform:translate(-50%,-50%);",
      "background:var(--dsw-alias-fill-l2,rgba(127,127,127,.45))}",
      ".dshrp-dot[data-passed='1']{background:var(--dsw-alias-brand-primary,#4d6bfe)}",
      ".dshrp-thumb{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;",
      "transform:translate(-50%,-50%);background:var(--dsw-alias-bg-layer-1,#fff);",
      "border:2px solid var(--dsw-alias-brand-primary,#4d6bfe);box-shadow:0 1px 2px rgba(0,0,0,.18);",
      "transition:transform .1s ease}",
      ".dshrp-effort:active .dshrp-thumb{transform:translate(-50%,-50%) scale(1.12)}",
      ".dshrp-name{white-space:nowrap;font-variant-numeric:tabular-nums;min-width:2.2em}",
      ".dshrp-error{color:var(--dsw-alias-state-error-primary,#e5484d);font-size:10px}",
    ].join("");

    function installStyles() {
      try {
        if (typeof document === "undefined") return;
        if (document.getElementById(STYLE_ID) !== null) return;
        var style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      } catch (error) {
        /* 样式装不上只是丑，绝不影响功能 */
      }
    }

    /* ───────────────────────────── 纯函数（可离线测试） ───────────────────────────── */

    /** 从目录快照里取出当前模型的档位信息。 */
    function levelsOf(state) {
      var current = state && state.current;
      if (!current) return { efforts: [], index: -1, effective: undefined, current: null, reasoning: undefined };
      var groups = (state && state.groups) || [];
      var group = null;
      for (var i = 0; i < groups.length; i += 1) {
        if (groups[i] && groups[i].id === current.provider) {
          group = groups[i];
          break;
        }
      }
      var model = null;
      if (group) {
        var models = group.models || [];
        for (var j = 0; j < models.length; j += 1) {
          if (models[j] && models[j].id === current.model) {
            model = models[j];
            break;
          }
        }
      }
      var reasoning = model ? model.reasoning : undefined;
      var efforts = (reasoning && reasoning.efforts) || [];
      var effective = current.reasoningEffort !== undefined ? current.reasoningEffort : reasoning ? reasoning.defaultEffort : undefined;
      var index = -1;
      for (var k = 0; k < efforts.length; k += 1) {
        if (efforts[k] && efforts[k].id === effective) {
          index = k;
          break;
        }
      }
      return {
        efforts: efforts,
        index: index,
        effective: effective,
        current: current,
        reasoning: reasoning,
      };
    }

    /** 指针横坐标 → 档位下标（0..count-1）。 */
    function indexFromX(x, left, width, count) {
      if (!(count > 1) || !(width > 0)) return 0;
      var usable = Math.max(1, width - THUMB_SIZE);
      var fraction = (x - left - THUMB_SIZE / 2) / usable;
      if (fraction < 0) fraction = 0;
      if (fraction > 1) fraction = 1;
      var index = Math.round(fraction * (count - 1));
      if (index < 0) index = 0;
      if (index > count - 1) index = count - 1;
      return index;
    }

    /** 某个档位在该轨道的百分比位置（含滑块半径补偿）。 */
    function xPercentOf(index, count) {
      if (!(count > 1)) return 0;
      var usable = TRACK_WIDTH - THUMB_SIZE;
      var x = THUMB_SIZE / 2 + (usable * index) / (count - 1);
      return (x / TRACK_WIDTH) * 100;
    }

    /** 组装一次 select 的入参。 */
    function selectionFor(levels, effortId) {
      if (!levels || !levels.current) return null;
      var selection = { provider: levels.current.provider, model: levels.current.model };
      if (effortId !== undefined) selection.reasoningEffort = effortId;
      return selection;
    }

    /* ───────────────────────────── 组件 ───────────────────────────── */

    /**
     * 外层负责「拿到这一会话的模型目录」：目录解析在会话作用域/绑定未就绪时会抛错，
     * 因此这里重试而不是一次性放弃（放弃就会永久没有滑条）。
     */
    function EffortSlot(props) {
      var sessionId = props.sessionId;
      var resolver = props.__resolveDirectory;
      var resolved = React.useState(null);
      var directory = resolved[0];
      var setDirectory = resolved[1];
      var failed = React.useState(null);
      var failure = failed[0];
      var setFailure = failed[1];

      React.useEffect(
        function () {
          var cancelled = false;
          var timer = null;
          var attempts = 0;
          function attempt() {
            if (cancelled) return;
            attempts += 1;
            var next = resolver(sessionId);
            if (next) {
              setDirectory(next);
              setFailure(null);
              try {
                next.load();
              } catch (error) {
                /* 预加载失败不影响后续订阅 */
              }
              return;
            }
            if (attempts < 40) timer = setTimeout(attempt, 250);
            else setFailure("模型目录不可用");
          }
          attempt();
          return function () {
            cancelled = true;
            if (timer !== null) clearTimeout(timer);
          };
        },
        [sessionId, resolver],
      );

      if (!directory) {
        return failure === null ? null : React.createElement("span", { className: "dshrp-error", title: failure }, "!");
      }
      return React.createElement(SliderSeat, { directory: directory.store, select: directory.select });
    }

    /** 内层负责「订阅 store + 拖动 + 写回」，hooks 顺序固定，不早退。 */
    function SliderSeat(props) {
      var directory = props.directory;
      var select = props.select;
      var state = React.useSyncExternalStore(
        function (callback) {
          if (directory && typeof directory.subscribe === "function") return directory.subscribe(callback);
          return function () {};
        },
        function () {
          return directory && typeof directory.getSnapshot === "function" ? directory.getSnapshot() : null;
        },
      );

      var levels = levelsOf(state);
      var count = levels.efforts.length;

      // 拖动中的预览档位；null 表示跟随服务端
      var previewState = React.useState(null);
      var preview = previewState[0];
      var setPreview = previewState[1];
      var errorState = React.useState(null);
      var error = errorState[0];
      var setError = errorState[1];
      var trackRef = React.useRef(null);
      var draggingRef = React.useRef(false);

      var busy = !!(state && state.pending);
      var index = preview !== null ? preview : levels.index;
      var level = index >= 0 ? levels.efforts[index] : undefined;

      if (count < 2 || !levels.current || !level) return null;

      function commit(nextIndex) {
        var effort = levels.efforts[nextIndex];
        if (!effort) return;
        // 落点与当前服务端档位相同 → 什么都不发（拖动途中来回挪也不会打请求）
        if (effort.id === levels.effective) return;
        var selection = selectionFor(levels, effort.id);
        if (!selection) return;
        setError(null);
        var result;
        try {
          result = select(selection);
        } catch (failure) {
          setPreview(null);
          setError(String((failure && failure.message) || failure));
          return;
        }
        Promise.resolve(result).then(
          function (outcome) {
            if (outcome && outcome.ok === false) {
              setPreview(null);
              var detail = outcome.error || {};
              setError(detail.code ? detail.code + ": " + detail.message : String(detail.message || "切换失败"));
            }
          },
          function (failure) {
            setPreview(null);
            setError(String((failure && failure.message) || failure));
          },
        );
      }

      function indexAt(clientX) {
        var node = trackRef.current;
        if (!node || typeof node.getBoundingClientRect !== "function") return index;
        var rect = node.getBoundingClientRect();
        return indexFromX(clientX, rect.left, rect.width || TRACK_WIDTH, count);
      }

      function onPointerDown(event) {
        if (busy) return;
        draggingRef.current = true;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (failure) {
          /* 老浏览器没有指针捕获，退化为普通拖动 */
        }
        var next = indexAt(event.clientX);
        setPreview(next);
        if (typeof event.preventDefault === "function") event.preventDefault();
      }

      function onPointerMove(event) {
        if (!draggingRef.current) return;
        setPreview(indexAt(event.clientX));
      }

      function onPointerUp(event) {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        try {
          if (typeof event.currentTarget.releasePointerCapture === "function") {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        } catch (failure) {
          /* 没捕获过就没什么可释放 */
        }
        var next = indexAt(event.clientX);
        setPreview(null);
        commit(next);
      }

      function onKeyDown(event) {
        var key = event.key;
        var next = index;
        if (key === "ArrowLeft" || key === "ArrowDown" || key === "ArrowUp" || key === "ArrowRight") {
          next = key === "ArrowLeft" || key === "ArrowUp" ? index - 1 : index + 1;
        } else if (key === "Home") {
          next = 0;
        } else if (key === "End") {
          next = count - 1;
        } else {
          return;
        }
        if (typeof event.preventDefault === "function") event.preventDefault();
        if (next < 0) next = 0;
        if (next > count - 1) next = count - 1;
        if (next === index) return;
        setPreview(next);
        commit(next);
        setPreview(null);
      }

      var children = [
        React.createElement(
          "span",
          { className: "dshrp-track", key: "track", style: { width: TRACK_WIDTH + "px" } },
          React.createElement("span", { className: "dshrp-rail", key: "rail" }),
          React.createElement("span", {
            className: "dshrp-fill",
            key: "fill",
            style: { width: xPercentOf(index, count) + "%" },
          }),
        ),
      ];

      for (var dotIndex = 0; dotIndex < count; dotIndex += 1) {
        children.push(
          React.createElement("span", {
            className: "dshrp-dot",
            key: "dot-" + dotIndex,
            "data-passed": dotIndex <= index ? "1" : "0",
            style: { left: xPercentOf(dotIndex, count) + "%" },
          }),
        );
      }

      children.push(
        React.createElement("span", {
          className: "dshrp-thumb",
          key: "thumb",
          style: { left: xPercentOf(index, count) + "%" },
        }),
      );

      children.push(React.createElement("span", { className: "dshrp-name", key: "name" }, level.name || level.id));

      var title = error ? error : levels.efforts.map(function (item) {
        return item.name || item.id;
      }).join(" · ");

      return React.createElement(
        "div",
        {
          className: "dshrp-effort",
          role: "slider",
          tabIndex: 0,
          "aria-label": LABELS.title,
          "aria-valuemin": 0,
          "aria-valuemax": count - 1,
          "aria-valuenow": index,
          "aria-valuetext": level.name || level.id,
          "data-busy": busy ? "1" : "0",
          "data-error": error ? "1" : "0",
          title: title,
          ref: trackRef,
          onPointerDown: onPointerDown,
          onPointerMove: onPointerMove,
          onPointerUp: onPointerUp,
          onPointerCancel: onPointerUp,
          onKeyDown: onKeyDown,
        },
        children,
      );
    }

    /* ───────────────────────────── 接线 ───────────────────────────── */

    /**
     * `remote` / `remote.session` 必须一起声明：Cordis 的服务访问跟着调用方 ctx 走，
     * 少声明时 `directoryFor()` 会在会话绑定未就绪时长期失败 → 档位列表为空。
     */
    var inject = ["slots", "modelDirectories", "sessions", "remote", "remote.session"];

    function apply(ctx) {
      installStyles();
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
                } catch (error) {
                  /* 加载失败由 store 自己反映状态 */
                }
              },
              select: function (selection) {
                return directory.select(selection);
              },
            };
          } catch (error) {
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
        // 注册失败只意味着这块控件不出现，绝不能连累宿主输入区。
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
    /** 离线测试接缝：纯函数 + 组件本身，运行时无副作用。 */
    exports.__internals = {
      SLOT_NAME: SLOT_NAME,
      ENTRY_ID: ENTRY_ID,
      ENTRY_ORDER: ENTRY_ORDER,
      TRACK_WIDTH: TRACK_WIDTH,
      THUMB_SIZE: THUMB_SIZE,
      CSS: CSS,
      levelsOf: levelsOf,
      indexFromX: indexFromX,
      xPercentOf: xPercentOf,
      selectionFor: selectionFor,
      EffortSlot: EffortSlot,
      SliderSeat: SliderSeat,
    };

    return module.exports;
  },
});
