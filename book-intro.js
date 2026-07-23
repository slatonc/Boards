(function () {
    'use strict';

    const DURATION = 59.722;
    const startParameter = new URLSearchParams(window.location.search).get('t');
    const requestedStart = Number(startParameter);
    const isFramePreview = startParameter !== null;
    const initialTime = Number.isFinite(requestedStart) ? Math.max(0, Math.min(DURATION, requestedStart)) : 0;
    const scenes = [
        { start: 0, end: 5.987 },
        { start: 5.987, end: 16.976 },
        { start: 16.976, end: 29.542 },
        { start: 29.542, end: 46.281 },
        { start: 46.281, end: 52.553 },
        { start: 52.553, end: DURATION + 0.5 }
    ];

    const captions = [
        { start: 0, end: 5.987, text: 'Hi, I’m Slaton Case—a physician and the author of For The Boards.' },
        { start: 5.987, end: 12.10, text: 'I wrote For The Boards in residency because most study materials teach from a diagnosis.' },
        { start: 12.10, end: 16.976, text: 'Patients—and board questions—start with a presentation.' },
        { start: 16.976, end: 20.25, text: 'For The Boards starts with the symptoms and clues,' },
        { start: 20.25, end: 23.19, text: 'then links them to the diagnosis:' },
        { start: 23.19, end: 26.29, text: 'how to confirm it, treat it,' },
        { start: 26.29, end: 29.542, text: 'monitor it, and separate look-alikes.' },
        { start: 29.542, end: 34.665, text: 'It’s built for the knowledge you already have—not to reteach medicine from scratch.' },
        { start: 34.665, end: 36.64, text: 'Use it with your question bank.' },
        { start: 36.64, end: 39.31, text: 'Add notes from wards and questions.' },
        { start: 39.31, end: 46.281, text: 'Over time it becomes your personalized ABIM reference—something you trust and can hold in your hands.' },
        { start: 46.281, end: 49.08, text: 'Individual copies are $60.' },
        { start: 49.08, end: 52.553, text: 'Bulk program pricing is $50 per resident.' },
        { start: 52.553, end: 54.15, text: 'Connect the symptoms.' },
        { start: 54.15, end: 55.88, text: 'Make the diagnosis.' },
        { start: 55.88, end: 57.893, text: 'Make the book your own.' },
        { start: 57.893, end: 60.2, text: 'For The Boards.' }
    ];

    const film = document.getElementById('film');
    const narration = document.getElementById('narration');
    const startButton = document.getElementById('startButton');
    const playButton = document.getElementById('playButton');
    const playIcon = document.getElementById('playIcon');
    const muteButton = document.getElementById('muteButton');
    const muteIcon = document.getElementById('muteIcon');
    const captionButton = document.getElementById('captionButton');
    const caption = document.getElementById('caption');
    const filmNotice = document.getElementById('filmNotice');
    const timeline = document.getElementById('timeline');
    const timelineFill = document.getElementById('timelineFill');
    const timecode = document.getElementById('timecode');
    const sceneElements = Array.from(document.querySelectorAll('.scene'));
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ICON_PLAY = '▶';
    const ICON_PAUSE = '❚❚';
    const ICON_REPLAY = '↻';
    const ICON_SPEAKER = ''
        + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>'
        + '<path d="M15.5 8.5a5 5 0 0 1 0 7"></path>'
        + '<path d="M18.5 5.5a9 9 0 0 1 0 13"></path>'
        + '</svg>';
    const ICON_MUTED = ''
        + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>'
        + '<line x1="23" y1="9" x2="17" y2="15"></line>'
        + '<line x1="17" y1="9" x2="23" y2="15"></line>'
        + '</svg>';

    let animationFrame = null;
    let started = false;
    let captionsVisible = true;
    let activeScene = 0;
    let audioContext = null;
    let musicMaster = null;
    let musicNodes = [];
    let fallbackPlaying = false;
    let fallbackOffset = initialTime;
    let fallbackStartedAt = 0;
    let noticeTimer = null;

    function showNotice(message, durationMs) {
        if (!filmNotice) return;
        filmNotice.hidden = false;
        filmNotice.textContent = message;
        clearTimeout(noticeTimer);
        if (durationMs > 0) {
            noticeTimer = setTimeout(() => {
                filmNotice.hidden = true;
                filmNotice.textContent = '';
            }, durationMs);
        }
    }

    function setMuteIcon(isMuted) {
        muteIcon.innerHTML = isMuted ? ICON_MUTED : ICON_SPEAKER;
        muteButton.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
    }

    function formatTime(seconds) {
        const safe = Math.max(0, Math.min(DURATION, seconds));
        const minutes = Math.floor(safe / 60);
        const remaining = Math.floor(safe % 60).toString().padStart(2, '0');
        return `${minutes}:${remaining}`;
    }

    function sceneForTime(time) {
        const index = scenes.findIndex((scene) => time >= scene.start && time < scene.end);
        return index === -1 ? scenes.length - 1 : index;
    }

    function captionForTime(time) {
        return captions.find((item) => time >= item.start && time < item.end) || captions[captions.length - 1];
    }

    function setScene(index) {
        if (index === activeScene && sceneElements[index].classList.contains('is-active')) return;
        activeScene = index;
        sceneElements.forEach((scene, sceneIndex) => {
            const isActive = sceneIndex === index;
            scene.classList.toggle('is-active', isActive);
            scene.setAttribute('aria-hidden', String(!isActive));
        });
    }

    function render(time) {
        const progress = Math.min(100, Math.max(0, (time / DURATION) * 100));
        const activeCaption = captionForTime(time);

        setScene(sceneForTime(time));
        timelineFill.style.width = `${progress}%`;
        timeline.setAttribute('aria-valuenow', String(Math.round(time)));
        timecode.textContent = `${formatTime(time)} / 1:00`;
        caption.textContent = activeCaption.text;
    }

    function currentTime() {
        if (!fallbackPlaying) return narration.currentTime;
        return Math.min(DURATION, fallbackOffset + ((performance.now() - fallbackStartedAt) / 1000));
    }

    function finishPlayback() {
        fallbackPlaying = false;
        fallbackOffset = DURATION;
        stopMusic();
        cancelAnimationFrame(animationFrame);
        playIcon.textContent = ICON_REPLAY;
        playButton.setAttribute('aria-label', 'Replay');
        render(DURATION);
    }

    function tick() {
        const time = currentTime();
        render(time);
        if (time >= DURATION - 0.02) {
            finishPlayback();
        } else if (fallbackPlaying || (!narration.paused && !narration.ended)) {
            animationFrame = requestAnimationFrame(tick);
        }
    }

    function stopMusic() {
        musicNodes.forEach((node) => {
            try { node.stop(); } catch (error) { /* node already stopped */ }
        });
        musicNodes = [];
    }

    function startMusic(offset) {
        if (narration.muted || prefersReducedMotion) return;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;

        if (!audioContext) {
            audioContext = new AudioContextClass();
            musicMaster = audioContext.createGain();
            musicMaster.gain.value = 0.018;
            musicMaster.connect(audioContext.destination);
        }

        stopMusic();
        audioContext.resume();

        const now = audioContext.currentTime;
        const chords = [
            [110.00, 130.81, 164.81],
            [87.31, 110.00, 130.81],
            [65.41, 98.00, 130.81],
            [98.00, 123.47, 146.83]
        ];

        for (let segment = 0; segment < 8; segment += 1) {
            const segmentStart = segment * 7.5;
            const segmentEnd = Math.min(DURATION, segmentStart + 7.7);
            if (segmentEnd <= offset) continue;

            const scheduledStart = now + Math.max(0, segmentStart - offset);
            const scheduledEnd = now + Math.max(0.2, segmentEnd - offset);
            const chord = chords[segment % chords.length];

            chord.forEach((frequency, noteIndex) => {
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();
                oscillator.type = noteIndex === 0 ? 'sine' : 'triangle';
                oscillator.frequency.value = frequency;
                gain.gain.setValueAtTime(0.0001, scheduledStart);
                gain.gain.exponentialRampToValueAtTime(noteIndex === 0 ? 0.42 : 0.18, scheduledStart + 0.8);
                gain.gain.setValueAtTime(noteIndex === 0 ? 0.42 : 0.18, Math.max(scheduledStart + 0.9, scheduledEnd - 1));
                gain.gain.exponentialRampToValueAtTime(0.0001, scheduledEnd);
                oscillator.connect(gain);
                gain.connect(musicMaster);
                oscillator.start(scheduledStart);
                oscillator.stop(scheduledEnd + 0.05);
                musicNodes.push(oscillator);
            });
        }
    }

    async function play() {
        if (narration.ended || currentTime() >= DURATION - 0.2) {
            narration.currentTime = 0;
            fallbackOffset = 0;
            render(0);
        }

        started = true;
        startButton.classList.add('is-hidden');

        try {
            await narration.play();
            fallbackPlaying = false;
            if (!prefersReducedMotion) startMusic(narration.currentTime);
        } catch (error) {
            fallbackPlaying = true;
            fallbackStartedAt = performance.now();
            showNotice('Playing without audio', 3500);
        }

        playIcon.textContent = ICON_PAUSE;
        playButton.setAttribute('aria-label', 'Pause');
        cancelAnimationFrame(animationFrame);
        tick();
    }

    function pause() {
        if (fallbackPlaying) {
            fallbackOffset = currentTime();
            fallbackPlaying = false;
            narration.currentTime = fallbackOffset;
        }
        narration.pause();
        stopMusic();
        cancelAnimationFrame(animationFrame);
        playIcon.textContent = ICON_PLAY;
        playButton.setAttribute('aria-label', 'Play');
        render(narration.currentTime);
    }

    function togglePlay() {
        if (!fallbackPlaying && (narration.paused || narration.ended)) play();
        else pause();
    }

    function seekTo(clientX) {
        const bounds = timeline.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
        const targetTime = ratio * DURATION;
        narration.currentTime = targetTime;
        fallbackOffset = targetTime;
        if (fallbackPlaying) fallbackStartedAt = performance.now();
        render(targetTime);
        if (!narration.paused && !prefersReducedMotion) startMusic(targetTime);
    }

    startButton.addEventListener('click', play);
    playButton.addEventListener('click', togglePlay);

    muteButton.addEventListener('click', () => {
        narration.muted = !narration.muted;
        setMuteIcon(narration.muted);
        if (narration.muted || prefersReducedMotion) stopMusic();
        else if (fallbackPlaying || !narration.paused) startMusic(currentTime());
    });

    captionButton.addEventListener('click', () => {
        captionsVisible = !captionsVisible;
        caption.classList.toggle('is-hidden', !captionsVisible);
        caption.setAttribute('aria-live', captionsVisible ? 'polite' : 'off');
        captionButton.classList.toggle('is-on', captionsVisible);
        captionButton.setAttribute('aria-pressed', String(captionsVisible));
        captionButton.setAttribute('aria-label', captionsVisible ? 'Hide captions' : 'Show captions');
    });

    timeline.addEventListener('click', (event) => seekTo(event.clientX));
    timeline.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        const targetTime = Math.max(0, Math.min(DURATION, currentTime() + direction * 5));
        narration.currentTime = targetTime;
        fallbackOffset = targetTime;
        if (fallbackPlaying) fallbackStartedAt = performance.now();
        render(targetTime);
        if (!narration.paused && !prefersReducedMotion) startMusic(targetTime);
    });

    film.addEventListener('keydown', (event) => {
        if (event.code !== 'Space' || event.target === timeline) return;
        event.preventDefault();
        togglePlay();
    });

    narration.addEventListener('ended', finishPlayback);

    narration.addEventListener('loadedmetadata', () => {
        narration.currentTime = initialTime;
        render(initialTime);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && (fallbackPlaying || !narration.paused)) pause();
    });

    if (isFramePreview) startButton.classList.add('is-hidden');
    if (prefersReducedMotion) film.classList.add('is-reduced-motion');
    setMuteIcon(false);
    caption.setAttribute('aria-live', 'polite');
    render(initialTime);
}());
