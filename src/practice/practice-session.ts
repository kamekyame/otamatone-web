import type { LitElement } from 'lit';
import type { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import miniOtamaUrl from '../assets/mini-otama.svg?no-inline';
import { makeScaleDemo, makeTwinkleStarDemo, scaleKeys } from './demo';
import {
  centsFrom,
  initialPitchRangeStart,
  isMatch,
  makePitchReader,
  noteName,
  pitchForTarget,
  pitchRangeStart,
  pitchWindowSize,
  updatePitchReadout,
  type Pitch,
} from '../pitch';
import {
  adjacentNoteIndex,
  lastAt,
  parseScore,
  readScore,
  type Score,
  type Span,
} from '../score/score';
import { makeScoreOverlay } from '../score/score-overlay';
import { drawStaffTargets } from '../score/staff-targets';
import { makeStepGate } from './step-practice';

export type MicrophoneElement = HTMLElement & {
  setConstraints?: (constraints: MediaTrackConstraints) => void;
  readonly track?: MediaStreamTrack | null;
  readonly error?: DOMException | null;
};

type Status = { message: string; level: '' | 'error' | 'good' };
type GuidePoint = {
  time: number;
  midi: number;
  hit: boolean | null;
  at: number;
  breakBefore: boolean;
};
const text = (message: string): Status => ({ message, level: '' });

export function createPracticeSession(host: LitElement) {
  const view = {
    devices: [] as { label: string; value: string }[],
    device: '',
    showNative: false,
    inputBusy: false,
    inputLabel: '入力を開始',
    canResume: false,
    listening: false,
    inputStatus: text('入力オフ'),
    displayPitch: undefined as Pitch | undefined,
    tunerStart: initialPitchRangeStart,
    targetMidi: undefined as number | undefined,
    loading: true,
    sampleId: 'scale-0',
    demoKey: 0,
    parts: [] as string[],
    part: 0,
    scoreVisible: false,
    scoreStatus: text(''),
    scoreTitle: '',
    scoreSubtitle: '',
    scoreComposer: '',
    scoreLyricist: '',
    scoreRights: '',
    stepMode: false,
    allowOctave: true,
    speed: '1',
    repeat: false,
    playLabel: '練習を開始',
    playing: false,
    countIn: '',
    countInBeat: 0,
    position: '—',
    feedback: text('楽譜を読み込んでください'),
  };
  let sheet: HTMLElement;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let inputPermission: MicrophoneElement;
  let nativeInput = false;
  let connection: AbortController | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let initialized = false;
  const stepGate = makeStepGate();
  const scoreOverlay = makeScoreOverlay(miniOtamaUrl);
  const playedNotes = new Map<Span, { midi: number; hit: boolean }>();
  let stepIndex = 0;
  function readChartColors() {
    const theme = getComputedStyle(host);
    return {
      label: theme.getPropertyValue('--muted').trim(),
      grid: theme.getPropertyValue('--chart-grid').trim(),
      target: theme.getPropertyValue('--accent').trim(),
      hit: theme.getPropertyValue('--hit').trim(),
      miss: theme.getPropertyValue('--miss').trim(),
      free: theme.getPropertyValue('--free').trim(),
      playhead: theme.color,
    };
  }
  let chartColors: ReturnType<typeof readChartColors>;

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
  let history: GuidePoint[] = [];
  let historyBreak = true;
  let stepAttempt: GuidePoint[] = [];
  let stepGuideTime: number | undefined;
  let stepMarker: GuidePoint | undefined;
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
  let pageActive = false;
  let restartOnReturn = false;

  function clearStepGuide() {
    stepAttempt = [];
    stepGuideTime = undefined;
    stepMarker = undefined;
  }

  function status(
    target: Status,
    message: string,
    level: Status['level'] = '',
  ) {
    if (target.message === message && target.level === level) return;
    target.message = message;
    target.level = level;
    host.requestUpdate();
  }

  function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const activeConnection = connection;
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) =>
          d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default',
      );
      if (connection !== activeConnection) return;
      view.devices = inputs.map((d, i) => ({
        label: d.label || `入力 ${i + 1}`,
        value: d.deviceId,
      }));
      if (view.device && !inputs.some((d) => d.deviceId === view.device))
        selectDevice('');
      host.requestUpdate();
    } catch (error) {
      console.warn('入力機器の一覧を取得できません:', error);
    }
  }

  function updateInputControls() {
    view.inputBusy = Boolean(audio || requesting);
    view.showNative = nativeInput && !view.inputBusy;
    view.inputLabel = audio
      ? '入力を停止'
      : requesting
        ? 'キャンセル'
        : '入力を開始';
    view.listening = audio?.context.state === 'running';
    view.canResume = Boolean(audio) && !view.listening;
    host.requestUpdate();
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
        ...(view.device ? { deviceId: { ideal: view.device } } : {}),
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
    clearStepGuide();
    historyBreak = true;
    updateInputControls();
    status(view.inputStatus, message, error ? 'error' : '');
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
      view.inputStatus,
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
      clearStepGuide();
      historyBreak = true;
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
            view.inputStatus,
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
        view.inputStatus,
        'このブラウザで音声入力を使うには、対応ブラウザで HTTPS または localhost を開いてください。',
        'error',
      );
      return;
    }
    const request = ++inputRequest;
    requesting = true;
    updateInputControls();
    status(
      view.inputStatus,
      nativeStream ? '音声入力を接続中…' : '音声入力の許可を待っています…',
    );
    let context: AudioContext | undefined;
    let stream = nativeStream;
    try {
      stream ??= await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          ...inputConstraints(),
          ...(view.device ? { deviceId: { exact: view.device } } : {}),
        },
      });
      if (request !== inputRequest) return;
      if (
        !stream.getAudioTracks().some((track) => track.readyState === 'live')
      ) {
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
      status(
        view.inputStatus,
        'マイクの許可ボタンを押して入力を開始してください。',
      );
    } else {
      inputFailed(
        new DOMException('Microphone access denied', 'NotAllowedError'),
      );
    }
  }

  function activeNotes() {
    return model?.parts[view.part]?.notes ?? [];
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
    drawStaffTargets(osmd, model.parts, view.part);
    syncCursor(
      (view.stepMode ? activeNotes()[stepIndex]?.start : undefined) ??
        model.beatAt(seconds),
      true,
    );
    const currentPart = model.parts[view.part];
    if (!currentPart) return;
    for (const [note, { midi, hit }] of playedNotes)
      scoreOverlay.plot(osmd, currentPart, note, midi, hit);
  }

  function updateView() {
    const displayPitch = pitchReadout?.pitch;
    view.displayPitch = displayPitch;
    const stepMode = view.stepMode;
    const notes = stepMode && model ? activeNotes() : undefined;
    const stepTarget = notes?.[stepIndex];
    if (model) {
      const beat = stepTarget?.start ?? model.beatAt(seconds);
      syncCursor(beat);
      const measure =
        model.measures[lastAt(model.measures, beat + 1e-7, (x) => x.at)];
      const measureLabel = measure ? `小節 ${measure.number}　·　` : '';
      const target = stepMode ? stepTarget : targetAt(beat);
      view.targetMidi = target?.midi;
      view.tunerStart = pitchRangeStart(
        view.tunerStart,
        displayPitch?.midi,
        target?.midi,
      );
      const total = model.secondsAt(model.end);
      const done = seconds >= total;
      view.position = notes
        ? `${stepIndex} / ${notes.length} 音クリア${done || !measure ? '' : `　·　小節 ${measure.number}`}`
        : `${measureLabel}${seconds.toFixed(1)} / ${total.toFixed(1)} 秒`;
      const judgedPitch = lastPitchTarget === target ? displayPitch : undefined;
      if (done) status(view.feedback, '練習終了', 'good');
      else if (!target) status(view.feedback, '休符・演奏なし');
      else if (!playing || countBeatMs || !audio)
        status(
          view.feedback,
          `目標 ${noteName(target.midi)}${stepMode && playing && !audio ? ' · 音声入力を開始してください' : ''}`,
        );
      else if (!judgedPitch)
        status(
          view.feedback,
          `目標 ${noteName(target.midi)}${displayPitch ? ' · 判定中' : ''}`,
        );
      else {
        const cents = centsFrom(
          pitchForTarget(judgedPitch.midi, target.midi, view.allowOctave),
          target.midi,
        );
        const hit = isMatch(cents);
        const octaveDelta = Math.round((judgedPitch.midi - target.midi) / 12);
        const octaveMismatch =
          octaveDelta !== 0 &&
          isMatch(centsFrom(judgedPitch.midi, target.midi + octaveDelta * 12));
        const inputLabel = `入力 ${noteName(judgedPitch.midi)}${
          octaveMismatch
            ? ` · ${Math.abs(octaveDelta)}オクターブ${octaveDelta > 0 ? '高い' : '低い'}`
            : ''
        }`;
        status(
          view.feedback,
          hit
            ? `目標 ${noteName(target.midi)} · ${octaveMismatch ? `${inputLabel} · 合っています（許容中）` : '合っています'}`
            : `目標 ${noteName(target.midi)} · ${inputLabel}`,
          hit ? 'good' : 'error',
        );
      }
    } else {
      view.targetMidi = undefined;
      view.tunerStart = pitchRangeStart(view.tunerStart, displayPitch?.midi);
      status(view.feedback, '楽譜を読み込んでください');
      view.position = '—';
    }
    host.requestUpdate();
    drawChart();
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
        '楽譜を読み込むと、おたまガイドを表示します',
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
    const guideTime = view.stepMode ? (stepGuideTime ?? seconds) : seconds;
    const windowStart = Math.max(0, guideTime - 2);
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
    const points = [...history, ...stepAttempt];
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
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const pointColor = (point: GuidePoint) =>
      point.hit === null
        ? chartColors.free
        : point.hit
          ? chartColors.hit
          : chartColors.miss;
    const overflow = (point: GuidePoint) =>
      point.midi > high ? -1 : point.midi < low ? 1 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    let previous: GuidePoint | undefined;
    for (const point of points) {
      ctx.strokeStyle = ctx.fillStyle = pointColor(point);
      ctx.beginPath();
      if (previous && !point.breakBefore && point.at - previous.at <= 100) {
        ctx.moveTo(x(previous.time), y(previous.midi));
        ctx.lineTo(x(point.time), y(point.midi));
        ctx.stroke();
      } else {
        ctx.arc(x(point.time), y(point.midi), 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      previous = point;
    }
    if (stepMarker && !overflow(stepMarker)) {
      ctx.fillStyle = pointColor(stepMarker);
      ctx.beginPath();
      ctx.arc(x(stepMarker.time), y(stepMarker.midi), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = chartColors.playhead;
    ctx.fillRect(
      Math.min(right - 1, x(guideTime)),
      top - 7,
      1,
      bottom - top + 14,
    );
    const markOverflow = (point: GuidePoint) => {
      const direction = overflow(point);
      if (!direction || point.time < windowStart || point.time > windowEnd)
        return;
      const markX = Math.max(left + 4, Math.min(right - 4, x(point.time)));
      const tip = direction < 0 ? top + 1 : bottom - 1;
      ctx.fillStyle = pointColor(point);
      ctx.beginPath();
      ctx.moveTo(markX, tip);
      ctx.lineTo(markX - 4, tip - direction * 7);
      ctx.lineTo(markX + 4, tip - direction * 7);
      ctx.closePath();
      ctx.fill();
    };
    let pending: GuidePoint | undefined;
    for (const point of points) {
      const direction = overflow(point);
      if (
        pending &&
        (direction !== overflow(pending) ||
          point.breakBefore ||
          point.at - pending.at > 100)
      ) {
        markOverflow(pending);
        pending = undefined;
      }
      if (direction && point.time >= windowStart && point.time <= windowEnd)
        pending = point;
    }
    if (pending) markOverflow(pending);
    if (stepMarker) markOverflow(stepMarker);
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
    if (connection && !raf && (playing || audio?.context.state === 'running'))
      raf = requestAnimationFrame(tick);
  }

  function plotPlayedNote(note: Span, midi: number, hit: boolean) {
    playedNotes.set(note, { midi, hit });
    const currentPart = model?.parts[view.part];
    if (osmd && currentPart && renderedWidth)
      scoreOverlay.plot(osmd, currentPart, note, midi, hit);
  }

  function tick(now: number) {
    raf = 0;
    const total = model ? model.secondsAt(model.end) : 0;
    if (countBeatMs) {
      if (now < playbackAnchor) {
        const count = Math.ceil((playbackAnchor - now) / countBeatMs);
        view.countIn = `開始まで ${count} 拍`;
        view.countInBeat = count;
      } else {
        clearCountIn();
        view.playLabel = '一時停止';
        host.requestUpdate();
      }
    }
    if (playing && !countBeatMs && !view.stepMode) {
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
      const stablePitch = pitch ? pitchReadout?.pitch : undefined;
      if (!stablePitch) historyBreak = true;
      if (playing && view.stepMode && model) {
        const notes = activeNotes();
        const note = notes[stepIndex];
        if (note) {
          const midi = stablePitch
            ? pitchForTarget(stablePitch.midi, note.midi, view.allowOctave)
            : undefined;
          const matched =
            midi !== undefined && isMatch(centsFrom(midi, note.midi));
          if (midi !== undefined) {
            lastPitchTarget = note;
            plotPlayedNote(note, midi, matched);
          }
          const advanced = stepGate.sample(now, matched);
          if (stepGate.holding && midi !== undefined) {
            const nextStart = notes[stepIndex + 1]?.start;
            const end =
              nextStart !== undefined && nextStart > note.start
                ? Math.min(note.end, nextStart)
                : note.end;
            const startTime = model.secondsAt(note.start);
            const time =
              startTime +
              (model.secondsAt(end) - startTime) * stepGate.progress;
            const last = stepAttempt.at(-1);
            if (
              last &&
              (now - last.at > 100 ||
                (stepGuideTime !== undefined && time < stepGuideTime))
            )
              stepAttempt = [];
            stepGuideTime = time;
            stepMarker = undefined;
            stepAttempt.push({
              time,
              midi,
              hit: true,
              at: now,
              breakBefore: stepAttempt.length === 0,
            });
          } else {
            clearStepGuide();
            if (midi !== undefined)
              stepMarker = {
                time: model.secondsAt(note.start),
                midi,
                hit: matched,
                at: now,
                breakBefore: true,
              };
          }
          if (advanced) {
            history.push(...stepAttempt);
            clearStepGuide();
            const next = notes[++stepIndex];
            seconds = next ? model.secondsAt(next.start) : total;
            lastPitchTarget = undefined;
            const upcoming = next ?? (view.repeat ? notes[0] : undefined);
            stepGate.reset(
              upcoming !== undefined &&
                isMatch(
                  centsFrom(
                    pitchForTarget(note.midi, upcoming.midi, view.allowOctave),
                    upcoming.midi,
                  ),
                ),
            );
          }
        }
      } else if (
        playing &&
        !countBeatMs &&
        stablePitch &&
        model &&
        seconds < total
      ) {
        const note = targetAt(model.beatAt(seconds));
        lastPitchTarget = note;
        const midi = note
          ? pitchForTarget(stablePitch.midi, note.midi, view.allowOctave)
          : stablePitch.midi;
        const hit = note ? isMatch(centsFrom(midi, note.midi)) : null;
        if (note && hit !== null) plotPlayedNote(note, midi, hit);
        history.push({
          time: seconds,
          midi,
          hit,
          at: now,
          breakBefore: historyBreak,
        });
        historyBreak = false;
      }
    }
    const firstPitch = history[0];
    if (firstPitch && firstPitch.time < seconds - 2)
      history = history.filter((p) => p.time >= seconds - 2);
    if (playing && seconds >= total) {
      if (view.repeat && model) {
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
    view.countIn = '';
    view.countInBeat = 0;
  }

  function pause() {
    playing = false;
    view.playing = false;
    stepGate.interrupt();
    clearStepGuide();
    historyBreak = true;
    lastPitchTarget = undefined;
    clearCountIn();
    const advanced = view.stepMode ? stepIndex > 0 : seconds > 0;
    view.playLabel =
      model && seconds >= model.secondsAt(model.end)
        ? 'もう一度練習'
        : advanced
          ? '練習を再開'
          : '練習を開始';
    updateView();
  }

  function resetPracticePosition() {
    stepIndex = 0;
    const firstBeat = view.stepMode ? (activeNotes()[0]?.start ?? 0) : 0;
    seconds = model?.secondsAt(firstBeat) ?? 0;
    history = [];
    historyBreak = true;
    clearStepGuide();
    playedNotes.clear();
    scoreOverlay.clear();
    syncCursor(firstBeat, true);
  }

  function rewind() {
    stepGate.reset();
    resetPracticePosition();
    pause();
  }

  function moveNote(direction: -1 | 1) {
    if (!model || view.loading) return;
    const notes = activeNotes();
    if (!notes.length) return;
    const beat = model.beatAt(seconds);
    const index = view.stepMode
      ? stepIndex + direction
      : adjacentNoteIndex(notes, beat, direction);
    if (index === undefined) return;
    stepIndex = Math.max(0, Math.min(notes.length - 1, index));
    const note = notes[stepIndex];
    if (!note) throw new RangeError('Invalid practice note');
    seconds = model.secondsAt(note.start);
    history = [];
    historyBreak = true;
    clearStepGuide();
    stepGate.reset();
    syncCursor(note.start, true);
    pause();
  }

  function togglePlay() {
    if (!model || view.loading) return;
    if (playing) return pause();
    if (seconds >= model.secondsAt(model.end)) rewind();
    playbackOffset = seconds;
    playbackRate = Number(view.speed);
    if (!view.stepMode && seconds === 0) {
      countBeatMs = (model.secondsPerBeatAt(0) * 1000) / playbackRate;
      view.countIn = '開始まで 4 拍';
      view.countInBeat = 4;
    }
    playbackAnchor = performance.now() + countBeatMs * 4;
    playing = true;
    view.playing = true;
    view.playLabel = countBeatMs ? 'カウントを中止' : '一時停止';
    host.requestUpdate();
    scheduleFrame();
  }
  function selectSpeed(value: string) {
    view.speed = value;
    host.requestUpdate();
    if (!playing || countBeatMs || view.stepMode) return;
    const now = performance.now();
    playbackOffset += ((now - playbackAnchor) / 1000) * playbackRate;
    playbackAnchor = now;
    playbackRate = Number(view.speed);
  }
  function setOctaveAllowance(allowOctave: boolean) {
    view.allowOctave = allowOctave;
    stepGate.interrupt();
    clearStepGuide();
    historyBreak = true;
    updateView();
  }
  function toggleRepeat() {
    view.repeat = !view.repeat;
    host.requestUpdate();
  }
  function selectPart(index: number) {
    if (view.loading || !model?.parts[index] || index === view.part) return;
    view.part = index;
    if (osmd) drawStaffTargets(osmd, model.parts, index);
    rewind();
  }
  function selectStaff(event: Event) {
    if (view.parts.length < 2 || !(event.target instanceof SVGElement)) return;
    const index = event.target.dataset['partIndex'];
    if (index !== undefined) selectPart(Number(index));
  }
  function selectMode(value: string) {
    view.stepMode = value === 'step';
    rewind();
  }
  async function load(getXml: () => Promise<string>, sample = false) {
    if (view.loading) return;
    view.loading = true;
    if (!sample) view.sampleId = '';
    pause();
    playedNotes.clear();
    scoreOverlay.clear();
    status(view.scoreStatus, '楽譜を読み込み中…');
    try {
      const xml = await getXml();
      const parsed = parseScore(xml);
      if (!osmd) {
        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        osmd = new OpenSheetMusicDisplay(sheet, {
          autoResize: false,
          followCursor: false,
          drawingParameters: 'compacttight',
          drawCredits: false,
          drawTitle: false,
          drawSubtitle: false,
          drawComposer: false,
          drawLyricist: false,
          drawPartNames: false,
          drawPartAbbreviations: false,
          cursorsOptions: [
            { type: 0, color: chartColors.target, alpha: 0.35, follow: false },
          ],
        });
        osmd.EngravingRules.CursorIgnoreRepetitions = true;
      }
      osmd.setOptions({
        drawingParameters: 'compacttight',
        drawCredits: false,
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawLyricist: false,
        drawPartNames: false,
        drawPartAbbreviations: false,
      });
      await osmd.load(xml);
      renderedWidth = 0;
      peek = undefined;
      model = parsed;
      view.scoreTitle = model.title;
      view.scoreSubtitle = model.subtitle;
      view.scoreComposer = model.composer;
      view.scoreLyricist = model.lyricist;
      view.scoreRights = model.rights;
      view.parts = model.parts.map((p) => p.label);
      view.part = 0;
      view.scoreVisible = true;
      seconds = 0;
      host.requestUpdate();
      await host.updateComplete;
      renderScore();
      rewind();
      status(
        view.scoreStatus,
        model.hasRepeats
          ? '反復記号・ジャンプは実行せず、譜面の順に進みます。'
          : '',
      );
    } catch (error) {
      model = undefined;
      view.scoreVisible = false;
      view.scoreTitle = '';
      view.scoreSubtitle = '';
      view.scoreComposer = '';
      view.scoreLyricist = '';
      view.scoreRights = '';
      view.parts = [];
      view.part = 0;
      status(
        view.scoreStatus,
        `楽譜を表示できません: ${messageOf(error)}`,
        'error',
      );
      updateView();
    } finally {
      view.loading = false;
      host.requestUpdate();
    }
  }

  function openFile(file: HTMLInputElement) {
    const selected = file.files?.[0];
    if (selected) void load(() => readScore(selected));
    file.value = '';
  }
  function loadSample(sample: string | number = `scale-${view.demoKey}`) {
    if (view.loading) return;
    if (sample === 'twinkle') {
      view.sampleId = 'twinkle';
      return load(async () => makeTwinkleStarDemo(), true);
    }
    const index =
      typeof sample === 'number'
        ? sample
        : Number(sample.startsWith('scale-') ? sample.slice(6) : NaN);
    const key = scaleKeys[index];
    if (!Number.isInteger(index) || !key)
      throw new RangeError('Unknown sample score');
    view.demoKey = index;
    view.sampleId = `scale-${index}`;
    return load(async () => makeScaleDemo(key), true);
  }
  function selectDevice(value: string) {
    view.device = value;
    configureNativeInput();
    host.requestUpdate();
  }
  function toggleInput() {
    if (audio || requesting) stopInput();
    else void startInput();
  }
  function resume() {
    if (audio) resumeInput(audio.context);
  }
  function connect(elements: {
    sheet: HTMLElement;
    canvas: HTMLCanvasElement;
    microphone: MicrophoneElement;
  }) {
    if (connection) return;
    sheet = elements.sheet;
    canvas = elements.canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    ctx = context;
    chartColors = readChartColors();
    inputPermission = elements.microphone;
    nativeInput =
      window.isSecureContext &&
      typeof inputPermission.setConstraints === 'function' &&
      'track' in inputPermission &&
      Boolean(window.AudioContext);
    connection = new AbortController();
    const { signal } = connection;
    pageActive = true;
    if (nativeInput) {
      configureNativeInput();
      inputPermission.addEventListener(
        'click',
        (event) => {
          if (event.isTrusted) ++inputRequest;
        },
        { capture: true, signal },
      );
      inputPermission.addEventListener(
        'track',
        () => {
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
        },
        { signal },
      );
      inputPermission.addEventListener(
        'error',
        () => {
          if (pageActive && !audio && !requesting)
            inputFailed(
              inputPermission.error ??
                new Error('マイクを使用できませんでした。'),
            );
        },
        { signal },
      );
      inputPermission.addEventListener(
        'cancel',
        () => {
          if (pageActive && !audio && !requesting)
            status(
              view.inputStatus,
              '許可がキャンセルされました。マイクの許可ボタンから再試行できます。',
            );
        },
        { signal },
      );
    }
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden && playing) pause();
      },
      { signal },
    );
    window.addEventListener(
      'pagehide',
      () => {
        pageActive = false;
        restartOnReturn = Boolean(audio || requesting);
        stopInput();
      },
      { signal },
    );
    window.addEventListener(
      'pageshow',
      (event) => {
        pageActive = true;
        if (event.persisted && restartOnReturn) void startInputOnOpen();
      },
      { signal },
    );
    navigator.mediaDevices?.addEventListener(
      'devicechange',
      () => void refreshDevices(),
      { signal },
    );
    resizeObserver = new ResizeObserver((entries) => {
      for (const { target } of entries) {
        if (target === sheet) renderScore();
        else drawChart();
      }
    });
    resizeObserver.observe(sheet);
    resizeObserver.observe(canvas);
    void refreshDevices();
    updateInputControls();
    void startInputOnOpen();
    if (!initialized) {
      initialized = true;
      view.loading = false;
      void loadSample();
    }
  }

  function disconnect() {
    if (!connection) return;
    connection.abort();
    connection = undefined;
    resizeObserver?.disconnect();
    resizeObserver = undefined;
    pageActive = false;
    restartOnReturn = false;
    cancelAnimationFrame(raf);
    raf = 0;
    pause();
    stopInput();
  }

  return {
    view,
    connect,
    disconnect,
    openFile,
    loadSample,
    toggleInput,
    resume,
    selectDevice,
    togglePlay,
    rewind,
    previousNote: () => moveNote(-1),
    nextNote: () => moveNote(1),
    selectSpeed,
    setOctaveAllowance,
    toggleRepeat,
    selectPart,
    selectStaff,
    selectMode,
  };
}
