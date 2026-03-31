/**
 * DateDuration — app.js
 *
 * Handles:
 *  - Parsing dates typed in virtually any format
 *  - Displaying / clearing the text inputs
 *  - Bridging the hidden native date-picker to the text fields
 *  - Auto-swapping when start > end
 *  - Computing the day count (with optional start-date inclusion)
 *  - Updating the result UI
 */

(function () {
  'use strict';

  // ── DOM refs ────────────────────────────────────────────
  const startText   = document.getElementById('start-text');
  const endText     = document.getElementById('end-text');
  const startPicker = document.getElementById('start-picker');
  const endPicker   = document.getElementById('end-picker');
  const startCalBtn = document.getElementById('start-cal-btn');
  const endCalBtn   = document.getElementById('end-cal-btn');
  const startError  = document.getElementById('start-error');
  const endError    = document.getElementById('end-error');
  const additionalDataCb = document.getElementById('additional-data');
  const resultArea     = document.getElementById('result-area');
  const resultPlaceholder = document.getElementById('result-placeholder');
  const resultDisplay  = document.getElementById('result-display');
  const resultNumber   = document.getElementById('result-number');
  const resultLabel    = document.getElementById('result-label');
  const resultRange    = document.getElementById('result-range');
  const startDateBadge = document.getElementById('start-date-badge');
  const arrowDivider   = document.querySelector('.arrow-divider');
  const breakdownGrid  = document.getElementById('breakdown-grid');
  const bdYears        = document.getElementById('bd-years');
  const bdMonths       = document.getElementById('bd-months');
  const bdHours        = document.getElementById('bd-hours');
  const bdMinutes      = document.getElementById('bd-minutes');
  const bdSeconds      = document.getElementById('bd-seconds');

  // ── State ───────────────────────────────────────────────
  let startDate    = null;  // JS Date (midnight local)
  let endDate      = null;  // JS Date (midnight local)
  let includeStart = true; // whether start date is counted

  // ── Helpers ─────────────────────────────────────────────

  /** Zero-pad a number to `width` digits. */
  function pad(n, width = 2) {
    return String(n).padStart(width, '0');
  }

  /** Format a Date as MM/DD/YYYY. */
  function formatDate(d) {
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  }

  /** Format a Date as YYYY-MM-DD (for the native picker value). */
  function toPickerValue(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const MONTH_NAMES = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  /**
   * Try to parse any reasonable human-entered date string.
   * Returns a Date at local midnight, or null if invalid.
   *
   * Supported forms (examples):
   *   MM/DD/YYYY  03/31/2026
   *   M/D/YYYY    3/1/2026
   *   M/D/YY      3/1/26  → 20YY
   *   YYYY-MM-DD  2026-03-31  (ISO)
   *   MM-DD-YYYY  03-31-2026
   *   DD Month YYYY    31 March 2026
   *   Month DD, YYYY   March 31, 2026
   *   Month DD YYYY    March 31 2026
   *   YYYYMMDD    20260331
   */
  function parseDate(raw) {
    if (!raw || !raw.trim()) return null;

    const s = raw.trim().replace(/\s+/g, ' ');

    let m, y, d;

    // ── YYYY-MM-DD (ISO) ─────────────────────────────────
    let rx = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (rx) {
      y = +rx[1]; m = +rx[2]; d = +rx[3];
      return makeDate(y, m, d);
    }

    // ── YYYYMMDD (compact) ───────────────────────────────
    rx = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (rx) {
      y = +rx[1]; m = +rx[2]; d = +rx[3];
      return makeDate(y, m, d);
    }

    // ── MM/DD/YYYY or MM-DD-YYYY or MM.DD.YYYY ───────────
    rx = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (rx) {
      m = +rx[1]; d = +rx[2]; y = +rx[3];
      if (y < 100) y += 2000;
      return makeDate(y, m, d);
    }

    // ── Month DD, YYYY  or  Month DD YYYY ───────────────
    rx = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})[,\s]+(\d{2,4})$/);
    if (rx) {
      m = monthIndex(rx[1]);
      if (m === null) return null;
      d = +rx[2]; y = +rx[3];
      if (y < 100) y += 2000;
      return makeDate(y, m + 1, d);
    }

    // ── DD Month YYYY ────────────────────────────────────
    rx = s.match(/^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{2,4})$/);
    if (rx) {
      d = +rx[1]; m = monthIndex(rx[2]);
      if (m === null) return null;
      y = +rx[3];
      if (y < 100) y += 2000;
      return makeDate(y, m + 1, d);
    }

    return null;
  }

  function monthIndex(name) {
    const idx = MONTH_NAMES[name.toLowerCase()];
    return idx !== undefined ? idx : null;
  }

  /**
   * Build a local-midnight Date.  Returns null if the date is invalid
   * (e.g. Feb 30, month 13, year < 1).
   */
  function makeDate(year, month, day) {
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(year, month - 1, day);
    // If JS normalises the date (e.g. Feb 30 → Mar 2), it's invalid.
    if (
      dt.getFullYear() !== year ||
      dt.getMonth()    !== month - 1 ||
      dt.getDate()     !== day
    ) {
      return null;
    }
    return dt;
  }

  /** Compute |startDate - endDate| in whole days. */
  function daysBetween(a, b) {
    const msPerDay = 86400000;
    return Math.round(Math.abs(b.getTime() - a.getTime()) / msPerDay);
  }

  /** Break down a day count into equivalent years, months, hours, minutes, seconds. */
  const DAYS_PER_YEAR  = 365.2425;
  const DAYS_PER_MONTH = 30.436875;

  function computeBreakdown(days) {
    return {
      years:   Math.floor(days / DAYS_PER_YEAR),
      months:  Math.floor(days / DAYS_PER_MONTH),
      hours:   days * 24,
      minutes: days * 24 * 60,
      seconds: days * 24 * 60 * 60,
    };
  }

  /** Format a Date for the result-range display. */
  const DISPLAY_OPTS = { year: 'numeric', month: 'long', day: 'numeric' };
  function displayDate(d) {
    return d.toLocaleDateString('en-US', DISPLAY_OPTS);
  }

  // ── Core update ─────────────────────────────────────────

  /** Sync the badge text and colour to the current includeStart state. */
  function updateBadge() {
    if (includeStart) {
      startDateBadge.textContent = 'start date included';
      startDateBadge.setAttribute('aria-label', 'Start date included in count — click to exclude');
      startDateBadge.classList.add('included');
      startDateBadge.classList.remove('excluded');
    } else {
      startDateBadge.textContent = 'start date excluded';
      startDateBadge.setAttribute('aria-label', 'Start date excluded from count — click to include');
      startDateBadge.classList.add('excluded');
      startDateBadge.classList.remove('included');
    }
  }

  function update() {
    if (!startDate || !endDate) {
      showPlaceholder();
      arrowDivider.classList.remove('active');
      return;
    }

    // Auto-swap if start is after end
    if (startDate > endDate) {
      const tmp = startDate;
      startDate = endDate;
      endDate   = tmp;
      // Update the text inputs to reflect the swap
      setInputValue(startText, startPicker, startDate);
      setInputValue(endText, endPicker, endDate);
    }

    arrowDivider.classList.add('active');

    const days = daysBetween(startDate, endDate) + (includeStart ? 1 : 0);

    // Animate: briefly hide, then show with new value
    resultDisplay.hidden = true;
    resultNumber.textContent = days.toLocaleString();
    resultLabel.textContent  = days === 1 ? 'DAY' : 'DAYS';
    resultRange.textContent  =
      `${displayDate(startDate)} → ${displayDate(endDate)}`;

    resultPlaceholder.hidden = true;
    resultArea.classList.add('has-result');

    updateBadge();
    startDateBadge.hidden = false;

    // Additional data breakdown
    if (additionalDataCb.checked) {
      const bd = computeBreakdown(days);
      bdYears.textContent   = bd.years.toLocaleString();
      bdMonths.textContent  = bd.months.toLocaleString();
      bdHours.textContent   = bd.hours.toLocaleString();
      bdMinutes.textContent = bd.minutes.toLocaleString();
      bdSeconds.textContent = bd.seconds.toLocaleString();
      breakdownGrid.hidden  = false;
    } else {
      breakdownGrid.hidden = true;
    }

    // Trigger animation
    requestAnimationFrame(() => {
      resultDisplay.hidden = false;
    });
  }

  function showPlaceholder() {
    resultDisplay.hidden     = true;
    resultPlaceholder.hidden = false;
    startDateBadge.hidden    = true;
    resultArea.classList.remove('has-result');
  }

  /** Sync text input + native picker from a parsed Date. */
  function setInputValue(textEl, pickerEl, dateObj) {
    if (dateObj) {
      textEl.value  = formatDate(dateObj);
      pickerEl.value = toPickerValue(dateObj);
      textEl.classList.add('has-value');
      textEl.classList.remove('error');
    } else {
      textEl.value   = '';
      pickerEl.value = '';
      textEl.classList.remove('has-value');
    }
  }

  /** Show shake + error message, then clear the input. */
  function markInvalid(textEl, errorEl) {
    textEl.classList.add('error');
    errorEl.textContent = 'Invalid date — please try again';
    setTimeout(() => {
      textEl.value = '';
      textEl.classList.remove('error', 'has-value');
      errorEl.textContent = '';
    }, 900);
  }

  // ── Event handlers ───────────────────────────────────────

  /**
   * Handle blur / Enter on a text input.
   * Parse the value; on success update state + picker + style, on failure shake + clear.
   */
  function handleTextCommit(textEl, pickerEl, errorEl, isStart) {
    const raw = textEl.value.trim();
    if (!raw) {
      // Cleared intentionally
      if (isStart) { startDate = null; } else { endDate = null; }
      setInputValue(textEl, pickerEl, null);
      update();
      return;
    }

    const parsed = parseDate(raw);
    if (!parsed) {
      markInvalid(textEl, errorEl);
      if (isStart) { startDate = null; } else { endDate = null; }
      update();
      return;
    }

    if (isStart) { startDate = parsed; } else { endDate = parsed; }
    setInputValue(textEl, pickerEl, parsed);
    errorEl.textContent = '';
    update();
  }

  // Text inputs — commit on blur and Enter
  function wireTextInput(textEl, pickerEl, errorEl, isStart) {
    textEl.addEventListener('blur', () => {
      handleTextCommit(textEl, pickerEl, errorEl, isStart);
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        textEl.blur();
      }
    });
    // Live feedback: add has-value class while typing if something is entered
    textEl.addEventListener('input', () => {
      if (textEl.value.trim()) {
        textEl.classList.add('has-value');
      } else {
        textEl.classList.remove('has-value');
      }
    });
  }

  // Calendar button — open the native date picker
  function wireCalButton(calBtn, pickerEl) {
    calBtn.addEventListener('click', () => {
      pickerEl.showPicker ? pickerEl.showPicker() : pickerEl.click();
    });
  }

  // Native picker change → update text field + state
  function wirePickerChange(pickerEl, textEl, errorEl, isStart) {
    pickerEl.addEventListener('change', () => {
      const v = pickerEl.value; // YYYY-MM-DD
      if (!v) return;
      const [yr, mo, dy] = v.split('-').map(Number);
      const d = makeDate(yr, mo, dy);
      if (!d) return;
      if (isStart) { startDate = d; } else { endDate = d; }
      setInputValue(textEl, pickerEl, d);
      errorEl.textContent = '';
      update();
    });
  }

  // Badge click — toggle start-date inclusion
  startDateBadge.addEventListener('click', () => {
    includeStart = !includeStart;
    update();
  });

  // Additional data checkbox
  additionalDataCb.addEventListener('change', update);

  // Wire everything up
  wireTextInput(startText, startPicker, startError, true);
  wireTextInput(endText,   endPicker,   endError,   false);
  wireCalButton(startCalBtn, startPicker);
  wireCalButton(endCalBtn,   endPicker);
  wirePickerChange(startPicker, startText, startError, true);
  wirePickerChange(endPicker,   endText,   endError,   false);

})();
