import {
  GRAPH_NODE_TYPES,
  GRAPH_TYPE_META,
  GRAPH_ZOOM,
  createGraphFilters,
  filterGraphBySearch,
  getGraphNodeContext,
  layoutGraph,
  nextZoom,
  shortGraphLabel,
  summarizeGraph
} from "../graph-viewer.js";

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export function createGraphRuntime({
  graphCountsEl,
  graphFiltersEl,
  graphSearchEl,
  graphMatchCountEl,
  graphSvgEl,
  graphNodeDetailsEl,
  graphZoomOutBtn,
  graphZoomInBtn,
  graphResetBtn,
  draftToInput,
  draftBodyInput,
  sendDraftIdInput,
  sendTokenInput
}) {
  let currentGraphMap = null;
  let graphFiltersState = createGraphFilters();
  let graphView = { x: 0, y: 0, scale: GRAPH_ZOOM.initial };
  let graphDrag = null;
  let graphRelatedIds = new Set();
  let selectedGraphNodeId = "";

  function graphTransform() {
    return `translate(${graphView.x} ${graphView.y}) scale(${graphView.scale})`;
  }

  function updateGraphMatchCount() {
    if (!currentGraphMap) {
      graphMatchCountEl.textContent = "0 matches";
      return;
    }

    const visible = filterGraphBySearch(currentGraphMap, graphSearchEl.value, graphFiltersState);
    const label = graphSearchEl.value.trim() ? "matches" : "visible";
    graphMatchCountEl.textContent = `${visible.nodes.length} ${label}`;
  }

  function applyGraphNodeShortcut(node) {
    const context = getGraphNodeContext(currentGraphMap, node);
    graphRelatedIds = new Set(context.relatedIds);
    selectedGraphNodeId = node.id;

    if (context.action.type === "reply_draft") {
      draftToInput.value = context.action.details.to;
      draftBodyInput.value = "";
      draftBodyInput.focus();
    }

    if (context.action.type === "send_gate") {
      sendDraftIdInput.value = context.action.details.draftId;
      sendTokenInput.focus();
    }

    if (context.action.type === "scheduler_details" && context.action.details.relatedDraftId) {
      sendDraftIdInput.value = context.action.details.relatedDraftId;
    }

    graphNodeDetailsEl.textContent = JSON.stringify(
      {
        action: context.action,
        relatedIds: context.relatedIds,
        node
      },
      null,
      2
    );
  }

  function renderGraphFilters() {
    graphFiltersEl.replaceChildren(
      ...GRAPH_NODE_TYPES.map((type) => {
        const label = document.createElement("label");
        label.className = "graph-filter";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = graphFiltersState[type] !== false;
        input.addEventListener("change", () => {
          graphFiltersState[type] = input.checked;
          renderGraph();
        });

        const swatch = document.createElement("span");
        swatch.className = "graph-swatch";
        swatch.style.background = GRAPH_TYPE_META[type].color;

        const text = document.createElement("span");
        text.textContent = GRAPH_TYPE_META[type].label;

        label.append(input, swatch, text);
        return label;
      })
    );
  }

  function renderGraphCounts(map) {
    const summary = summarizeGraph(map);
    graphCountsEl.replaceChildren(
      ...Object.entries(summary).map(([key, value]) => {
        const item = document.createElement("span");
        item.textContent = `${key}: ${value}`;
        return item;
      })
    );
  }

  function renderGraph() {
    graphSvgEl.replaceChildren();
    if (!currentGraphMap) {
      graphNodeDetailsEl.textContent = "Export map to render graph.";
      return;
    }

    const layout = layoutGraph(currentGraphMap, graphFiltersState, graphSearchEl.value);
    updateGraphMatchCount();
    const scene = createSvgElement("g", {
      id: "graphScene",
      transform: graphTransform()
    });
    const edgeLayer = createSvgElement("g", { class: "graph-edge-layer" });
    const nodeLayer = createSvgElement("g", { class: "graph-node-layer" });

    for (const edge of layout.edges) {
      edgeLayer.append(
        createSvgElement("line", {
          class: "graph-edge",
          x1: edge.fromNode.x,
          y1: edge.fromNode.y,
          x2: edge.toNode.x,
          y2: edge.toNode.y
        })
      );

      const distance = Math.hypot(edge.toNode.x - edge.fromNode.x, edge.toNode.y - edge.fromNode.y);
      if (distance > 130) {
        const label = createSvgElement("text", {
          class: "graph-edge-label",
          x: (edge.fromNode.x + edge.toNode.x) / 2,
          y: (edge.fromNode.y + edge.toNode.y) / 2 - 4
        });
        label.textContent = shortGraphLabel(edge.type, 22);
        edgeLayer.append(label);
      }
    }

    for (const node of layout.nodes) {
      const classNames = [
        "graph-node",
        `graph-node-${node.type}`,
        graphSearchEl.value.trim() && node.matched ? "graph-node-match" : "",
        graphRelatedIds.has(node.id) ? "graph-node-related" : "",
        selectedGraphNodeId === node.id ? "graph-node-selected" : ""
      ].filter(Boolean);
      const group = createSvgElement("g", {
        class: classNames.join(" "),
        tabindex: "0",
        role: "button"
      });
      const color = GRAPH_TYPE_META[node.type]?.color || "#e8eef8";

      group.append(
        createSvgElement("circle", {
          cx: node.x,
          cy: node.y,
          r: node.type === "system" ? 34 : 25,
          fill: color
        })
      );

      const label = createSvgElement("text", {
        class: "graph-node-label",
        x: node.x,
        y: node.y + 43
      });
      label.textContent = shortGraphLabel(node.label || node.id, 24);
      group.append(label);

      const status = createSvgElement("text", {
        class: "graph-node-status",
        x: node.x,
        y: node.y + 57
      });
      status.textContent = shortGraphLabel(node.status || node.type, 20);
      group.append(status);

      const selectNode = () => {
        applyGraphNodeShortcut(node);
        renderGraph();
      };
      group.addEventListener("click", selectNode);
      group.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectNode();
        }
      });

      nodeLayer.append(group);
    }

    scene.append(edgeLayer, nodeLayer);
    graphSvgEl.append(scene);
  }

  function bindGraphInteractions() {
    graphSearchEl.addEventListener("input", renderGraph);
    graphZoomOutBtn.addEventListener("click", () => {
      graphView.scale = nextZoom(graphView.scale, -1);
      renderGraph();
    });
    graphZoomInBtn.addEventListener("click", () => {
      graphView.scale = nextZoom(graphView.scale, 1);
      renderGraph();
    });
    graphResetBtn.addEventListener("click", () => {
      graphView = { x: 0, y: 0, scale: GRAPH_ZOOM.initial };
      renderGraph();
    });
    graphSvgEl.addEventListener("wheel", (event) => {
      if (!currentGraphMap) return;
      event.preventDefault();
      graphView.scale = nextZoom(graphView.scale, event.deltaY > 0 ? -1 : 1);
      renderGraph();
    });
    graphSvgEl.addEventListener("pointerdown", (event) => {
      if (!currentGraphMap) return;
      graphDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        viewX: graphView.x,
        viewY: graphView.y
      };
      graphSvgEl.setPointerCapture(event.pointerId);
    });
    graphSvgEl.addEventListener("pointermove", (event) => {
      if (!graphDrag || graphDrag.pointerId !== event.pointerId) return;
      graphView.x = graphDrag.viewX + event.clientX - graphDrag.startX;
      graphView.y = graphDrag.viewY + event.clientY - graphDrag.startY;
      const scene = document.querySelector("#graphScene");
      scene?.setAttribute("transform", graphTransform());
    });
    graphSvgEl.addEventListener("pointerup", (event) => {
      if (graphDrag?.pointerId === event.pointerId) graphDrag = null;
    });
    graphSvgEl.addEventListener("pointercancel", () => {
      graphDrag = null;
    });
  }

  bindGraphInteractions();

  return {
    setMap(map) {
      currentGraphMap = map;
      renderGraphCounts(currentGraphMap);
      renderGraphFilters();
      renderGraph();
    },
    getMap() {
      return currentGraphMap;
    },
    render() {
      renderGraph();
    }
  };
}
