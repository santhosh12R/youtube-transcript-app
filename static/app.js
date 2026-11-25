const form = document.getElementById("transcript-form");
const urlInput = document.getElementById("url-input");
const clearBtn = document.getElementById("clear-btn");
const submitBtn = document.getElementById("submit-btn");
const btnLabel = submitBtn.querySelector(".btn-label");
const spinner = submitBtn.querySelector(".spinner");
const errorBox = document.getElementById("error-box");
const resultSection = document.getElementById("result-section");

const videoThumb = document.getElementById("video-thumb");
const videoTitle = document.getElementById("video-title");
const videoAuthor = document.getElementById("video-author");
const wordCount = document.getElementById("word-count");
const segmentCount = document.getElementById("segment-count");
const langSelect = document.getElementById("lang-select");

const toggleTimestamps = document.getElementById("toggle-timestamps");
const toggleParagraph = document.getElementById("toggle-paragraph");
const searchInput = document.getElementById("search-input");
const copyBtn = document.getElementById("copy-btn");
const downloadTxtBtn = document.getElementById("download-txt-btn");
const downloadSrtBtn = document.getElementById("download-srt-btn");
const transcriptContainer = document.getElementById("transcript-container");

let currentData = null;

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatSrtTime(seconds) {
  const msTotal = Math.max(0, Math.round(seconds * 1000));
  const hrs = Math.floor(msTotal / 3600000);
  const mins = Math.floor((msTotal % 3600000) / 60000);
  const secs = Math.floor((msTotal % 60000) / 1000);
  const ms = msTotal % 1000;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightText(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  return safe.replace(regex, "<mark>$1</mark>");
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  btnLabel.textContent = isLoading ? "Fetching..." : "Get Transcript";
  spinner.hidden = !isLoading;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function renderTranscript() {
  if (!currentData) return;

  const showTimes = toggleTimestamps.checked;
  const paragraphMode = toggleParagraph.checked;
  const query = searchInput.value.trim();
  const segments = currentData.segments;

  toggleTimestamps.disabled = paragraphMode;

  const filtered = query
    ? segments.filter((s) => s.text.toLowerCase().includes(query.toLowerCase()))
    : segments;

  if (filtered.length === 0) {
    transcriptContainer.innerHTML = `<div class="empty-search">No matching lines for "${escapeHtml(query)}".</div>`;
    return;
  }

  if (paragraphMode) {
    const joined = filtered.map((s) => s.text).join(" ");
    transcriptContainer.innerHTML = `<div class="paragraph-text">${highlightText(joined, query)}</div>`;
    return;
  }

  const html = filtered
    .map((seg) => {
      const timeSec = Math.floor(seg.start);
      const timeUrl = `${currentData.video_url}&t=${timeSec}s`;
      const timeCell = showTimes
        ? `<a class="timestamp-link" href="${timeUrl}" target="_blank" rel="noopener noreferrer">${formatTime(seg.start)}</a>`
        : "";
      return `
        <div class="segment-row ${showTimes ? "" : "no-time"}">
          ${timeCell}
          <div class="segment-text">${highlightText(seg.text, query)}</div>
        </div>
      `;
    })
    .join("");

  transcriptContainer.innerHTML = html;
}

function populateResult(data) {
  currentData = data;
  resultSection.hidden = false;

  videoThumb.src = data.metadata.thumbnail;
  videoTitle.textContent = data.metadata.title;
  videoTitle.href = data.video_url;
  videoAuthor.textContent = data.metadata.author;

  const words = data.full_text ? data.full_text.split(/\s+/).filter(Boolean).length : 0;
  wordCount.textContent = `${words.toLocaleString()} words`;
  segmentCount.textContent = `${data.segments.length} segments`;

  langSelect.innerHTML = data.available_languages
    .map((lang) => {
      const suffix = lang.is_generated ? " (auto-generated)" : "";
      const selected = lang.code === data.language.code ? "selected" : "";
      return `<option value="${escapeHtml(lang.code)}" ${selected}>${escapeHtml(lang.name)}${suffix}</option>`;
    })
    .join("");

  renderTranscript();
}

async function fetchTranscript(url, lang = null) {
  hideError();
  setLoading(true);
  try {
    const params = new URLSearchParams({ url });
    if (lang) params.set("lang", lang);

    const response = await fetch(`/api/transcript?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || "Unable to fetch transcript.");
    }
    populateResult(payload);
  } catch (err) {
    resultSection.hidden = true;
    showError(err.message || "Something went wrong while fetching the transcript.");
  } finally {
    setLoading(false);
  }
}

function buildPlainText() {
  if (!currentData) return "";
  if (toggleParagraph.checked || !toggleTimestamps.checked) {
    return currentData.segments.map((s) => s.text).join(" ");
  }
  return currentData.segments
    .map((s) => `[${formatTime(s.start)}] ${s.text}`)
    .join("\n");
}

function buildSrtText() {
  if (!currentData) return "";
  return currentData.segments
    .map((s, idx) => {
      const start = formatSrtTime(s.start);
      const end = formatSrtTime(s.start + Math.max(s.duration, 0.5));
      return `${idx + 1}\n${start} --> ${end}\n${s.text}\n`;
    })
    .join("\n");
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

urlInput.addEventListener("input", () => {
  clearBtn.hidden = !urlInput.value;
});

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  clearBtn.hidden = true;
  urlInput.focus();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;
  fetchTranscript(url);
});

langSelect.addEventListener("change", () => {
  const url = urlInput.value.trim() || currentData?.video_url;
  if (url) {
    fetchTranscript(url, langSelect.value);
  }
});

toggleTimestamps.addEventListener("change", renderTranscript);
toggleParagraph.addEventListener("change", renderTranscript);
searchInput.addEventListener("input", renderTranscript);

copyBtn.addEventListener("click", async () => {
  const text = buildPlainText();
  if (!text) return;
  await navigator.clipboard.writeText(text);
  const original = copyBtn.textContent;
  copyBtn.textContent = "Copied!";
  setTimeout(() => {
    copyBtn.textContent = original;
  }, 1500);
});

downloadTxtBtn.addEventListener("click", () => {
  if (!currentData) return;
  triggerDownload(`${currentData.video_id}-transcript.txt`, buildPlainText());
});

downloadSrtBtn.addEventListener("click", () => {
  if (!currentData) return;
  triggerDownload(`${currentData.video_id}-transcript.srt`, buildSrtText());
});
