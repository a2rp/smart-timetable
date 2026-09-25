/* Smart Timetable - vanilla JavaScript timetable workspace. */

// ---------- Defaults ----------
const defaultSettings = {
    startHour: 8, // visible grid starts at 08:00
    endHour: 20, // visible grid ends at 20:00
    slotMinutes: 30, // snap to 30-minute increments
};

// ---------- State ----------
const state = {
    /** @type {Array<TimetableBlock>} */
    blocks: [],
    settings: { ...defaultSettings },
};

/**
 * @typedef {Object} TimetableBlock
 * @property {string} id
 * @property {string} title
 * @property {string} location
 * @property {string} color
 * @property {number} dayIndex
 * @property {number} startMinutes
 * @property {number} durationMinutes
 */

// ---------- Elements ----------
const dayColumnsContainer = document.getElementById("dayColumns");
const timeRail = document.getElementById("timeRail");
const toastEl = document.getElementById("toast");

const exportPngButton = document.getElementById("exportPngButton");
const printButton = document.getElementById("printButton");
const exportJsonButton = document.getElementById("exportJsonButton");
const importJsonInput = document.getElementById("importJsonInput");
const clearAllButton = document.getElementById("clearAllButton");

// Form elements
const createForm = document.getElementById("createForm");
const titleInput = document.getElementById("titleInput");
const locationInput = document.getElementById("locationInput");
const colorInput = document.getElementById("colorInput");
const startTimeInput = document.getElementById("startTimeInput");
const durationInput = document.getElementById("durationInput");
const resetFormButton = document.getElementById("resetFormButton");

// Timeline controls
const startHourInput = document.getElementById("startHourInput");
const endHourInput = document.getElementById("endHourInput");
const slotMinutesInput = document.getElementById("slotMinutesInput");
const applyTimelineButton = document.getElementById("applyTimelineButton");

// Footer year
document.getElementById("year").textContent = String(new Date().getFullYear());
const goTopButton = document.getElementById("goTopButton");
if (goTopButton) {
    const updateTopButton = () => goTopButton.classList.toggle("visible", window.scrollY > 420);
    window.addEventListener("scroll", updateTopButton, { passive: true });
    goTopButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    updateTopButton();
}

// ---------- Utils ----------
function createId(prefix = "id") {
    return `${prefix}_${Math.random()
        .toString(36)
        .slice(2, 8)}_${Date.now().toString(36)}`;
}
function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
}
function minutesFromTimeString(str) {
    const [h, m] = str.split(":").map(Number);
    return h * 60 + m;
}
function timeLabelFromMinutes(total) {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function getTotalSlots() {
    return (
        ((state.settings.endHour - state.settings.startHour) * 60) /
        state.settings.slotMinutes
    );
}
function getSlotHeightPx() {
    return (
        parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
                "--slot-height"
            )
        ) || 36
    );
}
function startOfDayMinutes() {
    return state.settings.startHour * 60;
}
function endOfDayMinutes() {
    return state.settings.endHour * 60;
}
function showToast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.style.borderColor = isError ? "#5a1d1d" : "var(--border)";
    toastEl.classList.add("show");
    clearTimeout(showToast._timerId);
    showToast._timerId = setTimeout(
        () => toastEl.classList.remove("show"),
        2000
    );
}
function readCheckedDayIndexes() {
    return Array.from(createForm.querySelectorAll('input[name="day"]:checked'))
        .map((i) => Number(i.value))
        .sort((a, b) => a - b);
}
function overlaps(a, b) {
    if (a.dayIndex !== b.dayIndex) return false;
    const aEnd = a.startMinutes + a.durationMinutes;
    const bEnd = b.startMinutes + b.durationMinutes;
    return a.startMinutes < bEnd && aEnd > b.startMinutes;
}

// ---------- Persistence ----------
const STORAGE_KEY_STATE = "smartTimetable.state";

function saveCurrentState() {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(state));
}
function loadSavedState() {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (!raw) return;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.settings && Array.isArray(parsed.blocks)) {
            state.settings = { ...state.settings, ...parsed.settings };
            state.blocks = parsed.blocks;
        }
    } catch {}
}

// ---------- Rendering ----------
function renderTimeRail() {
    timeRail.innerHTML = "";
    const totalSlots = getTotalSlots();
    const slotH = getSlotHeightPx();
    for (let i = 0; i <= totalSlots; i++) {
        const minutes = startOfDayMinutes() + i * state.settings.slotMinutes;
        if (minutes % 60 === 0) {
            const tick = document.createElement("div");
            tick.className = "tick";
            tick.style.top = `${i * slotH}px`;
            timeRail.appendChild(tick);

            const label = document.createElement("div");
            label.className = "label";
            label.textContent = timeLabelFromMinutes(minutes);
            label.style.top = `${i * slotH}px`;
            timeRail.appendChild(label);
        }
    }
    timeRail.style.height = `${totalSlots * slotH}px`;
}

function ensureDayColumns() {
    dayColumnsContainer.innerHTML = "";
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const day = document.createElement("div");
        day.className = "day";
        day.dataset.dayIndex = String(dayIndex);
        day.tabIndex = 0;
        day.style.height = `${getTotalSlots() * getSlotHeightPx()}px`;
        dayColumnsContainer.appendChild(day);
    }
}

function renderBlocks() {
    Array.from(dayColumnsContainer.children).forEach(
        (day) => (day.innerHTML = "")
    );
    const slotH = getSlotHeightPx();

    for (const block of state.blocks) {
        const dayEl = dayColumnsContainer.children[block.dayIndex];
        if (!dayEl) continue;

        const el = document.createElement("div");
        el.className = "session-block";
        el.style.background = block.color || "var(--accent)";
        el.dataset.blockId = block.id;

        const start = timeLabelFromMinutes(block.startMinutes);
        const end = timeLabelFromMinutes(
            block.startMinutes + block.durationMinutes
        );
        el.innerHTML = `
      <div class="title">${block.title || "Session"}</div>
      <div class="meta">${start}–${end}${
            block.location ? ` · ${block.location}` : ""
        }</div>
    `;

        const topPx =
            ((block.startMinutes - startOfDayMinutes()) /
                state.settings.slotMinutes) *
            slotH;
        const heightPx =
            (block.durationMinutes / state.settings.slotMinutes) * slotH;
        el.style.top = `${topPx}px`;
        el.style.height = `${heightPx - 4}px`;

        const clash = state.blocks.some(
            (other) => other.id !== block.id && overlaps(block, other)
        );
        if (clash) el.classList.add("is-overlap");

        attachDragHandlers(el);
        el.addEventListener("dblclick", () => openEditDialog(block.id));
        el.tabIndex = 0;
        el.addEventListener("keydown", (ev) =>
            handleBlockKeyMove(ev, block.id)
        );

        dayEl.appendChild(el);
    }
}

// ---------- CRUD ----------
function addBlocksFromForm() {
    const title = titleInput.value.trim();
    if (!title) {
        showToast("Please enter a title.", true);
        return;
    }

    const days = readCheckedDayIndexes();
    if (!days.length) {
        showToast("Pick at least one day.", true);
        return;
    }

    const startAbs = minutesFromTimeString(startTimeInput.value);
    const duration = Number(durationInput.value) || 60;
    const color = colorInput.value || "#22c55e";
    const location = locationInput.value.trim();

    const dayStart = startOfDayMinutes();
    const dayEnd = endOfDayMinutes();
    if (startAbs < dayStart || startAbs + duration > dayEnd) {
        showToast(
            `Time must be within ${timeLabelFromMinutes(
                dayStart
            )}–${timeLabelFromMinutes(dayEnd)}.`,
            true
        );
        return;
    }

    let count = 0;
    for (const dayIndex of days) {
        state.blocks.push({
            id: createId("blk"),
            title,
            location,
            color,
            dayIndex,
            startMinutes: startAbs,
            durationMinutes: duration,
        });
        count++;
    }

    saveCurrentState();
    renderBlocks();
    showToast(`Added ${count} block${count > 1 ? "s" : ""}.`);

    createForm.reset();
    colorInput.value = color;
    startTimeInput.value = "09:00";
    durationInput.value = "60";
}

function deleteBlockById(id) {
    const idx = state.blocks.findIndex((b) => b.id === id);
    if (idx >= 0) {
        state.blocks.splice(idx, 1);
        saveCurrentState();
        renderBlocks();
        showToast("Deleted.");
    }
}

function updateBlock(id, changes) {
    const block = state.blocks.find((b) => b.id === id);
    if (!block) return;
    Object.assign(block, changes);
    saveCurrentState();
    renderBlocks();
}

// ---------- Drag & Drop (dblclick-safe) ----------
function attachDragHandlers(blockEl) {
    const DRAG_THRESHOLD = 6;
    let pointerDown = false;
    let dragging = false;
    let activePointerId = 0;
    const start = { x: 0, y: 0, top: 0, dayIndex: 0, blockId: "" };

    const beginDrag = (e) => {
        dragging = true;
        blockEl.setPointerCapture(e.pointerId);
        blockEl.style.opacity = "0.9";
    };

    const onPointerDown = (e) => {
        pointerDown = true;
        dragging = false;
        activePointerId = e.pointerId;

        blockEl.focus(); // keyboard arrows ready

        const rect = blockEl.getBoundingClientRect();
        const parentDayEl = blockEl.parentElement;
        start.x = e.clientX;
        start.y = e.clientY;
        start.top = rect.top - parentDayEl.getBoundingClientRect().top;
        start.dayIndex = Number(parentDayEl.dataset.dayIndex);
        start.blockId = blockEl.dataset.blockId;
    };

    const onPointerMove = (e) => {
        if (!pointerDown || e.pointerId !== activePointerId) return;

        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;

        if (!dragging) {
            if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
            beginDrag(e);
        }

        let newTop = start.top + dy;

        const columnsRect = dayColumnsContainer.getBoundingClientRect();
        const relativeX = e.clientX - columnsRect.left;
        const columnWidth = columnsRect.width / 7;
        let targetDayIndex = Math.floor(relativeX / columnWidth);
        targetDayIndex = clamp(targetDayIndex, 0, 6);

        const maxTop =
            getTotalSlots() * getSlotHeightPx() - blockEl.offsetHeight;
        newTop = clamp(newTop, 0, maxTop);

        const slotH = getSlotHeightPx();
        newTop = Math.round(newTop / slotH) * slotH;

        const targetDayEl = dayColumnsContainer.children[targetDayIndex];
        if (blockEl.parentElement !== targetDayEl)
            targetDayEl.appendChild(blockEl);
        blockEl.style.top = `${newTop}px`;
    };

    const onPointerUp = (e) => {
        if (e.pointerId !== activePointerId) return;

        if (!dragging) {
            pointerDown = false; // treat as click/dblclick, do nothing
            return;
        }

        dragging = false;
        pointerDown = false;
        blockEl.releasePointerCapture(e.pointerId);
        blockEl.style.opacity = "1";

        const targetDayEl = blockEl.parentElement;
        const targetDayIndex = Number(targetDayEl.dataset.dayIndex);
        const topPx = parseFloat(blockEl.style.top || "0");
        const startAbs =
            startOfDayMinutes() +
            Math.round(topPx / getSlotHeightPx()) * state.settings.slotMinutes;

        const block = state.blocks.find((b) => b.id === start.blockId);
        if (!block) return;

        const tentativeEnd = startAbs + block.durationMinutes;
        if (
            startAbs < startOfDayMinutes() ||
            tentativeEnd > endOfDayMinutes()
        ) {
            showToast("Out of bounds.", true);
            renderBlocks();
            return;
        }

        block.dayIndex = targetDayIndex;
        block.startMinutes = startAbs;

        saveCurrentState();
        renderBlocks();
    };

    blockEl.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
}

// ---------- Keyboard movement ----------
function handleBlockKeyMove(ev, blockId) {
    const block = state.blocks.find((b) => b.id === blockId);
    if (!block) return;

    const moveMinutes = (delta) => {
        block.startMinutes = clamp(
            block.startMinutes + delta,
            startOfDayMinutes(),
            endOfDayMinutes() - block.durationMinutes
        );
    };
    const moveDay = (delta) => {
        block.dayIndex = clamp(block.dayIndex + delta, 0, 6);
    };

    switch (ev.key) {
        case "ArrowUp":
            ev.preventDefault();
            moveMinutes(-state.settings.slotMinutes);
            break;
        case "ArrowDown":
            ev.preventDefault();
            moveMinutes(+state.settings.slotMinutes);
            break;
        case "ArrowLeft":
            ev.preventDefault();
            moveDay(-1);
            break;
        case "ArrowRight":
            ev.preventDefault();
            moveDay(+1);
            break;
        default:
            return;
    }
    saveCurrentState();
    renderBlocks();
}

// ---------- Edit dialog ----------
function openEditDialog(blockId) {
    const block = state.blocks.find((b) => b.id === blockId);
    if (!block) return;
    document.getElementById("editBlockId").value = blockId;
    document.getElementById("editTitle").value = block.title;
    document.getElementById("editLocation").value = block.location || "";
    document.getElementById("editColor").value = block.color || "#22c55e";
    document.getElementById("editDuration").value = String(
        block.durationMinutes
    );
    document.getElementById("editDialog").showModal();
}

document.getElementById("deleteBlockButton").addEventListener("click", (e) => {
    e.preventDefault();

    const id = document.getElementById("editBlockId").value;
    const block = state.blocks.find((b) => b.id === id);

    if (!block) {
        document.getElementById("editDialog").close();
        showToast("Session not found.", true);
        return;
    }

    const summary = formatBlockSummary(block);
    const ok = confirm(
        `Delete this session?\n\n${summary}\n\nThis cannot be undone.`
    );
    if (!ok) return; // keep dialog open if user cancels

    document.getElementById("editDialog").close();
    deleteBlockById(id); // will re-render + toast "Deleted."
});

document.getElementById("saveBlockButton").addEventListener("click", (e) => {
    e.preventDefault();
    const id = document.getElementById("editBlockId").value;
    const changes = {
        title: document.getElementById("editTitle").value.trim(),
        location: document.getElementById("editLocation").value.trim(),
        color: document.getElementById("editColor").value,
        durationMinutes: clamp(
            Number(document.getElementById("editDuration").value) || 60,
            30,
            240
        ),
    };
    document.getElementById("editDialog").close();
    updateBlock(id, changes);
});

// Delegated dblclick as a safety net
dayColumnsContainer.addEventListener("dblclick", (e) => {
    const el = e.target.closest(".session-block");
    if (!el) return;
    const id = el.dataset.blockId;
    if (id) openEditDialog(id);
});

// ---------- Timeline settings ----------
applyTimelineButton.addEventListener("click", () => {
    const startHour = Number(startHourInput.value) || defaultSettings.startHour;
    const endHour = Number(endHourInput.value) || defaultSettings.endHour;
    const slotMinutes =
        Number(slotMinutesInput.value) || defaultSettings.slotMinutes;

    if (endHour <= startHour) {
        showToast("End hour must be after start hour.", true);
        return;
    }
    if (![15, 30, 45, 60].includes(slotMinutes)) {
        showToast("Slot minutes must be 15/30/45/60.", true);
        return;
    }

    state.settings.startHour = clamp(startHour, 5, 12);
    state.settings.endHour = clamp(endHour, 13, 23);
    state.settings.slotMinutes = slotMinutes;

    renderAll();
    saveCurrentState();
    showToast("Timeline updated.");
});

// ---------- Export / Import / Print ----------
exportPngButton.addEventListener("click", async () => {
    const timetableEl = document.querySelector(".timetable");
    if (!window.html2canvas) {
        showToast("html2canvas not loaded. Check your network.", true);
        return;
    }
    const canvas = await window.html2canvas(timetableEl, {
        backgroundColor: getComputedStyle(document.body).backgroundColor,
    });
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `timetable_${new Date().toISOString().slice(0, 10)}.png`;
    link.click();
});

printButton.addEventListener("click", () => window.print());

exportJsonButton.addEventListener("click", () => {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timetable_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

importJsonInput.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || !parsed.settings || !Array.isArray(parsed.blocks)) {
            showToast("Invalid JSON format.", true);
            return;
        }
        state.settings = { ...defaultSettings, ...parsed.settings };
        state.blocks = parsed.blocks;
        renderAll();
        saveCurrentState();
        showToast("Imported JSON.");
    } catch {
        showToast("Failed to import JSON.", true);
    } finally {
        importJsonInput.value = "";
    }
});

clearAllButton.addEventListener("click", () => {
    if (!hasAnyBlocks()) {
        showToast("Nothing to clear.");
        return;
    }

    const ok = confirm(
        `Clear all ${state.blocks.length} session${
            state.blocks.length > 1 ? "s" : ""
        }? This cannot be undone.`
    );
    if (!ok) return;

    state.blocks = [];
    saveCurrentState(); // persist the now-empty state
    renderBlocks();
    showToast("All sessions cleared.");
});

// ---------- Form ----------
createForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    addBlocksFromForm();
});
resetFormButton.addEventListener("click", () => {
    // Ask only if there's something to lose
    if (isCreateFormDirty()) {
        const ok = confirm(
            "Reset the form?\n\nThis will clear the title, location, color, time, duration, and uncheck all days."
        );
        if (!ok) return;
    }
    resetCreateForm();
    showToast("Form reset.");
});

// ---------- Render orchestration ----------
function renderAll() {
    renderTimeRail();
    ensureDayColumns();

    // Clamp any out-of-bounds blocks if settings changed
    const dayStart = startOfDayMinutes();
    const dayEnd = endOfDayMinutes();
    state.blocks.forEach((b) => {
        b.startMinutes = clamp(
            b.startMinutes,
            dayStart,
            dayEnd - b.durationMinutes
        );
    });

    renderBlocks();

    // Reflect settings into inputs
    startHourInput.value = String(state.settings.startHour);
    endHourInput.value = String(state.settings.endHour);
    slotMinutesInput.value = String(state.settings.slotMinutes);
}

function isCreateFormDirty() {
    // Any text fields filled?
    if (titleInput.value.trim() !== "" || locationInput.value.trim() !== "")
        return true;

    // Defaults changed?
    if (colorInput.value.toLowerCase() !== "#22c55e") return true;
    if (startTimeInput.value !== "09:00") return true;
    if ((Number(durationInput.value) || 0) !== 60) return true;

    // Any day selected?
    if (createForm.querySelector('input[name="day"]:checked')) return true;

    return false;
}

function resetCreateForm() {
    createForm.reset();
    colorInput.value = "#22c55e";
    startTimeInput.value = "09:00";
    durationInput.value = "60";
    createForm
        .querySelectorAll('input[name="day"]')
        .forEach((cb) => (cb.checked = false));
}

function hasAnyBlocks() {
    return Array.isArray(state.blocks) && state.blocks.length > 0;
}

function dayNameFromIndex(i) {
    return (
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] || `Day ${i + 1}`
    );
}

function formatBlockSummary(block) {
    const day = dayNameFromIndex(block.dayIndex);
    const start = timeLabelFromMinutes(block.startMinutes);
    const end = timeLabelFromMinutes(
        block.startMinutes + block.durationMinutes
    );
    const title = block.title || "Session";
    const loc = block.location ? ` · ${block.location}` : "";
    return `${title}${loc} - ${day} ${start}-${end}`;
}

// ---------- Boot ----------
(function bootstrap() {
    loadSavedState();
    renderAll();
})();
