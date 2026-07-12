(function () {
    'use strict';

    const tasks = [
        {
            id: '01a',
            fileBase: 'ftb-01a-introduction-natural',
            number: 'Snippet 1 · Take A',
            title: 'Introduction',
            direction: 'Natural and conversational. Warm, welcoming, and lightly smiling.',
            text: 'Hi, I’m Slaton Case—a physician and the author of For The Boards.'
        },
        {
            id: '01b',
            fileBase: 'ftb-01b-introduction-warm',
            number: 'Snippet 1 · Take B',
            title: 'Introduction',
            direction: 'A little slower, warmer, and more personal. Keep the credentials understated.',
            text: 'Hi, I’m Slaton Case—a physician and the author of For The Boards.'
        },
        {
            id: '02a',
            fileBase: 'ftb-02a-origin-natural',
            number: 'Snippet 2 · Take A',
            title: 'Why I wrote it',
            direction: 'Natural and conversational. Let the contrast between diagnosis and presentation land clearly.',
            text: 'I started writing this in residency because most study materials teach from a diagnosis. Patients—and board questions—start with a presentation.'
        },
        {
            id: '02b',
            fileBase: 'ftb-02b-origin-reflective',
            number: 'Snippet 2 · Take B',
            title: 'Why I wrote it',
            direction: 'Reflective in the first sentence, then more conviction on the second.',
            text: 'I started writing this in residency because most study materials teach from a diagnosis. Patients—and board questions—start with a presentation.'
        },
        {
            id: '03a',
            fileBase: 'ftb-03a-method-natural',
            number: 'Snippet 3 · Take A',
            title: 'How the book works',
            direction: 'Clear and conversational. Keep each item in the list distinct.',
            text: 'For The Boards starts with the symptoms and clues, then links them to the diagnosis: how to confirm it, treat it, monitor it, and separate look-alikes.'
        },
        {
            id: '03b',
            fileBase: 'ftb-03b-method-measured',
            number: 'Snippet 3 · Take B',
            title: 'How the book works',
            direction: 'Slightly slower and more measured. Avoid rushing the list.',
            text: 'For The Boards starts with the symptoms and clues, then links them to the diagnosis: how to confirm it, treat it, monitor it, and separate look-alikes.'
        },
        {
            id: '04a',
            fileBase: 'ftb-04a-knowledge-natural',
            number: 'Snippet 4 · Take A',
            title: 'Respecting their knowledge',
            direction: 'Reassuring and conversational. Gently emphasize “knowledge you already have.”',
            text: 'It’s built for the knowledge you already have—not to reteach medicine from scratch.'
        },
        {
            id: '04b',
            fileBase: 'ftb-04b-knowledge-confident',
            number: 'Snippet 4 · Take B',
            title: 'Respecting their knowledge',
            direction: 'More confident and concise, without sounding defensive.',
            text: 'It’s built for the knowledge you already have—not to reteach medicine from scratch.'
        },
        {
            id: '05a',
            fileBase: 'ftb-05a-personal-reference-natural',
            number: 'Snippet 5 · Take A',
            title: 'Making it personal',
            direction: 'Natural and encouraging. Keep this helpful rather than promotional.',
            text: 'Use it with your question bank. Add notes from wards and questions. Over time it becomes your personalized ABIM reference—something you trust and can hold in your hands.'
        },
        {
            id: '05b',
            fileBase: 'ftb-05b-personal-reference-warm',
            number: 'Snippet 5 · Take B',
            title: 'Making it personal',
            direction: 'Warmer and more personal. Slow down on “something you trust and can hold in your hands.”',
            text: 'Use it with your question bank. Add notes from wards and questions. Over time it becomes your personalized ABIM reference—something you trust and can hold in your hands.'
        },
        {
            id: '06a',
            fileBase: 'ftb-06a-individual-price',
            number: 'Snippet 6 · Price A',
            title: 'Individual price',
            direction: 'Straightforward and matter-of-fact. Do not turn it into a sales announcement.',
            text: 'Individual copies are sixty dollars.'
        },
        {
            id: '06b',
            fileBase: 'ftb-06b-program-price',
            number: 'Snippet 6 · Price B',
            title: 'Program price',
            direction: 'Confident and clear, with light emphasis on “per resident.”',
            text: 'Bulk program pricing is fifty dollars per resident.'
        },
        {
            id: '07a',
            fileBase: 'ftb-07a-closing-calm',
            number: 'Snippet 7 · Take A',
            title: 'Closing thought',
            direction: 'Calm and deliberate. Give each sentence its own beat.',
            text: 'Connect the symptoms. Make the diagnosis. Make the book your own.'
        },
        {
            id: '07b',
            fileBase: 'ftb-07b-closing-energetic',
            number: 'Snippet 7 · Take B',
            title: 'Closing thought',
            direction: 'More energetic and aspirational, while remaining credible.',
            text: 'Connect the symptoms. Make the diagnosis. Make the book your own.'
        },
        {
            id: '07c',
            fileBase: 'ftb-07c-closing-confident',
            number: 'Snippet 7 · Take C',
            title: 'Closing thought',
            direction: 'Quietly confident. Leave a full pause between every sentence.',
            text: 'Connect the symptoms. Make the diagnosis. Make the book your own.'
        },
        {
            id: '08a',
            fileBase: 'ftb-08a-brand-warm',
            number: 'Snippet 8 · Take A',
            title: 'Product name',
            direction: 'Warm and natural.',
            text: 'For The Boards.'
        },
        {
            id: '08b',
            fileBase: 'ftb-08b-brand-authoritative',
            number: 'Snippet 8 · Take B',
            title: 'Product name',
            direction: 'Authoritative and clean, without sounding dramatic.',
            text: 'For The Boards.'
        },
        {
            id: '08c',
            fileBase: 'ftb-08c-brand-reflective',
            number: 'Snippet 8 · Take C',
            title: 'Product name',
            direction: 'Soft and reflective. Let the final word settle.',
            text: 'For The Boards.'
        },
        {
            id: '09-room',
            fileBase: 'ftb-09-room-tone',
            number: 'Final recording',
            title: 'Room tone',
            direction: 'Press record and remain completely silent for ten seconds. Do not move or touch the microphone.',
            text: 'Do not read anything. Record ten seconds of silence in the same position and room.',
            kind: 'room-tone',
            targetSeconds: 10
        }
    ];

    const elements = {
        welcomePanel: document.getElementById('welcomePanel'),
        recorderApp: document.getElementById('recorderApp'),
        enableMicButton: document.getElementById('enableMicButton'),
        permissionError: document.getElementById('permissionError'),
        progressLabel: document.getElementById('progressLabel'),
        savedProgress: document.getElementById('savedProgress'),
        progressFill: document.getElementById('progressFill'),
        takeNumber: document.getElementById('takeNumber'),
        takeTitle: document.getElementById('takeTitle'),
        takeDirection: document.getElementById('takeDirection'),
        scriptText: document.getElementById('scriptText'),
        wordCount: document.getElementById('wordCount'),
        targetDuration: document.getElementById('targetDuration'),
        previousButton: document.getElementById('previousButton'),
        nextButton: document.getElementById('nextButton'),
        statusChip: document.getElementById('statusChip'),
        recordingTimer: document.getElementById('recordingTimer'),
        waveform: document.getElementById('waveform'),
        levelFill: document.getElementById('levelFill'),
        levelLabel: document.getElementById('levelLabel'),
        recordButton: document.getElementById('recordButton'),
        stopButton: document.getElementById('stopButton'),
        consoleTip: document.getElementById('consoleTip'),
        reviewPanel: document.getElementById('reviewPanel'),
        qualityHeading: document.getElementById('qualityHeading'),
        qualityBadge: document.getElementById('qualityBadge'),
        recordingPlayback: document.getElementById('recordingPlayback'),
        durationMetric: document.getElementById('durationMetric'),
        peakMetric: document.getElementById('peakMetric'),
        averageMetric: document.getElementById('averageMetric'),
        noiseMetric: document.getElementById('noiseMetric'),
        qualityNotes: document.getElementById('qualityNotes'),
        wordsConfirmed: document.getElementById('wordsConfirmed'),
        confirmationText: document.getElementById('confirmationText'),
        retakeButton: document.getElementById('retakeButton'),
        saveNextButton: document.getElementById('saveNextButton'),
        takeList: document.getElementById('takeList'),
        savedCount: document.getElementById('savedCount'),
        downloadAllButton: document.getElementById('downloadAllButton'),
        clearSessionButton: document.getElementById('clearSessionButton'),
        completionModal: document.getElementById('completionModal'),
        completionDownloadButton: document.getElementById('completionDownloadButton'),
        closeCompletionButton: document.getElementById('closeCompletionButton'),
        toast: document.getElementById('toast')
    };

    const DB_NAME = 'for-the-boards-recorder';
    const STORE_NAME = 'takes';
    const SILENCE_THRESHOLD = 0.012;

    let database = null;
    let savedTakes = new Map();
    let currentIndex = 0;
    let stream = null;
    let audioContext = null;
    let sourceNode = null;
    let analyser = null;
    let mediaRecorder = null;
    let chunks = [];
    let isRecording = false;
    let recordingStartedAt = 0;
    let analysisFrames = [];
    let lastAnalysisSample = 0;
    let currentBlob = null;
    let currentMetrics = null;
    let currentMimeType = '';
    let playbackUrl = null;
    let drawFrame = null;
    let toastTimer = null;

    function wordCount(text) {
        return text.trim().split(/\s+/).filter(Boolean).length;
    }

    function expectedSeconds(task) {
        if (task.targetSeconds) return task.targetSeconds;
        return Math.max(1.4, (wordCount(task.text) / 145) * 60);
    }

    function formatSeconds(seconds, tenths) {
        const safe = Math.max(0, seconds || 0);
        const minutes = Math.floor(safe / 60);
        const remainder = tenths ? (safe % 60).toFixed(1).padStart(4, '0') : Math.round(safe % 60).toString().padStart(2, '0');
        return `${minutes}:${remainder}`;
    }

    function toDb(value) {
        if (!value || value <= 0) return -80;
        return Math.max(-80, 20 * Math.log10(value));
    }

    function round(value, places) {
        const scale = 10 ** (places || 0);
        return Math.round(value * scale) / scale;
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    function databaseRequest(mode, action) {
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode);
            const store = transaction.objectStore(STORE_NAME);
            const request = action(store);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function loadSavedTakes() {
        const records = await databaseRequest('readonly', (store) => store.getAll());
        savedTakes = new Map(records.map((record) => [record.id, record]));
    }

    async function putTake(record) {
        await databaseRequest('readwrite', (store) => store.put(record));
    }

    async function clearStoredTakes() {
        await databaseRequest('readwrite', (store) => store.clear());
        savedTakes.clear();
    }

    function selectMimeType() {
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/mp4',
            'audio/webm',
            'audio/ogg;codecs=opus'
        ];
        return candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
    }

    function extensionForMime(type) {
        if (type.includes('mp4')) return 'm4a';
        if (type.includes('ogg')) return 'ogg';
        return 'webm';
    }

    async function enableMicrophone() {
        elements.enableMicButton.disabled = true;
        elements.enableMicButton.textContent = 'Requesting microphone access…';
        elements.permissionError.hidden = true;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
            showPermissionError('This browser does not support local microphone recording. Open the launcher in a current version of Chrome, Safari, or Edge.');
            return;
        }

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass();
            await audioContext.resume();
            sourceNode = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.72;
            sourceNode.connect(analyser);

            elements.welcomePanel.hidden = true;
            elements.recorderApp.hidden = false;
            currentIndex = firstUnsavedIndex();
            renderCurrentTask();
            drawWaveform();
        } catch (error) {
            const secureHint = window.isSecureContext ? '' : ' Microphone access requires the provided local launcher rather than opening recorder.html directly.';
            showPermissionError(`Microphone access was not available. Check the browser’s microphone permission and try again.${secureHint}`);
        }
    }

    function showPermissionError(message) {
        elements.enableMicButton.disabled = false;
        elements.enableMicButton.innerHTML = '<span class="button-record-dot"></span> Try microphone again';
        elements.permissionError.textContent = message;
        elements.permissionError.hidden = false;
    }

    function firstUnsavedIndex() {
        const index = tasks.findIndex((task) => !savedTakes.has(task.id));
        return index === -1 ? 0 : index;
    }

    function drawWaveform() {
        const canvas = elements.waveform;
        const context = canvas.getContext('2d');
        const data = new Float32Array(analyser.fftSize);

        function draw(now) {
            analyser.getFloatTimeDomainData(data);

            let sumSquares = 0;
            let peak = 0;
            for (let index = 0; index < data.length; index += 1) {
                const sample = data[index];
                sumSquares += sample * sample;
                peak = Math.max(peak, Math.abs(sample));
            }
            const rms = Math.sqrt(sumSquares / data.length);

            if (isRecording && now - lastAnalysisSample >= 80) {
                analysisFrames.push({
                    time: (now - recordingStartedAt) / 1000,
                    rms,
                    peak
                });
                lastAnalysisSample = now;
            }

            const dpr = window.devicePixelRatio || 1;
            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;
            if (canvas.width !== Math.round(displayWidth * dpr) || canvas.height !== Math.round(displayHeight * dpr)) {
                canvas.width = Math.round(displayWidth * dpr);
                canvas.height = Math.round(displayHeight * dpr);
            }

            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            context.clearRect(0, 0, displayWidth, displayHeight);
            context.strokeStyle = 'rgba(131, 200, 255, 0.16)';
            context.lineWidth = 1;
            context.beginPath();
            context.moveTo(0, displayHeight / 2);
            context.lineTo(displayWidth, displayHeight / 2);
            context.stroke();

            context.strokeStyle = isRecording ? '#ff7169' : '#83c8ff';
            context.lineWidth = 2;
            context.beginPath();
            const slice = displayWidth / data.length;
            for (let index = 0; index < data.length; index += 1) {
                const x = index * slice;
                const y = (displayHeight / 2) + (data[index] * displayHeight * 0.43);
                if (index === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            }
            context.stroke();

            const level = Math.min(100, Math.max(0, (toDb(rms) + 55) * 2));
            elements.levelFill.style.width = `${level}%`;
            elements.levelFill.style.background = peak > 0.9 ? '#ff4a40' : peak > 0.58 ? '#e3a327' : '#5ecf8a';
            elements.levelLabel.textContent = peak > 0.9 ? 'Too high' : peak > 0.04 ? 'Active' : 'Quiet';

            if (isRecording) {
                elements.recordingTimer.textContent = formatSeconds((now - recordingStartedAt) / 1000, true);
            }

            drawFrame = requestAnimationFrame(draw);
        }

        cancelAnimationFrame(drawFrame);
        drawFrame = requestAnimationFrame(draw);
    }

    function startRecording() {
        if (isRecording || !stream) return;

        releasePlaybackUrl();
        currentBlob = null;
        currentMetrics = null;
        chunks = [];
        analysisFrames = [];
        lastAnalysisSample = 0;
        elements.reviewPanel.hidden = true;
        elements.wordsConfirmed.checked = false;
        elements.saveNextButton.disabled = true;

        try {
            const preferredType = selectMimeType();
            mediaRecorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
            currentMimeType = mediaRecorder.mimeType || preferredType || 'audio/webm';
            mediaRecorder.addEventListener('dataavailable', (event) => {
                if (event.data && event.data.size > 0) chunks.push(event.data);
            });
            mediaRecorder.addEventListener('stop', finishRecording, { once: true });
            mediaRecorder.start(250);
        } catch (error) {
            showToast('The browser could not start this recording. Try refreshing the recorder.');
            return;
        }

        isRecording = true;
        recordingStartedAt = performance.now();
        elements.statusChip.textContent = 'Recording';
        elements.statusChip.className = 'status-chip status-chip--recording';
        elements.recordButton.disabled = true;
        elements.stopButton.disabled = false;
        elements.previousButton.disabled = true;
        elements.nextButton.disabled = true;
        elements.consoleTip.textContent = tasks[currentIndex].kind === 'room-tone'
            ? 'Stay completely still and silent until the timer passes ten seconds.'
            : 'Speak naturally. Leave a brief silence at the end before stopping.';
    }

    function stopRecording() {
        if (!isRecording || !mediaRecorder) return;
        isRecording = false;
        mediaRecorder.stop();
        elements.stopButton.disabled = true;
        elements.statusChip.textContent = 'Analyzing';
        elements.statusChip.className = 'status-chip status-chip--ready';
    }

    function finishRecording() {
        const duration = Math.max(0.1, (performance.now() - recordingStartedAt) / 1000);
        currentBlob = new Blob(chunks, { type: currentMimeType });
        currentMetrics = analyzeFrames(analysisFrames, duration, tasks[currentIndex]);
        showReview(currentBlob, currentMetrics, tasks[currentIndex]);

        elements.statusChip.textContent = 'Recorded';
        elements.statusChip.className = 'status-chip status-chip--ready';
        elements.recordButton.disabled = false;
        elements.previousButton.disabled = currentIndex === 0;
        elements.nextButton.disabled = currentIndex === tasks.length - 1;
        elements.consoleTip.textContent = 'Listen to the take, review the signal check, then confirm the words.';
    }

    function analyzeFrames(frames, duration, task) {
        const safeFrames = frames.length ? frames : [{ time: 0, rms: 0, peak: 0 }];
        const overallRms = Math.sqrt(safeFrames.reduce((sum, frame) => sum + (frame.rms * frame.rms), 0) / safeFrames.length);
        const peak = safeFrames.reduce((maximum, frame) => Math.max(maximum, frame.peak), 0);
        const sortedRms = safeFrames.map((frame) => frame.rms).sort((a, b) => a - b);
        const noiseSampleCount = task.kind === 'room-tone'
            ? sortedRms.length
            : Math.max(3, Math.floor(sortedRms.length * 0.2));
        const noiseSamples = sortedRms.slice(0, noiseSampleCount);
        const noiseRms = Math.sqrt(noiseSamples.reduce((sum, value) => sum + (value * value), 0) / Math.max(1, noiseSamples.length));
        const peakDb = toDb(peak);
        const averageDb = toDb(overallRms);
        const noiseDb = toDb(noiseRms);
        const clipPercent = (safeFrames.filter((frame) => frame.peak >= 0.985).length / safeFrames.length) * 100;
        const frameDuration = duration / safeFrames.length;

        let leadingFrames = 0;
        while (leadingFrames < safeFrames.length && safeFrames[leadingFrames].rms < SILENCE_THRESHOLD) leadingFrames += 1;
        let trailingFrames = 0;
        while (trailingFrames < safeFrames.length && safeFrames[safeFrames.length - 1 - trailingFrames].rms < SILENCE_THRESHOLD) trailingFrames += 1;

        const notes = [];
        const addNote = (severity, text) => notes.push({ severity, text });

        if (task.kind === 'room-tone') {
            if (duration < 8) addNote('error', 'Room tone is too short. Record at least ten seconds.');
            else if (duration > 18) addNote('warning', 'The room tone is longer than needed, but it is still usable.');
            else addNote('good', 'Room-tone duration is suitable for noise cleanup.');

            if (noiseDb > -28) addNote('error', 'The room is fairly noisy. Pause fans, HVAC, or nearby electronics and try again.');
            else if (noiseDb > -35) addNote('warning', 'Some room noise is present. A quieter take would give more cleanup flexibility.');
            else addNote('good', 'The measured room noise is low.');

            if (peakDb > -16) addNote('warning', 'A movement or handling sound was detected during the silence.');
        } else {
            const target = expectedSeconds(task);
            const minimum = Math.max(1.2, target * 0.62);
            const maximum = (target * 1.58) + 1;

            if (duration < minimum) addNote('error', 'This take is much shorter than expected. Check that the full snippet was recorded.');
            else if (duration > maximum) addNote('warning', 'This take is slower than expected. It may be usable, but listen for long pauses.');
            else addNote('good', 'The duration is in a natural range for this script.');

            if (clipPercent > 0.8 || peakDb > -0.25) addNote('error', 'The loudest words may be clipping. Move slightly farther from the microphone.');
            else if (peakDb > -1.2) addNote('warning', 'The recording is very close to clipping. A little more microphone distance would help.');
            else if (peakDb < -18) addNote('error', 'The voice is too quiet. Move closer or speak slightly louder.');
            else if (peakDb < -12) addNote('warning', 'The voice is on the quiet side, but it may still clean up well.');
            else addNote('good', 'The peak level has healthy recording headroom.');

            if (averageDb < -38) addNote('error', 'The average voice level is very low.');
            else if (averageDb < -31) addNote('warning', 'The average voice level is a little low.');

            if (noiseDb > -26) addNote('error', 'Background noise is competing with the voice. Try a quieter room.');
            else if (noiseDb > -33) addNote('warning', 'Some background noise is present. Listen for fans or room hum.');
            else addNote('good', 'The quiet portions have a useful noise floor.');

            if ((averageDb - noiseDb) < 8) addNote('error', 'The voice is not far enough above the room noise.');
            else if ((averageDb - noiseDb) < 13) addNote('warning', 'Voice-to-room separation is modest. Moving closer may improve clarity.');

            if ((leadingFrames * frameDuration) < 0.22) addNote('warning', 'Leave a slightly longer silence before the first word.');
            if ((trailingFrames * frameDuration) < 0.22) addNote('warning', 'Leave a slightly longer silence after the last word.');
        }

        const errors = notes.filter((note) => note.severity === 'error').length;
        const warnings = notes.filter((note) => note.severity === 'warning').length;
        const quality = errors ? 'error' : warnings > 1 ? 'warning' : 'good';

        return {
            duration: round(duration, 2),
            peakDb: round(peakDb, 1),
            averageDb: round(averageDb, 1),
            noiseDb: round(noiseDb, 1),
            clipPercent: round(clipPercent, 2),
            leadingSilence: round(leadingFrames * frameDuration, 2),
            trailingSilence: round(trailingFrames * frameDuration, 2),
            quality,
            notes
        };
    }

    function showReview(blob, metrics, task) {
        releasePlaybackUrl();
        playbackUrl = URL.createObjectURL(blob);
        elements.recordingPlayback.src = playbackUrl;
        elements.durationMetric.textContent = `${metrics.duration.toFixed(1)} sec`;
        elements.peakMetric.textContent = `${metrics.peakDb.toFixed(1)} dB`;
        elements.averageMetric.textContent = `${metrics.averageDb.toFixed(1)} dB`;
        elements.noiseMetric.textContent = `${metrics.noiseDb.toFixed(1)} dB`;
        elements.qualityNotes.innerHTML = '';

        metrics.notes.forEach((note) => {
            const item = document.createElement('li');
            item.textContent = note.text;
            if (note.severity !== 'good') item.classList.add(`is-${note.severity}`);
            elements.qualityNotes.appendChild(item);
        });

        elements.qualityBadge.className = 'quality-badge';
        if (metrics.quality === 'error') {
            elements.qualityBadge.textContent = 'Retake recommended';
            elements.qualityBadge.classList.add('is-error');
            elements.qualityHeading.textContent = 'This take needs attention';
        } else if (metrics.quality === 'warning') {
            elements.qualityBadge.textContent = 'Review carefully';
            elements.qualityBadge.classList.add('is-warning');
            elements.qualityHeading.textContent = 'This take may be usable';
        } else {
            elements.qualityBadge.textContent = 'Good take';
            elements.qualityHeading.textContent = 'The signal looks healthy';
        }

        elements.confirmationText.textContent = task.kind === 'room-tone'
            ? 'I listened back and this contains only room silence.'
            : 'I listened back and the words are correct.';
        elements.wordsConfirmed.checked = false;
        elements.saveNextButton.disabled = true;
        elements.saveNextButton.textContent = savedTakes.has(task.id) ? 'Replace saved take and continue →' : 'Save take and continue →';
        elements.reviewPanel.hidden = false;
        elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function showSavedReview(record, task) {
        currentBlob = record.blob;
        currentMimeType = record.mimeType;
        currentMetrics = record.metrics;
        showReview(record.blob, record.metrics, task);
        elements.wordsConfirmed.checked = true;
        elements.saveNextButton.disabled = false;
    }

    function releasePlaybackUrl() {
        if (playbackUrl) {
            URL.revokeObjectURL(playbackUrl);
            playbackUrl = null;
        }
        elements.recordingPlayback.removeAttribute('src');
        elements.recordingPlayback.load();
    }

    function renderCurrentTask() {
        const task = tasks[currentIndex];
        const words = task.kind === 'room-tone' ? 0 : wordCount(task.text);
        const target = expectedSeconds(task);

        elements.takeNumber.textContent = task.number;
        elements.takeTitle.textContent = task.title;
        elements.takeDirection.textContent = task.direction;
        elements.scriptText.textContent = task.text;
        elements.wordCount.textContent = task.kind === 'room-tone' ? 'Silence only' : `${words} words`;
        elements.targetDuration.textContent = `About ${Math.round(target)} seconds`;
        elements.progressLabel.textContent = `Recording ${currentIndex + 1} of ${tasks.length}`;
        elements.progressFill.style.width = `${((currentIndex + 1) / tasks.length) * 100}%`;
        elements.previousButton.disabled = currentIndex === 0 || isRecording;
        elements.nextButton.disabled = currentIndex === tasks.length - 1 || isRecording;
        elements.recordingTimer.textContent = '0:00.0';
        elements.statusChip.textContent = savedTakes.has(task.id) ? 'Saved' : 'Ready';
        elements.statusChip.className = 'status-chip status-chip--ready';
        elements.consoleTip.textContent = task.kind === 'room-tone'
            ? 'Record ten seconds without speaking, moving, or touching the microphone.'
            : 'Take a breath, press record, wait a beat, then begin.';
        elements.reviewPanel.hidden = true;
        elements.wordsConfirmed.checked = false;
        currentBlob = null;
        currentMetrics = null;
        releasePlaybackUrl();

        if (savedTakes.has(task.id)) showSavedReview(savedTakes.get(task.id), task);

        renderTakeList();
        updateProgress();
    }

    function renderTakeList() {
        elements.takeList.innerHTML = '';
        tasks.forEach((task, index) => {
            const record = savedTakes.get(task.id);
            const item = document.createElement('li');
            if (record) {
                item.classList.add('is-saved');
                if (record.metrics.quality !== 'good') item.classList.add(`is-${record.metrics.quality}`);
            }
            if (index === currentIndex) item.classList.add('is-current');

            const state = document.createElement('span');
            state.className = 'take-state';
            state.textContent = record ? '✓' : String(index + 1);

            const button = document.createElement('button');
            button.type = 'button';
            button.innerHTML = `<strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.number)}</small>`;
            button.addEventListener('click', () => navigateTo(index));

            const quality = document.createElement('span');
            quality.className = 'take-quality';

            item.append(state, button, quality);
            elements.takeList.appendChild(item);
        });
    }

    function escapeHtml(text) {
        return text.replace(/[&<>'"]/g, (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#039;',
            '"': '&quot;'
        }[character]));
    }

    function updateProgress() {
        const count = savedTakes.size;
        elements.savedProgress.textContent = `${count} saved`;
        elements.savedCount.textContent = `${count} / ${tasks.length}`;
        elements.downloadAllButton.disabled = count === 0;
    }

    function navigateTo(index) {
        if (isRecording || index < 0 || index >= tasks.length) return;
        currentIndex = index;
        renderCurrentTask();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function retakeCurrent() {
        currentBlob = null;
        currentMetrics = null;
        releasePlaybackUrl();
        elements.reviewPanel.hidden = true;
        elements.wordsConfirmed.checked = false;
        elements.saveNextButton.disabled = true;
        elements.statusChip.textContent = 'Ready';
        elements.consoleTip.textContent = 'Take a breath, press record, wait a beat, then begin.';
        elements.recordButton.focus();
    }

    async function saveCurrentTake() {
        if (!currentBlob || !currentMetrics || !elements.wordsConfirmed.checked) return;
        const task = tasks[currentIndex];
        const extension = extensionForMime(currentMimeType);
        const record = {
            id: task.id,
            filename: `${task.fileBase}.${extension}`,
            mimeType: currentMimeType,
            blob: currentBlob,
            text: task.text,
            direction: task.direction,
            metrics: currentMetrics,
            savedAt: new Date().toISOString()
        };

        elements.saveNextButton.disabled = true;
        elements.saveNextButton.textContent = 'Saving…';

        try {
            await putTake(record);
            savedTakes.set(task.id, record);
            showToast(`${record.filename} saved locally.`);
            renderTakeList();
            updateProgress();

            if (savedTakes.size === tasks.length) {
                elements.completionModal.hidden = false;
            } else {
                const nextIndex = nextUnsavedIndex(currentIndex);
                navigateTo(nextIndex);
            }
        } catch (error) {
            elements.saveNextButton.disabled = false;
            elements.saveNextButton.textContent = 'Save take and continue →';
            showToast('The take could not be saved. Keep this page open and try again.');
        }
    }

    function nextUnsavedIndex(afterIndex) {
        for (let offset = 1; offset <= tasks.length; offset += 1) {
            const candidate = (afterIndex + offset) % tasks.length;
            if (!savedTakes.has(tasks[candidate].id)) return candidate;
        }
        return Math.min(afterIndex + 1, tasks.length - 1);
    }

    function showToast(message) {
        clearTimeout(toastTimer);
        elements.toast.textContent = message;
        elements.toast.hidden = false;
        toastTimer = setTimeout(() => {
            elements.toast.hidden = true;
        }, 3200);
    }

    async function clearSession() {
        if (!savedTakes.size) return;
        const confirmed = window.confirm('Clear every saved recording from this browser? Download anything you want to keep first.');
        if (!confirmed) return;
        await clearStoredTakes();
        currentIndex = 0;
        renderCurrentTask();
        showToast('The local recording session was cleared.');
    }

    const crcTable = (() => {
        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index += 1) {
            let value = index;
            for (let bit = 0; bit < 8; bit += 1) {
                value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
            }
            table[index] = value >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let crc = 0xffffffff;
        for (let index = 0; index < bytes.length; index += 1) {
            crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    function dosDateTime(date) {
        const year = Math.max(1980, date.getFullYear());
        return {
            date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
            time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
        };
    }

    function concatBytes(parts) {
        const total = parts.reduce((sum, part) => sum + part.length, 0);
        const output = new Uint8Array(total);
        let offset = 0;
        parts.forEach((part) => {
            output.set(part, offset);
            offset += part.length;
        });
        return output;
    }

    async function createZip(files) {
        const encoder = new TextEncoder();
        const localParts = [];
        const centralParts = [];
        let localOffset = 0;
        const stamp = dosDateTime(new Date());

        for (const file of files) {
            const nameBytes = encoder.encode(file.name);
            const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(await file.data.arrayBuffer());
            const checksum = crc32(data);

            const localHeader = new Uint8Array(30 + nameBytes.length);
            const localView = new DataView(localHeader.buffer);
            localView.setUint32(0, 0x04034b50, true);
            localView.setUint16(4, 20, true);
            localView.setUint16(6, 0x0800, true);
            localView.setUint16(8, 0, true);
            localView.setUint16(10, stamp.time, true);
            localView.setUint16(12, stamp.date, true);
            localView.setUint32(14, checksum, true);
            localView.setUint32(18, data.length, true);
            localView.setUint32(22, data.length, true);
            localView.setUint16(26, nameBytes.length, true);
            localView.setUint16(28, 0, true);
            localHeader.set(nameBytes, 30);
            localParts.push(localHeader, data);

            const centralHeader = new Uint8Array(46 + nameBytes.length);
            const centralView = new DataView(centralHeader.buffer);
            centralView.setUint32(0, 0x02014b50, true);
            centralView.setUint16(4, 20, true);
            centralView.setUint16(6, 20, true);
            centralView.setUint16(8, 0x0800, true);
            centralView.setUint16(10, 0, true);
            centralView.setUint16(12, stamp.time, true);
            centralView.setUint16(14, stamp.date, true);
            centralView.setUint32(16, checksum, true);
            centralView.setUint32(20, data.length, true);
            centralView.setUint32(24, data.length, true);
            centralView.setUint16(28, nameBytes.length, true);
            centralView.setUint16(30, 0, true);
            centralView.setUint16(32, 0, true);
            centralView.setUint16(34, 0, true);
            centralView.setUint16(36, 0, true);
            centralView.setUint32(38, 0, true);
            centralView.setUint32(42, localOffset, true);
            centralHeader.set(nameBytes, 46);
            centralParts.push(centralHeader);

            localOffset += localHeader.length + data.length;
        }

        const centralDirectory = concatBytes(centralParts);
        const end = new Uint8Array(22);
        const endView = new DataView(end.buffer);
        endView.setUint32(0, 0x06054b50, true);
        endView.setUint16(4, 0, true);
        endView.setUint16(6, 0, true);
        endView.setUint16(8, files.length, true);
        endView.setUint16(10, files.length, true);
        endView.setUint32(12, centralDirectory.length, true);
        endView.setUint32(16, localOffset, true);
        endView.setUint16(20, 0, true);

        return new Blob([...localParts, centralDirectory, end], { type: 'application/zip' });
    }

    function buildManifest(records) {
        return {
            project: 'For The Boards introduction narration',
            createdAt: new Date().toISOString(),
            appVersion: 1,
            savedTakes: records.length,
            expectedTakes: tasks.length,
            takes: records.map((record) => ({
                id: record.id,
                filename: record.filename,
                text: record.text,
                direction: record.direction,
                mimeType: record.mimeType,
                metrics: record.metrics,
                savedAt: record.savedAt
            }))
        };
    }

    function buildScriptText() {
        return tasks.map((task, index) => [
            `${index + 1}. ${task.number} - ${task.title}`,
            `Filename: ${task.fileBase}`,
            `Direction: ${task.direction}`,
            `Text: ${task.text}`
        ].join('\n')).join('\n\n');
    }

    async function downloadAll() {
        if (!savedTakes.size) return;
        const records = tasks.map((task) => savedTakes.get(task.id)).filter(Boolean);
        elements.downloadAllButton.disabled = true;
        elements.completionDownloadButton.disabled = true;
        showToast('Preparing the recording package…');

        try {
            const encoder = new TextEncoder();
            const manifest = buildManifest(records);
            const files = records.map((record) => ({ name: record.filename, data: record.blob }));
            files.push({
                name: 'recording-manifest.json',
                data: encoder.encode(JSON.stringify(manifest, null, 2))
            });
            files.push({
                name: 'recording-script.txt',
                data: encoder.encode(buildScriptText())
            });
            files.push({
                name: 'README.txt',
                data: encoder.encode('For The Boards narration recording package.\n\nAttach this ZIP to the Codex task for cleanup, editing, selection, and mixing.\n')
            });

            const zip = await createZip(files);
            const date = new Date().toISOString().slice(0, 10);
            downloadBlob(zip, `for-the-boards-voice-session-${date}.zip`);
            showToast('Recording package downloaded.');
        } catch (error) {
            showToast('The ZIP could not be created. Your recordings remain saved in this browser.');
        } finally {
            elements.downloadAllButton.disabled = savedTakes.size === 0;
            elements.completionDownloadButton.disabled = false;
        }
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function attachEvents() {
        elements.enableMicButton.addEventListener('click', enableMicrophone);
        elements.recordButton.addEventListener('click', startRecording);
        elements.stopButton.addEventListener('click', stopRecording);
        elements.retakeButton.addEventListener('click', retakeCurrent);
        elements.saveNextButton.addEventListener('click', saveCurrentTake);
        elements.previousButton.addEventListener('click', () => navigateTo(currentIndex - 1));
        elements.nextButton.addEventListener('click', () => navigateTo(currentIndex + 1));
        elements.wordsConfirmed.addEventListener('change', () => {
            elements.saveNextButton.disabled = !elements.wordsConfirmed.checked || !currentBlob;
        });
        elements.downloadAllButton.addEventListener('click', downloadAll);
        elements.completionDownloadButton.addEventListener('click', downloadAll);
        elements.clearSessionButton.addEventListener('click', clearSession);
        elements.closeCompletionButton.addEventListener('click', () => {
            elements.completionModal.hidden = true;
        });

        window.addEventListener('beforeunload', (event) => {
            if (!isRecording) return;
            event.preventDefault();
            event.returnValue = '';
        });
    }

    async function initialize() {
        attachEvents();
        try {
            database = await openDatabase();
            await loadSavedTakes();
            updateProgress();
            renderTakeList();
        } catch (error) {
            elements.permissionError.textContent = 'Local recording storage is unavailable in this browser. Try a current version of Chrome or Safari.';
            elements.permissionError.hidden = false;
            elements.enableMicButton.disabled = true;
        }
    }

    initialize();
}());
