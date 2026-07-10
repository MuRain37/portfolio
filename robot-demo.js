const state = {
  battery: 96,
  bins: { left: 18, right: 11 },
  cleaning: false,
  status: "待机",
  mapMode: "goal",
  robot: { x: 0.2, y: 0.78 },
  goal: null,
  dump: null,
  regions: [],
  draftRegion: null,
  drawing: false,
  logs: [],
};

const elements = {
  time: document.querySelector("#current-time"),
  status: document.querySelector("#robot-status"),
  battery: document.querySelector("#battery-level"),
  batteryFill: document.querySelector("#battery-fill"),
  leftBin: document.querySelector("#left-bin"),
  leftBinFill: document.querySelector("#left-bin-fill"),
  rightBin: document.querySelector("#right-bin"),
  rightBinFill: document.querySelector("#right-bin-fill"),
  cleanToggle: document.querySelector("#clean-toggle"),
  navState: document.querySelector("#nav-state"),
  taskMode: document.querySelector("#task-mode"),
  taskTarget: document.querySelector("#task-target"),
  taskRegion: document.querySelector("#task-region"),
  taskSpeed: document.querySelector("#task-speed"),
  hint: document.querySelector("#interaction-hint"),
  canvas: document.querySelector("#map-canvas"),
  mapStage: document.querySelector("#map-stage"),
  logBody: document.querySelector("#log-body"),
  logSearch: document.querySelector("#log-search"),
  toast: document.querySelector("#toast"),
};

const ctx = elements.canvas.getContext("2d");
const mapImage = new Image();
mapImage.src = "assets/images/custom-map.png?v=4";
let toastTimer;
let taskTimer;
let cleanTimer;
let canvasSize = { width: 0, height: 0, ratio: 1 };
let mapBounds = { x: 32, y: 32, width: 1, height: 1 };

function updateClock() {
  elements.time.textContent = new Date().toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

function addLog(type, detail, status = "完成") {
  state.logs.unshift({
    id: Date.now() + Math.random(),
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    type,
    status,
    detail,
  });
  renderLogs();
}

function renderHome() {
  elements.status.textContent = state.status;
  elements.battery.textContent = Math.round(state.battery);
  elements.batteryFill.style.width = `${state.battery}%`;
  elements.leftBin.textContent = Math.round(state.bins.left);
  elements.leftBinFill.style.height = `${state.bins.left}%`;
  elements.rightBin.textContent = Math.round(state.bins.right);
  elements.rightBinFill.style.height = `${state.bins.right}%`;

  elements.cleanToggle.className = `command-button ${state.cleaning ? "danger" : "success"}`;
  elements.cleanToggle.innerHTML = state.cleaning
    ? '<i class="fa-solid fa-stop"></i><span>停止清扫工作</span>'
    : '<i class="fa-solid fa-play"></i><span>启动清扫工作</span>';
}

function setCleaning(nextValue) {
  state.cleaning = nextValue;
  state.status = nextValue ? "自主清扫" : "待机";
  clearInterval(cleanTimer);

  if (nextValue) {
    addLog("清扫任务", "启动视觉识别、目标抓取与分类投放闭环");
    cleanTimer = setInterval(() => {
      state.battery = clamp(state.battery - 0.4);
      state.bins.left = clamp(state.bins.left + 0.3);
      state.bins.right = clamp(state.bins.right + 0.45);
      renderHome();
    }, 1800);
  } else {
    addLog("清扫任务", "停止自主清扫并返回待机状态");
  }

  renderHome();
  showToast(nextValue ? "自主清扫已启动" : "机器人已停止清扫");
}

function dumpBin(side) {
  const label = side === "left" ? "桶 1" : "桶 2";
  state.status = `正在卸载${label}`;
  renderHome();
  addLog("满桶卸载", `机器人导航至卸载区，执行${label}抬升与翻转`, "执行中");
  showToast(`${label}卸载流程已启动`);

  setTimeout(() => {
    state.bins[side] = 0;
    state.status = state.cleaning ? "自主清扫" : "待机";
    renderHome();
    addLog("满桶卸载", `${label}卸载完成，容量已重置`);
    showToast(`${label}卸载完成`);
  }, 1300);
}

function switchView(viewName) {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === viewName);
  });

  if (viewName === "map") {
    requestAnimationFrame(resizeCanvas);
  }
  if (viewName === "logs") {
    renderLogs();
  }
}

function setMapMode(mode) {
  state.mapMode = mode;
  document.querySelectorAll("[data-map-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.mapMode === mode);
  });

  const labels = {
    goal: ["目标点导航", "在地图空白区域点击，设置机器人导航目标。"],
    region: ["区域清扫", "在地图中按住并拖拽，创建新的清扫区域。"],
    dump: ["卸载点设置", "在地图中点击，重新设置垃圾桶卸载位置。"],
  };
  elements.taskMode.textContent = labels[mode][0];
  elements.hint.textContent = labels[mode][1];
  drawMap();
}

function resizeCanvas() {
  const rect = elements.mapStage.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(390, Math.floor(elements.canvas.clientHeight));
  elements.canvas.width = Math.floor(width * ratio);
  elements.canvas.height = Math.floor(height * ratio);
  canvasSize = { width, height, ratio };
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawMap();
}

function mapPoint(point) {
  return {
    x: mapBounds.x + point.x * mapBounds.width,
    y: mapBounds.y + point.y * mapBounds.height,
  };
}

function normalizedPoint(event) {
  const rect = elements.canvas.getBoundingClientRect();
  const scaleX = canvasSize.width / rect.width;
  const scaleY = canvasSize.height / rect.height;
  const canvasX = (event.clientX - rect.left) * scaleX;
  const canvasY = (event.clientY - rect.top) * scaleY;
  const x = clamp((canvasX - mapBounds.x) / Math.max(1, mapBounds.width), 0, 1);
  const y = clamp((canvasY - mapBounds.y) / Math.max(1, mapBounds.height), 0, 1);
  return { x, y };
}

function drawFloorPlan() {
  const { width, height } = canvasSize;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#151918";
  ctx.fillRect(0, 0, width, height);

  const padding = 24;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const sourceWidth = mapImage.naturalWidth || 273;
  const sourceHeight = mapImage.naturalHeight || 346;
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const mapWidth = sourceWidth * scale;
  const mapHeight = sourceHeight * scale;
  mapBounds = {
    x: (width - mapWidth) / 2,
    y: (height - mapHeight) / 2,
    width: mapWidth,
    height: mapHeight,
  };

  ctx.fillStyle = "#f9faf9";
  ctx.fillRect(mapBounds.x, mapBounds.y, mapBounds.width, mapBounds.height);
  if (mapImage.complete && mapImage.naturalWidth) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(mapImage, mapBounds.x, mapBounds.y, mapBounds.width, mapBounds.height);
  }

  ctx.strokeStyle = "#4b524f";
  ctx.lineWidth = 2;
  ctx.strokeRect(mapBounds.x, mapBounds.y, mapBounds.width, mapBounds.height);

  ctx.fillStyle = "rgba(246, 250, 248, 0.7)";
  ctx.font = "11px Consolas, monospace";
  ctx.fillText("custom.pgm · 0.03 m/px", 14, height - 12);
}

function drawRegion(region, color, fill, label) {
  const start = mapPoint({ x: region.x, y: region.y });
  const end = mapPoint({ x: region.x + region.w, y: region.y + region.h });
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  ctx.fillStyle = fill;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.font = "700 11px Microsoft YaHei";
  ctx.fillText(label, x + 10, y + 19);
}

function drawMap() {
  if (!canvasSize.width) {
    return;
  }

  drawFloorPlan();

  state.regions.forEach((region, index) => {
    drawRegion(region, "#15945e", "rgba(34, 160, 107, 0.2)", `区域 ${index + 1}`);
  });

  if (state.draftRegion) {
    drawRegion(state.draftRegion, "#15945e", "rgba(34, 160, 107, 0.14)", "新区域");
  }

  if (state.dump) {
    const dump = mapPoint(state.dump);
    ctx.fillStyle = "rgba(47, 128, 237, 0.2)";
    ctx.strokeStyle = "#2f80ed";
    ctx.lineWidth = 2;
    ctx.fillRect(dump.x - 34, dump.y - 26, 68, 52);
    ctx.strokeRect(dump.x - 34, dump.y - 26, 68, 52);
    ctx.fillStyle = "#1f63b5";
    ctx.font = "700 10px Microsoft YaHei";
    ctx.fillText("卸载区", dump.x - 18, dump.y + 4);
  }

  const robot = mapPoint(state.robot);
  if (state.goal) {
    const goal = mapPoint(state.goal);
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = "#e39a17";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(robot.x, robot.y);
    ctx.lineTo(goal.x, goal.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#f5a524";
    ctx.beginPath();
    ctx.arc(goal.x, goal.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.fillStyle = "#22a06b";
  ctx.beginPath();
  ctx.arc(robot.x, robot.y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(robot.x + 3, robot.y);
  ctx.lineTo(robot.x - 4, robot.y - 4);
  ctx.lineTo(robot.x - 4, robot.y + 4);
  ctx.closePath();
  ctx.fill();
}

function updateTaskSummary() {
  elements.taskTarget.textContent = state.goal
    ? `(${state.goal.x.toFixed(2)}, ${state.goal.y.toFixed(2)})`
    : "尚未设置";
  elements.taskRegion.textContent = state.regions.length
    ? state.regions.map((region) => `区域 ${region.id}`).join("、")
    : "尚未设置";
}

function animateRobotTo(target) {
  const start = { ...state.robot };
  const duration = 1500;
  const startTime = performance.now();
  state.status = "导航执行中";
  elements.navState.textContent = "正在导航";
  elements.navState.className = "status-pill warn";
  addLog("导航目标", `发送目标点 (${target.x.toFixed(2)}, ${target.y.toFixed(2)})`, "执行中");

  function frame(now) {
    const progress = clamp((now - startTime) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    state.robot.x = start.x + (target.x - start.x) * eased;
    state.robot.y = start.y + (target.y - start.y) * eased;
    elements.taskSpeed.textContent = progress < 1 ? "0.32 m/s" : "0.00 m/s";
    drawMap();

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      state.status = state.cleaning ? "自主清扫" : "待机";
      elements.navState.textContent = "已到达目标";
      elements.navState.className = "status-pill ok";
      addLog("导航目标", "机器人已到达目标点");
      showToast("导航任务完成");
      renderHome();
    }
  }

  requestAnimationFrame(frame);
}

function executeMapTask() {
  if (state.mapMode === "goal") {
    if (!state.goal) {
      showToast("请先在地图中设置目标点");
      return;
    }
    animateRobotTo({ ...state.goal });
    return;
  }

  if (state.mapMode === "region") {
    if (!state.regions.length) {
      showToast("请先拖拽创建清扫区域");
      return;
    }
    state.cleaning = true;
    state.status = "区域清扫";
    renderHome();
    addLog("区域清扫", `执行 ${state.regions.length} 个区域的覆盖清扫任务`);
    elements.navState.textContent = "区域清扫中";
    showToast("区域清扫任务已下发");
    return;
  }

  if (!state.dump) {
    showToast("请先在地图中设置卸载区");
    return;
  }
  animateRobotTo({ ...state.dump });
  addLog("卸载任务", "机器人前往已设置的垃圾卸载区");
}

function resetMap() {
  state.robot = { x: 0.2, y: 0.78 };
  state.goal = null;
  state.dump = null;
  state.regions = [];
  elements.navState.textContent = "导航就绪";
  elements.navState.className = "status-pill ok";
  updateTaskSummary();
  drawMap();
  addLog("地图重置", "清除导航目标、清扫区域与卸载区");
  showToast("演示地图已重置");
}

function onMapPointerDown(event) {
  if (state.mapMode !== "region") {
    return;
  }
  const point = normalizedPoint(event);
  state.drawing = true;
  state.draftRegion = { x: point.x, y: point.y, w: 0, h: 0 };
  elements.canvas.setPointerCapture(event.pointerId);
}

function onMapPointerMove(event) {
  if (!state.drawing || !state.draftRegion) {
    return;
  }
  const point = normalizedPoint(event);
  state.draftRegion.w = point.x - state.draftRegion.x;
  state.draftRegion.h = point.y - state.draftRegion.y;
  drawMap();
}

function onMapPointerUp(event) {
  const point = normalizedPoint(event);

  if (state.mapMode === "goal") {
    state.goal = point;
    elements.navState.textContent = "目标已设置";
    elements.navState.className = "status-pill ok";
    updateTaskSummary();
    drawMap();
    showToast("导航目标已设置");
    return;
  }

  if (state.mapMode === "dump") {
    state.dump = point;
    drawMap();
    addLog("卸载区设置", `卸载位置更新为 (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
    showToast("卸载区位置已更新");
    return;
  }

  if (!state.drawing || !state.draftRegion) {
    return;
  }

  state.drawing = false;
  const region = state.draftRegion;
  state.draftRegion = null;
  if (Math.abs(region.w) < 0.04 || Math.abs(region.h) < 0.04) {
    drawMap();
    showToast("拖拽范围过小，请重新框选");
    return;
  }

  if (region.w < 0) {
    region.x += region.w;
    region.w = Math.abs(region.w);
  }
  if (region.h < 0) {
    region.y += region.h;
    region.h = Math.abs(region.h);
  }
  region.id = state.regions.length + 1;
  state.regions.push(region);
  updateTaskSummary();
  drawMap();
  addLog("区域设置", `新增清扫区域 ${region.id}`);
  showToast(`区域 ${region.id} 已保存`);
}

function renderLogs() {
  const query = elements.logSearch.value.trim().toLowerCase();
  const filtered = state.logs.filter((log) =>
    `${log.type} ${log.status} ${log.detail}`.toLowerCase().includes(query),
  );

  if (!filtered.length) {
    elements.logBody.innerHTML = '<tr><td class="empty-log" colspan="4">暂无匹配日志</td></tr>';
    return;
  }

  elements.logBody.innerHTML = filtered
    .map(
      (log) => `
        <tr>
          <td>${log.time}</td>
          <td>${log.type}</td>
          <td><span class="log-status">${log.status}</span></td>
          <td>${log.detail}</td>
        </tr>`,
    )
    .join("");
}

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelectorAll("[data-map-mode]").forEach((button) => {
  button.addEventListener("click", () => setMapMode(button.dataset.mapMode));
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => {
    state.cleaning = false;
    clearInterval(cleanTimer);
    state.status = "待机";
    renderHome();
    addLog("状态控制", "机器人进入待机状态");
    showToast("机器人已进入待机状态");
  });
});

document.querySelectorAll("[data-dump]").forEach((button) => {
  button.addEventListener("click", () => dumpBin(button.dataset.dump));
});

elements.cleanToggle.addEventListener("click", () => setCleaning(!state.cleaning));
document.querySelector("#execute-task").addEventListener("click", executeMapTask);
document.querySelector("#reset-map").addEventListener("click", resetMap);
document.querySelector("#clear-logs").addEventListener("click", () => {
  state.logs = [];
  renderLogs();
  showToast("操作日志已清空");
});
elements.logSearch.addEventListener("input", renderLogs);
elements.canvas.addEventListener("pointerdown", onMapPointerDown);
elements.canvas.addEventListener("pointermove", onMapPointerMove);
elements.canvas.addEventListener("pointerup", onMapPointerUp);
window.addEventListener("resize", resizeCanvas);
mapImage.addEventListener("load", drawMap);

addLog("系统", "机器人前端静态体验已启动");
addLog("连接状态", "ROS2、D435、激光雷达与 STM32 使用模拟数据");
addLog("地图加载", "项目 custom 地图加载完成，等待用户设置任务区域");
updateClock();
setInterval(updateClock, 1000);
renderHome();
renderLogs();
updateTaskSummary();
