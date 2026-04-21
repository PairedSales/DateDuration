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
  const additionalDataBadge = document.getElementById('additional-data-badge');
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
  let startDate     = null;  // JS Date (midnight local)
  let endDate       = null;  // JS Date (midnight local)
  let includeStart  = true;  // whether start date is counted
  let showAdditional = false; // whether to show the additional breakdown

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

  function update(allowSwap = true) {
    if (!startDate || !endDate) {
      showPlaceholder();
      arrowDivider.classList.remove('active');
      return;
    }

    // Auto-swap if start is after end — only when the user has committed a value
    // (blur / Enter / calendar picker), not during live typing, to avoid
    // disrupting a field that is still being edited.
    if (startDate > endDate) {
      if (!allowSwap) {
        showPlaceholder();
        arrowDivider.classList.remove('active');
        return;
      }
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

    // Additional data badge
    additionalDataBadge.hidden = false;
    if (showAdditional) {
      additionalDataBadge.classList.add('active');
      additionalDataBadge.classList.remove('inactive');
      additionalDataBadge.setAttribute('aria-label', 'Additional data shown — click to hide');
    } else {
      additionalDataBadge.classList.add('inactive');
      additionalDataBadge.classList.remove('active');
      additionalDataBadge.setAttribute('aria-label', 'Additional data hidden — click to show');
    }

    // Additional data breakdown
    if (showAdditional) {
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
    additionalDataBadge.hidden = true;
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

  /** Show error message, DO NOT clear the input. */
  function markInvalid(textEl, errorEl) {
    textEl.classList.add('error');
    errorEl.textContent = 'Invalid date (MM/DD/YYYY)';
  }

  // ── Event handlers ───────────────────────────────────────

  // Text inputs — commit on blur, handle masks, and keyboard tweaks
  function wireTextInput(textEl, pickerEl, errorEl, isStart) {
    let prevValue = '';

    textEl.addEventListener('focus', () => {
      prevValue = textEl.value;
    });

    textEl.addEventListener('blur', () => {
      const raw = textEl.value.trim();
      if (!raw) {
        if (isStart) { startDate = null; } else { endDate = null; }
        setInputValue(textEl, pickerEl, null);
        update();
        return;
      }
      const parsed = parseDate(raw);
      if (parsed) {
        if (isStart) { startDate = parsed; } else { endDate = parsed; }
        setInputValue(textEl, pickerEl, parsed);
        errorEl.textContent = '';
        textEl.classList.remove('error');
        update();
      } else {
        markInvalid(textEl, errorEl);
        if (isStart) { startDate = null; } else { endDate = null; }
        update();
      }
    });

    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        textEl.blur();
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const parts = textEl.value.split('/');
        if (parts.length === 3) {
          const d = parseDate(textEl.value);
          if (d) {
            e.preventDefault();
            const cursorPos = textEl.selectionStart;
            let segment = 0;
            if (cursorPos >= 3 && cursorPos <= 5) segment = 1;
            else if (cursorPos >= 6) segment = 2;
            
            if (segment === 0) d.setMonth(d.getMonth() + (e.key === 'ArrowUp' ? 1 : -1));
            else if (segment === 1) d.setDate(d.getDate() + (e.key === 'ArrowUp' ? 1 : -1));
            else d.setFullYear(d.getFullYear() + (e.key === 'ArrowUp' ? 1 : -1));
            
            setInputValue(textEl, pickerEl, d);
            prevValue = textEl.value;
            
            if (segment === 0) textEl.setSelectionRange(0, 2);
            else if (segment === 1) textEl.setSelectionRange(3, 5);
            else textEl.setSelectionRange(6, 10);
            
            if (isStart) { startDate = d; } else { endDate = d; }
            update(false);
          }
        }
      }
    });

    textEl.addEventListener('input', (e) => {
      errorEl.textContent = '';
      textEl.classList.remove('error');

      let raw = textEl.value;
      if (e.inputType === 'insertFromPaste') {
         const d = parseDate(raw);
         if (d) {
            const f = formatDate(d);
            textEl.value = f;
            prevValue = f;
            textEl.classList.add('has-value');
            if (isStart) { startDate = d; } else { endDate = d; }
            pickerEl.value = toPickerValue(d);
            update(false);
            return;
         }
      }

      const isBackspace = e.inputType === 'deleteContentBackward';
      let cursorStart = textEl.selectionStart;
      
      if (isBackspace && prevValue && prevValue[cursorStart] === '/' && raw === prevValue.slice(0, cursorStart) + prevValue.slice(cursorStart + 1)) {
        raw = raw.slice(0, cursorStart - 1) + raw.slice(cursorStart);
        cursorStart--;
      }

      if (!isBackspace && e.data === '/') {
         if (raw[cursorStart - 1] === '/') {
            const beforeSlash = raw.slice(0, cursorStart - 1);
            const slashesCount = (beforeSlash.match(/\//g) || []).length;
            if (slashesCount === 0 && beforeSlash.length === 1) {
               raw = '0' + raw;
               cursorStart++;
            } else if (slashesCount === 1 && beforeSlash.length === 4) {
               raw = raw.slice(0, 3) + '0' + raw.slice(3);
               cursorStart++;
            }
         }
      }

      const cleaned = raw.replace(/\D/g, '').slice(0, 8);
      let m = cleaned.slice(0, 2);
      let dStr = cleaned.slice(2, 4);
      let y = cleaned.slice(4, 8);

      if (m.length === 2 && parseInt(m) > 12) m = '12';
      if (m.length === 2 && parseInt(m) === 0) m = '01';
      if (dStr.length === 2 && parseInt(dStr) > 31) dStr = '31';
      if (dStr.length === 2 && parseInt(dStr) === 0) dStr = '01';

      let formatted = m;
      if (cleaned.length >= 3 || (cleaned.length === 2 && !isBackspace)) formatted += '/';
      formatted += dStr;
      if (cleaned.length >= 5 || (cleaned.length === 4 && !isBackspace)) formatted += '/';
      formatted += y;

      textEl.value = formatted;

      let nonDigitsBeforeCursor = 0;
      for (let i = 0; i < cursorStart; i++) {
        if (!/\d/.test(raw[i])) nonDigitsBeforeCursor++;
      }
      let digitsBeforeCursor = cursorStart - nonDigitsBeforeCursor;
      
      let newCursor = 0;
      let digitsCount = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (digitsCount === digitsBeforeCursor) {
          newCursor = i;
          break;
        }
        if (/\d/.test(formatted[i])) digitsCount++;
        newCursor = i + 1;
      }

      if (!isBackspace && formatted[newCursor] === '/') {
        newCursor++;
      }

      textEl.setSelectionRange(newCursor, newCursor);
      prevValue = formatted;

      if (formatted.trim()) {
        textEl.classList.add('has-value');
        if (formatted.length === 10) {
          const parsed = parseDate(formatted);
          if (parsed) {
            if (isStart) { startDate = parsed; } else { endDate = parsed; }
            pickerEl.value = toPickerValue(parsed);
            update(false);
          }
        } else {
           if (isStart) { startDate = null; } else { endDate = null; }
           update(false);
        }
      } else {
        textEl.classList.remove('has-value');
        if (isStart) { startDate = null; } else { endDate = null; }
        update(false);
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

  // Additional data badge click — toggle breakdown
  additionalDataBadge.addEventListener('click', () => {
    showAdditional = !showAdditional;
    update();
  });

  // Wire everything up
  wireTextInput(startText, startPicker, startError, true);
  wireTextInput(endText,   endPicker,   endError,   false);
  wireCalButton(startCalBtn, startPicker);
  wireCalButton(endCalBtn,   endPicker);
  wirePickerChange(startPicker, startText, startError, true);
  wirePickerChange(endPicker,   endText,   endError,   false);

  // Put keyboard focus in Start Date on initial page load.
  requestAnimationFrame(() => {
    startText.focus();
    startText.setSelectionRange(startText.value.length, startText.value.length);
  });

})();
