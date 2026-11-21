import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import miniOtamaUrl from './assets/mini-otama.svg?no-inline';
import { makeScaleDemo, scaleKeys } from './demo';
import {
  centsFrom,
  isMatch,
  makePitchReader,
  nearOctave,
  noteName,
  pitchWindowSize,
  updatePitchReadout,
  type Pitch,
} from './pitch';
import { lastAt, parseScore, readScore, type Score, type Span } from './score';
import { makeScoreOverlay } from './score-overlay';
import { drawStaffTargets } from './staff-targets';
import { makeStepGate } from './step-practice';
import './style.css';

function el(id: string): HTMLElement;
function el<T extends HTMLElement>(id: string, type: { new (): T }): T;
function el(id: string, type: { new (): HTMLElement } = HTMLElement) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Unexpected element: #${id}`);
  return element;
}
const device = el('device', HTMLSelectElement);
const inputToggle = el('input-toggle', HTMLButtonElement);
const inputResume = el('input-resume', HTMLButtonElement);
const inputPermission: HTMLElement & {
  setConstraints?: (constraints: MediaTrackConstraints) => void;
  readonly track?: MediaStreamTrack | null;
  readonly error?: DOMException | null;
} = el('input-permission');
const nativeInput =
  window.isSecureContext &&
  typeof inputPermission.setConstraints === 'function' &&
  'track' in inputPermission &&
  Boolean(window.AudioContext);
const inputStatus = el('input-status');
const file = el('file', HTMLInputElement);
const openScore = el('open-score', HTMLButtonElement);
const demoButton = el('demo', HTMLButtonElement);
const demoKey = el('demo-key', HTMLSelectElement);
const practiceMode = el('practice-mode', HTMLSelectElement);
const stepGate = makeStepGate();
const repeatPractice = el('repeat-practice', HTMLButtonElement);
const repeatEnabled = () =>
  repeatPractice.getAttribute('aria-pressed') === 'true';
const scoreOverlay = makeScoreOverlay(miniOtamaUrl);
const playedNotes = new Map<Span, { midi: number; hit: boolean }>();
let stepIndex = 0;
const isStepMode = () => practiceMode.value === 'step';
const part = el('part', HTMLSelectElement);
const speed = el('speed', HTMLSelectElement);
const play = el('play', HTMLButtonElement);
const reset = el('reset', HTMLButtonElement);
const sheet = el('score');
const scoreStatus = el('score-status');
const feedback = el('feedback');
const position = el('position');
const canvas = el('chart', HTMLCanvasElement);
const context = canvas.getContext('2d');
if (!context) throw new Error('Canvas 2D is unavailable');
const ctx = context;
const theme = getComputedStyle(document.documentElement);
const chartColors = {
  label: theme.getPropertyValue('--muted').trim(),
  grid: theme.getPropertyValue('--chart-grid').trim(),
  target: theme.getPropertyValue('--accent').trim(),
  hit: theme.getPropertyValue('--hit').trim(),
  miss: theme.getPropertyValue('--miss').trim(),
  free: theme.getPropertyValue('--free').trim(),
  playhead: theme.color,
};
const countDisplay = el('count-in');

let model: Score | undefined;
let osmd: OpenSheetMusicDisplay | undefined;
let renderedWidth = 0;
let seconds = 0;
let playing = false;
let countBeatMs = 0;
let playbackAnchor = 0;
let playbackOffset = 0;
let playbackRate = 1;
let lastDraw = 0;
let lastSample = 0;
let raf = 0;
let history: { time: number; midi: number; hit: boolean | null }[] = [];
let peek: OpenSheetMusicDisplay['cursor']['Iterator'] | undefined;

let pitch: Pitch | null = null;
let pitchReadout: ReturnType<typeof updatePitchReadout> = null;
let lastPitchTarget: ReturnType<typeof targetAt>;
let audio:
  | {
      context: AudioContext;
      stream: MediaStream;
      readPitch: () => Pitch | null;
    }
  | undefined;
let inputRequest = 0;
let requesting = false;
let pageActive = true;
let restartOnReturn = false;

function status(target: HTMLElement, message: string, level = '') {
  if (target.textContent !== message) target.textContent = message;
  target.classList.toggle('error', level === 'error');
  target.classList.toggle('good', level === 'good');
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default',
    );
    const selected = device.value;
    device.replaceChildren(
      new Option('システムの既定', ''),
      ...inputs.map(
        (d, i) => new Option(d.label || `入力 ${i + 1}`, d.deviceId),
      ),
    );
    if (inputs.some((d) => d.deviceId === selected)) device.value = selected;
    if (device.value !== selected) configureNativeInput();
  } catch (error) {
    console.warn('入力機器の一覧を取得できません:', error);
  }
}

function updateInputControls() {
  const showNative = nativeInput && !audio && !requesting;
  inputPermission.hidden = !showNative;
  inputToggle.hidden = showNative;
  const label = audio ? '入力を停止' : requesting ? 'キャンセル' : '入力を開始';
  inputToggle.setAttribute('aria-label', label);
  inputToggle.title = label;
  inputToggle.classList.toggle('can-stop', Boolean(audio || requesting));
  inputResume.hidden = !audio || audio.context.state === 'running';
  device.disabled = Boolean(audio || requesting);
}

function inputConstraints(): MediaTrackConstraints {
  return {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 1 },
  };
}

function configureNativeInput() {
  if (nativeInput)
    inputPermission.setConstraints?.({
      ...inputConstraints(),
      ...(device.value ? { deviceId: { ideal: device.value } } : {}),
    });
}

function stopInput(message = '入力オフ', error = false) {
  ++inputRequest;
  requesting = false;
  if (audio) {
    const { context, stream } = audio;
    audio = undefined;
    stream.getTracks().forEach((t) => t.stop());
    void context
      .close()
      .catch((err) => console.warn('AudioContext close failed:', err));
  }
  pitch = null;
  pitchReadout = null;
  lastPitchTarget = undefined;
  stepGate.interrupt();
  updateInputControls();
  status(inputStatus, message, error ? 'error' : '');
  updateView();
}

function inputFailed(error: unknown) {
  const denied =
    error instanceof DOMException && error.name === 'NotAllowedError';
  stopInput(
    denied
      ? nativeInput
        ? 'マイク未許可：許可ボタンから再試行'
        : 'マイク未許可：サイト設定で許可してください'
      : `音声入力を開始できません: ${messageOf(error)}`,
    true,
  );
}

function updateInputContext(context: AudioContext) {
  if (audio?.context !== context) return;
  updateInputControls();
  const running = context.state === 'running';
  status(
    inputStatus,
    running
      ? '入力中'
      : 'マイクは接続済みです。「音程検出を開始」を押してください。',
    running ? 'good' : '',
  );
  if (running) {
    updateView();
    scheduleFrame();
  } else {
    pitch = null;
    pitchReadout = null;
    lastPitchTarget = undefined;
    stepGate.interrupt();
    updateView();
  }
}

function resumeInput(context: AudioContext) {
  // Autoplay policy may leave resume() pending until the user interacts.
  void context.resume().then(
    () => updateInputContext(context),
    (error) => {
      if (audio?.context === context)
        status(
          inputStatus,
          `音程検出を開始できません: ${messageOf(error)}`,
          'error',
        );
    },
  );
}

async function startInput(nativeStream?: MediaStream) {
  if (!pageActive || audio || requesting) {
    if (nativeStream && audio?.stream !== nativeStream)
      nativeStream.getTracks().forEach((track) => track.stop());
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
    nativeStream?.getTracks().forEach((track) => track.stop());
    status(
      inputStatus,
      'このブラウザで音声入力を使うには、対応ブラウザで HTTPS または localhost を開いてください。',
      'error',
    );
    return;
  }
  const request = ++inputRequest;
  requesting = true;
  updateInputControls();
  status(
    inputStatus,
    nativeStream ? '音声入力を接続中…' : '音声入力の許可を待っています…',
  );
  let context: AudioContext | undefined;
  let stream = nativeStream;
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        ...inputConstraints(),
        ...(device.value ? { deviceId: { exact: device.value } } : {}),
      },
    });
    if (request !== inputRequest) return;
    if (!stream.getAudioTracks().some((track) => track.readyState === 'live')) {
      throw new Error('利用できる音声トラックがありません。');
    }
    context = new AudioContext();
    const analyser = context.createAnalyser();
    const sampleRate = context.sampleRate;
    const samples = new Float32Array(pitchWindowSize(sampleRate));
    const getPitch = makePitchReader(samples.length);
    analyser.fftSize = samples.length;
    context.createMediaStreamSource(stream).connect(analyser);
    audio = {
      context,
      stream,
      readPitch() {
        analyser.getFloatTimeDomainData(samples);
        return getPitch(samples, sampleRate);
      },
    };
    for (const track of stream.getAudioTracks())
      track.addEventListener('ended', () => {
        if (request === inputRequest)
          stopInput(
            '音声入力が切断されました。機器を確認して再開してください。',
            true,
          );
      });
    requesting = false;
    const activeContext = context;
    context.addEventListener('statechange', () =>
      updateInputContext(activeContext),
    );
    updateInputContext(context);
    if (context.state !== 'running') resumeInput(context);
    void refreshDevices();
  } catch (error) {
    if (request === inputRequest) inputFailed(error);
  } finally {
    if (stream && audio?.stream !== stream)
      stream.getTracks().forEach((t) => t.stop());
    if (context && audio?.context !== context && context.state !== 'closed') {
      void context
        .close()
        .catch((err) => console.warn('AudioContext close failed:', err));
    }
  }
}

async function startInputOnOpen() {
  const request = inputRequest;
  let permission: PermissionState | undefined;
  try {
    permission = (await navigator.permissions?.query({ name: 'microphone' }))
      ?.state;
  } catch (error) {
    // Some browsers expose Permissions but do not support querying microphone permission.
    if (!(error instanceof TypeError))
      console.warn('マイクの許可状態を確認できません:', error);
  }
  if (!pageActive || request !== inputRequest) return;
  if (permission === 'granted' || (!nativeInput && permission !== 'denied')) {
    void startInput();
  } else if (nativeInput) {
    status(inputStatus, 'マイクの許可ボタンを押して入力を開始してください。');
  } else {
    inputFailed(
      new DOMException('Microphone access denied', 'NotAllowedError'),
    );
  }
}

function activeNotes() {
  return model?.parts[Number(part.value)]?.notes ?? [];
}

function targetAt(beat: number) {
  const notes = activeNotes();
  const note = notes[lastAt(notes, beat, (n) => n.start)];
  return note && beat < note.end ? note : undefined;
}

function syncCursor(beat: number, rewind = false) {
  if (!osmd || !model || !renderedWidth) return;
  const measure = lastAt(model.measures, beat + 1e-7, (x) => x.at);
  const currentMeasure = model.measures[measure];
  if (!currentMeasure) return;
  const cursor = osmd.cursor;
  if (rewind || !peek) {
    cursor.reset();
    cursor.show();
    // Use independently reset iterators: OSMD's clone does not preserve the measure position.
    peek = cursor.Iterator;
    cursor.reset();
    peek.moveToNext();
  }
  const localBeat = beat - currentMeasure.at;
  let changed = rewind;
  while (
    !peek.EndReached &&
    (peek.CurrentMeasureIndex < measure ||
      (peek.CurrentMeasureIndex === measure &&
        peek.CurrentRelativeInMeasureTimestamp.RealValue * 4 <=
          localBeat + 1e-7))
  ) {
    cursor.Iterator.moveToNext();
    peek.moveToNext();
    changed = true;
  }
  if (changed) {
    cursor.update();
    // Scroll only within the score, leaving the practice controls in place.
    const marker = cursor.cursorElement.getBoundingClientRect();
    const box = sheet.getBoundingClientRect();
    if (marker.bottom > box.bottom || marker.top < box.top)
      sheet.scrollTop += marker.top - box.top - 12;
  }
}

function renderScore() {
  const width = sheet.clientWidth;
  if (!osmd || !model || !width || width === renderedWidth) return;
  scoreOverlay.clear();
  osmd.render();
  renderedWidth = width;
  drawStaffTargets(osmd, model.parts, Number(part.value));
  syncCursor(
    (isStepMode() ? activeNotes()[stepIndex]?.start : undefined) ??
      model.beatAt(seconds),
    true,
  );
  const currentPart = model.parts[Number(part.value)];
  if (!currentPart) return;
  for (const [note, { midi, hit }] of playedNotes)
    scoreOverlay.plot(osmd, currentPart, note, midi, hit);
}

function makeNoteStrip(container: HTMLElement) {
  let start = 60;
  const cells = Array.from({ length: 12 }, () =>
    document.createElement('span'),
  );
  const marker = container.querySelector('.tuner-note-marker');
  const strip = container.querySelector('.tuner-note-cells');
  if (!(marker instanceof HTMLElement) || !strip)
    throw new Error(`Incomplete note strip: #${container.id}`);
  strip.replaceChildren(...cells);
  return (midi?: number, target?: number) => {
    const note = midi === undefined ? undefined : Math.round(midi);
    const goal = target === undefined ? undefined : Math.round(target);
    if (goal !== undefined) start = goal - 5;
    else if (note !== undefined) start = 12 * Math.floor(note / 12);
    cells.forEach((cell, i) => {
      const cellNote = start + i;
      const label = noteName(cellNote);
      if (cell.textContent !== label) cell.textContent = label;
      cell.classList.toggle('current', note === cellNote);
      cell.classList.toggle('target', goal === cellNote);
    });
    marker.hidden = midi === undefined;
    if (midi !== undefined)
      container.style.setProperty(
        '--pitch-position',
        `${((midi - start + 0.5) / cells.length) * 100}%`,
      );
  };
}

const updateTunerNotes = makeNoteStrip(el('tuner-notes'));
const updateStepNotes = makeNoteStrip(el('step-notes'));

function updateView() {
  const displayPitch = pitchReadout?.pitch;
  status(el('live-note'), displayPitch ? noteName(displayPitch.midi) : '—');
  status(
    el('live-frequency'),
    displayPitch ? `${displayPitch.hz.toFixed(1)} Hz` : '— Hz',
  );
  const liveCents = displayPitch
    ? Math.round(centsFrom(displayPitch.midi, Math.round(displayPitch.midi)))
    : 0;
  const centsLabel = el('live-cents');
  centsLabel.hidden = !displayPitch;
  status(
    centsLabel,
    displayPitch ? `${liveCents > 0 ? '+' : ''}${liveCents} ¢` : '',
  );
  el('pitch-signal').hidden =
    Boolean(displayPitch) || audio?.context.state !== 'running';
  updateTunerNotes(displayPitch?.midi);
  if (model) {
    const stepMode = isStepMode();
    const notes = stepMode ? activeNotes() : undefined;
    const stepTarget = notes?.[stepIndex];
    const beat = stepTarget?.start ?? model.beatAt(seconds);
    syncCursor(beat);
    const measure =
      model.measures[lastAt(model.measures, beat + 1e-7, (x) => x.at)];
    const measureLabel = measure ? `小節 ${measure.number}　·　` : '';
    const target = stepMode ? stepTarget : targetAt(beat);
    const total = model.secondsAt(model.end);
    const done = seconds >= total;
    status(el('step-note'), stepTarget ? noteName(stepTarget.midi) : '—');
    if (stepMode) {
      status(
        el('step-input'),
        displayPitch ? noteName(displayPitch.midi) : '—',
      );
      updateStepNotes(
        displayPitch && stepTarget
          ? nearOctave(displayPitch.midi, stepTarget.midi)
          : displayPitch?.midi,
        stepTarget?.midi,
      );
    }
    status(
      position,
      notes
        ? `${stepIndex} / ${notes.length} 音クリア${done || !measure ? '' : `　·　小節 ${measure.number}`}`
        : `${measureLabel}${seconds.toFixed(1)} / ${total.toFixed(1)} 秒`,
    );
    const judgedPitch = lastPitchTarget === target ? displayPitch : undefined;
    if (done) status(feedback, '練習終了', 'good');
    else if (!target) status(feedback, '休符・演奏なし');
    else if (!playing || countBeatMs || !audio)
      status(
        feedback,
        `目標 ${noteName(target.midi)}${stepMode && playing && !audio ? ' · 音声入力を開始してください' : ''}`,
      );
    else if (!judgedPitch)
      status(
        feedback,
        `目標 ${noteName(target.midi)}${displayPitch ? ' · 判定中' : ''}`,
      );
    else {
      const cents = centsFrom(
        nearOctave(judgedPitch.midi, target.midi),
        target.midi,
      );
      const hit = isMatch(cents);
      status(
        feedback,
        `目標 ${noteName(target.midi)} · ${hit ? '合っています' : cents > 0 ? '高い' : '低い'} (${Math.abs(Math.round(cents))} ¢)`,
        hit ? 'good' : 'error',
      );
    }
  } else {
    status(el('step-note'), '—');
    status(el('step-input'), displayPitch ? noteName(displayPitch.midi) : '—');
    if (isStepMode()) updateStepNotes(displayPitch?.midi);
  }
  if (!isStepMode()) drawChart();
}

function drawChart() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const ratio = window.devicePixelRatio || 1;
  const w = Math.round(width * ratio),
    h = Math.round(height * ratio);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(w / width, 0, 0, h / height, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '12px system-ui';
  if (!model) {
    ctx.fillStyle = chartColors.label;
    ctx.textAlign = 'center';
    ctx.fillText(
      '楽譜を読み込むと、ここに音程バーが表示されます',
      width / 2,
      height / 2,
      width - 20,
    );
    return;
  }
  const left = 42,
    right = width - 12,
    top = 16,
    bottom = height - 23;
  const windowStart = Math.max(0, seconds - 2);
  const windowEnd = windowStart + 8;
  const x = (time: number) =>
    left + ((time - windowStart) * (right - left)) / 8;
  const notes = activeNotes();
  const first = Math.max(
    0,
    lastAt(notes, model.beatAt(windowStart), (n) => n.start),
  );
  const bars: Span[] = [];
  let low = Infinity,
    high = -Infinity;
  const lastBeat = model.beatAt(windowEnd);
  for (let i = first; i < notes.length; i++) {
    const note = notes[i];
    if (!note || note.start > lastBeat) break;
    if (model.secondsAt(note.end) < windowStart) continue;
    low = Math.min(low, note.midi);
    high = Math.max(high, note.midi);
    bars.push(note);
  }
  if (!bars.length) low = high = notes[first]?.midi ?? 60;
  low = Math.floor(low) - 2;
  high = Math.ceil(high) + 2;
  const y = (midi: number) =>
    bottom - ((midi - low) / (high - low)) * (bottom - top);
  ctx.textAlign = 'right';
  for (
    let midi = low, step = Math.ceil((high - low) / 10);
    midi <= high;
    midi += step
  ) {
    const line = y(midi);
    ctx.fillStyle = chartColors.label;
    ctx.fillText(noteName(midi), left - 6, line + 4);
    ctx.fillStyle = chartColors.grid;
    ctx.fillRect(left, line, right - left, 1);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top - 7, right - left, bottom - top + 14);
  ctx.clip();
  ctx.fillStyle = chartColors.target;
  for (const note of bars) {
    const start = x(model.secondsAt(note.start)),
      end = x(model.secondsAt(note.end));
    ctx.fillRect(start, y(note.midi) - 4, Math.max(1, end - start - 2), 8);
  }
  for (const point of history) {
    const line = y(point.midi);
    ctx.fillStyle =
      point.hit === null
        ? chartColors.free
        : point.hit
          ? chartColors.hit
          : chartColors.miss;
    ctx.beginPath();
    ctx.arc(
      x(point.time),
      Math.min(bottom + 4, Math.max(top - 4, line)),
      2.7,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = chartColors.playhead;
  ctx.fillRect(Math.min(right - 1, x(seconds)), top - 7, 1, bottom - top + 14);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.fillStyle = chartColors.label;
  for (
    let i = Math.ceil(windowStart);
    i <= windowEnd;
    i += width < 410 ? 2 : 1
  ) {
    ctx.fillText(`${i}s`, x(i), height - 4);
  }
}

function scheduleFrame() {
  if (!raf && (playing || audio?.context.state === 'running'))
    raf = requestAnimationFrame(tick);
}

function plotPlayedNote(note: Span, midi: number, hit: boolean) {
  playedNotes.set(note, { midi, hit });
  const currentPart = model?.parts[Number(part.value)];
  if (osmd && currentPart && renderedWidth)
    scoreOverlay.plot(osmd, currentPart, note, midi, hit);
}

function tick(now: number) {
  raf = 0;
  const total = model ? model.secondsAt(model.end) : 0;
  if (countBeatMs) {
    if (now < playbackAnchor) {
      const count = Math.ceil((playbackAnchor - now) / countBeatMs);
      status(countDisplay, `開始まで ${count} 拍`);
    } else {
      clearCountIn();
      play.textContent = '一時停止';
    }
  }
  if (playing && !countBeatMs && !isStepMode()) {
    seconds = Math.min(
      total,
      playbackOffset +
        (Math.max(0, now - playbackAnchor) / 1000) * playbackRate,
    );
  }
  if (audio?.context.state === 'running' && now - lastSample >= 30) {
    lastSample = now;
    pitch = audio.readPitch();
    pitchReadout = updatePitchReadout(pitchReadout, pitch, now);
    if (playing && isStepMode() && model) {
      const notes = activeNotes();
      const note = notes[stepIndex];
      if (note) {
        const midi = pitch ? nearOctave(pitch.midi, note.midi) : undefined;
        const matched =
          midi !== undefined && isMatch(centsFrom(midi, note.midi));
        if (midi !== undefined) {
          lastPitchTarget = note;
          plotPlayedNote(note, midi, matched);
        }
        if (stepGate.sample(now, matched)) {
          const next = notes[++stepIndex];
          seconds = next ? model.secondsAt(next.start) : total;
          lastPitchTarget = undefined;
          const upcoming = next ?? (repeatEnabled() ? notes[0] : undefined);
          stepGate.reset(
            upcoming !== undefined &&
              isMatch(
                centsFrom(nearOctave(note.midi, upcoming.midi), upcoming.midi),
              ),
          );
        }
      }
    } else if (playing && !countBeatMs && pitch && model && seconds < total) {
      const note = targetAt(model.beatAt(seconds));
      lastPitchTarget = note;
      const midi = note ? nearOctave(pitch.midi, note.midi) : pitch.midi;
      const hit = note ? isMatch(centsFrom(midi, note.midi)) : null;
      if (note && hit !== null) plotPlayedNote(note, midi, hit);
      history.push({ time: seconds, midi, hit });
    }
  }
  const firstPitch = history[0];
  if (firstPitch && firstPitch.time < seconds - 2)
    history = history.filter((p) => p.time >= seconds - 2);
  if (playing && seconds >= total) {
    if (repeatEnabled() && model) {
      resetPracticePosition();
      playbackAnchor = now;
      playbackOffset = seconds;
      lastPitchTarget = undefined;
    } else pause();
  }
  if (now - lastDraw >= 30) {
    lastDraw = now;
    updateView();
  }
  scheduleFrame();
}

function clearCountIn() {
  countBeatMs = 0;
  countDisplay.hidden = true;
  speed.disabled = false;
}

function pause() {
  playing = false;
  stepGate.interrupt();
  lastPitchTarget = undefined;
  clearCountIn();
  const advanced = isStepMode() ? stepIndex > 0 : seconds > 0;
  play.textContent =
    model && seconds >= model.secondsAt(model.end)
      ? 'もう一度練習'
      : advanced
        ? '練習を再開'
        : '練習を開始';
  updateView();
}

function resetPracticePosition() {
  stepIndex = 0;
  const firstBeat = isStepMode() ? (activeNotes()[0]?.start ?? 0) : 0;
  seconds = model?.secondsAt(firstBeat) ?? 0;
  history = [];
  playedNotes.clear();
  scoreOverlay.clear();
  syncCursor(firstBeat, true);
}

function rewind() {
  stepGate.reset();
  resetPracticePosition();
  pause();
}

play.addEventListener('click', () => {
  if (!model) return;
  if (playing) return pause();
  if (seconds >= model.secondsAt(model.end)) rewind();
  playbackOffset = seconds;
  playbackRate = Number(speed.value);
  if (!isStepMode() && seconds === 0) {
    countBeatMs = (model.secondsPerBeatAt(0) * 1000) / playbackRate;
    status(countDisplay, '開始まで 4 拍');
    countDisplay.hidden = false;
    speed.disabled = true;
  }
  playbackAnchor = performance.now() + countBeatMs * 4;
  playing = true;
  play.textContent = countBeatMs ? 'カウントを中止' : '一時停止';
  scheduleFrame();
});
speed.addEventListener('change', () => {
  if (!playing || countBeatMs || isStepMode()) return;
  const now = performance.now();
  playbackOffset += ((now - playbackAnchor) / 1000) * playbackRate;
  playbackAnchor = now;
  playbackRate = Number(speed.value);
});
reset.addEventListener('click', rewind);
repeatPractice.addEventListener('click', () =>
  repeatPractice.setAttribute('aria-pressed', String(!repeatEnabled())),
);
part.addEventListener('change', () => {
  if (osmd && model) drawStaffTargets(osmd, model.parts, Number(part.value));
  rewind();
});
sheet.addEventListener('click', (event) => {
  if (part.disabled || !(event.target instanceof SVGElement)) return;
  const index = event.target.dataset['partIndex'];
  if (index === undefined || index === part.value) return;
  part.value = index;
  part.dispatchEvent(new Event('change'));
});
function updatePracticeMode() {
  const stepMode = isStepMode();
  el('speed-control').hidden = el('timed-display').hidden = stepMode;
  el('step-display').hidden = !stepMode;
  el('practice-heading').textContent = stepMode ? '一音ずつ練習' : '音程バー';
  rewind();
}
practiceMode.addEventListener('change', updatePracticeMode);
updatePracticeMode();
async function load(getXml: () => Promise<string>, sample = false) {
  file.disabled =
    openScore.disabled =
    demoButton.disabled =
    demoKey.disabled =
    play.disabled =
    reset.disabled =
    part.disabled =
      true;
  el('demo-key-control').hidden = !sample;
  demoButton.hidden = sample;
  el('part-control').hidden = true;
  pause();
  playedNotes.clear();
  scoreOverlay.clear();
  status(scoreStatus, '楽譜を読み込み中…');
  try {
    const xml = await getXml();
    const parsed = parseScore(xml);
    if (!osmd) {
      const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
      osmd = new OpenSheetMusicDisplay(sheet, {
        autoResize: false,
        followCursor: false,
        cursorsOptions: [
          { type: 0, color: chartColors.target, alpha: 0.35, follow: false },
        ],
      });
      osmd.EngravingRules.CursorIgnoreRepetitions = true;
    }
    osmd.setOptions({ drawPartNames: !sample, drawPartAbbreviations: !sample });
    await osmd.load(xml);
    renderedWidth = 0;
    peek = undefined;
    model = parsed;
    part.replaceChildren(
      ...model.parts.map((p, i) => new Option(p.label, String(i))),
    );
    sheet.hidden = false;
    seconds = 0;
    renderScore();
    rewind();
    status(
      scoreStatus,
      model.hasRepeats
        ? '反復記号・ジャンプは実行せず、譜面の順に進みます。'
        : '',
    );
    play.disabled = reset.disabled = false;
    part.disabled = model.parts.length < 2;
    el('part-control').hidden = part.disabled;
  } catch (error) {
    model = undefined;
    sheet.hidden = true;
    part.replaceChildren(new Option('—'));
    status(scoreStatus, `楽譜を表示できません: ${messageOf(error)}`, 'error');
    status(feedback, '楽譜を読み込んでください');
    status(position, '—');
    updateView();
  } finally {
    file.disabled =
      openScore.disabled =
      demoButton.disabled =
      demoKey.disabled =
        false;
  }
}

openScore.addEventListener('click', () => file.click());
file.addEventListener('change', () => {
  const selected = file.files?.[0];
  if (selected) void load(() => readScore(selected));
  file.value = '';
});
demoKey.replaceChildren(
  ...scaleKeys.map((key, index) => new Option(key.label, String(index))),
);
function loadSample() {
  const key = scaleKeys[demoKey.selectedIndex] ?? scaleKeys[0];
  return load(async () => makeScaleDemo(key), true);
}
demoKey.addEventListener('change', () => void loadSample());
demoButton.addEventListener('click', () => void loadSample());
inputToggle.addEventListener('click', () => {
  if (audio || requesting) stopInput();
  else void startInput();
});
inputResume.addEventListener('click', () => {
  if (audio) resumeInput(audio.context);
});
if (nativeInput) {
  configureNativeInput();
  device.addEventListener('change', configureNativeInput);
  inputPermission.addEventListener(
    'click',
    (event) => {
      if (event.isTrusted) ++inputRequest;
    },
    { capture: true },
  );
  inputPermission.addEventListener('track', () => {
    const track = inputPermission.track;
    if (track?.kind === 'audio') {
      if (!audio?.stream.getAudioTracks().includes(track))
        void startInput(new MediaStream([track]));
    } else {
      track?.stop();
      if (pageActive && !audio && !requesting)
        inputFailed(
          new Error('ブラウザから音声トラックを取得できませんでした。'),
        );
    }
  });
  inputPermission.addEventListener('error', () => {
    if (pageActive && !audio && !requesting)
      inputFailed(
        inputPermission.error ?? new Error('マイクを使用できませんでした。'),
      );
  });
  inputPermission.addEventListener('cancel', () => {
    if (pageActive && !audio && !requesting)
      status(
        inputStatus,
        '許可がキャンセルされました。マイクの許可ボタンから再試行できます。',
      );
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing) pause();
});
window.addEventListener('pagehide', () => {
  pageActive = false;
  restartOnReturn = Boolean(audio || requesting);
  stopInput();
});
window.addEventListener('pageshow', (event) => {
  pageActive = true;
  if (event.persisted && restartOnReturn) void startInputOnOpen();
});
navigator.mediaDevices?.addEventListener(
  'devicechange',
  () => void refreshDevices(),
);
new ResizeObserver(renderScore).observe(sheet);
new ResizeObserver(drawChart).observe(canvas);
void refreshDevices();
updateInputControls();
void startInputOnOpen();
void loadSample();
