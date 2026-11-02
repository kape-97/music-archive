/**
 * @typedef {Object} PlayerTrack
 * @property {number} id
 * @property {string} title
 * @property {string} artist
 * @property {string} audioUrl
 * @property {string | null} coverUrl
 * @property {boolean} [deletionPending]
 */

/**
 * @typedef {Object} PlayerControllerState
 * @property {PlayerTrack | null} currentTrack
 * @property {PlayerTrack[]} queue
 * @property {number} queueIndex
 * @property {boolean} isPlaying
 * @property {boolean} isLoading
 * @property {number} currentTime
 * @property {number} duration
 * @property {string} errorMessage
 * @property {number} volume
 * @property {boolean} isMuted
 */

/**
 * @typedef {Object} PlayerController
 * @property {PlayerControllerState} state
 * @property {(element: HTMLAudioElement) => void} attachAudioElement
 * @property {(element: HTMLAudioElement) => void} detachAudioElement
 * @property {(track: PlayerTrack, tracks?: PlayerTrack[]) => Promise<boolean>} playTrack
 * @property {(track: PlayerTrack, tracks?: PlayerTrack[]) => Promise<boolean>} toggleTrack
 * @property {() => Promise<boolean>} toggleCurrentTrack
 * @property {() => Promise<boolean>} playNext
 * @property {() => Promise<boolean>} playPrevious
 * @property {(track: PlayerTrack) => boolean} addToQueue
 * @property {() => void} pause
 * @property {() => void} stop
 * @property {(songId: number) => void} clearTrack
 * @property {(songId: number) => void} removeTrack
 * @property {() => void} clearQueue
 * @property {(time: number) => boolean} seekTo
 * @property {(track: PlayerTrack) => void} updateTrackMetadata
 * @property {(value: number) => boolean} setVolume
 * @property {() => void} toggleMute
 * @property {(event: Event) => void} handlePlay
 * @property {(event: Event) => void} handlePause
 * @property {(event: Event) => void} handleWaiting
 * @property {(event: Event) => void} handlePlaying
 * @property {(event: Event) => void} handleCanPlay
 * @property {(event: Event) => void} handleTimeUpdate
 * @property {(event: Event) => void} handleMetadata
 * @property {(event: Event) => void} handleEnded
 * @property {(event: Event) => void} handleError
 * @property {(event: Event) => void} handleVolumeChange
 */

/**
 * Context key used to share the playback controller.
 */
export const PLAYER_CONTEXT_KEY = "music-archive-player";

/**
 * Create an independent playback controller for the application tree.
 *
 * @returns {PlayerController}
 */
export function createPlayerController() {
    /** @type {HTMLAudioElement | null} */
    let audioElement = null;

    /** @type {number} */
    let playAttemptId = 0;

    /** @type {number} */
    let lastNonZeroVolume = 0.8;

    /**
     * Songs belonging to the currently active catalogue collection.
     *
     * The catalogue page supplies this collection when playback
     * begins from a particular search result or filtered section.
     *
     * @type {PlayerTrack[]}
     */
    let collectionQueue = [];

    /**
     * Songs manually added by the listener.
     *
     * These songs remain in the queue when the active catalogue
     * collection changes.
     *
     * @type {PlayerTrack[]}
     */
    let manualQueue = [];

    /** @type {PlayerControllerState} */
    const state = $state({
        currentTrack: null,

        queue: [],
        queueIndex: -1,

        isPlaying: false,
        isLoading: false,

        currentTime: 0,
        duration: 0,

        errorMessage: "",

        // Default volume: 80%.
        volume: 0.8,
        isMuted: false
    });

    /**
     * Validate a track before accepting it.
     *
     * Only application-relative audio URLs are accepted.
     * Direct external URLs and protocol-relative URLs are rejected.
     *
     * @param {PlayerTrack} track
     * @returns {boolean}
     */
    function isPlayableTrack(track) {
        return (
            track !== null &&
            typeof track === "object" &&
            Number.isSafeInteger(track.id) &&
            track.id > 0 &&
            typeof track.title === "string" &&
            typeof track.artist === "string" &&
            typeof track.audioUrl === "string" &&
            track.audioUrl.startsWith("/") &&
            !track.audioUrl.startsWith("//") &&
            (
                typeof track.coverUrl === "string" ||
                track.coverUrl === null
            ) &&
            track.deletionPending !== true
        );
    }

    /**
     * Rebuild the playback queue from the active collection
     * and manually added songs.
     *
     * Collection songs always appear first.
     * Manually added songs are appended afterwards.
     *
     * Duplicate song IDs are removed.
     *
     * The selected track is used to synchronize queueIndex.
     *
     * @param {PlayerTrack | null} [selectedTrack]
     */
    function syncQueue(selectedTrack = state.currentTrack) {
        /** @type {PlayerTrack[]} */
        const nextQueue = [];

        const seenIds = new Set();

        // Add songs from the active catalogue collection first.
        for (const item of collectionQueue) {
            if (
                !isPlayableTrack(item) ||
                seenIds.has(item.id)
            ) {
                continue;
            }

            nextQueue.push({ ...item });
            seenIds.add(item.id);
        }

        // Append manually added songs.
        for (const item of manualQueue) {
            if (
                !isPlayableTrack(item) ||
                seenIds.has(item.id)
            ) {
                continue;
            }

            nextQueue.push({ ...item });
            seenIds.add(item.id);
        }

        // Ensure the selected track remains in the queue.
        if (
            selectedTrack &&
            isPlayableTrack(selectedTrack) &&
            !seenIds.has(selectedTrack.id)
        ) {
            nextQueue.unshift({ ...selectedTrack });
        }

        state.queue = nextQueue;

        // Keep the queue position aligned with the selected song.
        state.queueIndex = selectedTrack
            ? nextQueue.findIndex(
                (item) => item.id === selectedTrack.id
            )
            : -1;
    }

    /**
     * Prepare the queue for a selected song.
     *
     * When a new collection is supplied, it replaces the previous
     * active collection.
     *
     * Manually added songs are retained across collection changes.
     *
     * @param {PlayerTrack} track
     * @param {PlayerTrack[] | undefined} [tracks]
     */
    function prepareQueue(track, tracks) {
        // Replace the active collection only when a new one is supplied.
        if (Array.isArray(tracks)) {
            /** @type {PlayerTrack[]} */
            const nextCollection = [];

            const seenIds = new Set();

            for (const item of tracks) {
                if (
                    !isPlayableTrack(item) ||
                    seenIds.has(item.id)
                ) {
                    continue;
                }

                nextCollection.push({ ...item });
                seenIds.add(item.id);
            }

            collectionQueue = nextCollection;
        }

        // Make sure the selected song belongs to the active collection.
        const selectedIndex = collectionQueue.findIndex(
            (item) => item.id === track.id
        );

        if (selectedIndex === -1) {
            collectionQueue.push({ ...track });
        } else {
            collectionQueue[selectedIndex] = { ...track };
        }

        syncQueue(track);
    }

    /**
     * Attach the one central HTML audio element.
     *
     * @param {HTMLAudioElement} element
     */
    function attachAudioElement(element) {
        if (audioElement === element) return;

        audioElement = element;

        // Synchronize the initial volume with the audio element.
        audioElement.volume = state.volume;
        audioElement.muted = state.isMuted;
    }

    /**
     * Detach the central audio element.
     *
     * @param {HTMLAudioElement} element
     */
    function detachAudioElement(element) {
        if (audioElement !== element) return;

        stop();
        audioElement = null;
    }

    /**
     * Start playing a selected song.
     *
     * If a collection is supplied, it becomes the active collection.
     * Otherwise, the existing queue context is retained.
     *
     * @param {PlayerTrack} track
     * @param {PlayerTrack[] | undefined} [tracks]
     * @returns {Promise<boolean>}
     */
    async function playTrack(track, tracks) {
        if (!isPlayableTrack(track)) {
            state.errorMessage =
                track?.deletionPending
                    ? "This song is pending deletion and cannot be played."
                    : "The selected track is not available.";

            return false;
        }

        if (!audioElement) {
            state.errorMessage = "The audio player is not ready.";
            return false;
        }

        prepareQueue(track, tracks);

        const attemptId = ++playAttemptId;

        const sameSource =
            state.currentTrack !== null &&
            state.currentTrack.id === track.id &&
            state.currentTrack.audioUrl === track.audioUrl;

        if (!sameSource) {
            // Stop the previous track before replacing its source.
            audioElement.pause();

            state.currentTrack = { ...track };
            state.currentTime = 0;
            state.duration = 0;
            state.isPlaying = false;

            audioElement.src = track.audioUrl;
            audioElement.load();
        } else {
            // Refresh displayed metadata without restarting playback.
            state.currentTrack = { ...track };
        }

        if (audioElement.ended) {
            audioElement.currentTime = 0;
        }

        state.errorMessage = "";
        state.isLoading = true;

        try {
            await audioElement.play();

            if (attemptId !== playAttemptId) {
                return false;
            }

            state.isPlaying = !audioElement.paused;
            state.isLoading = false;

            return state.isPlaying;
        } catch (error) {
            if (attemptId !== playAttemptId) {
                return false;
            }

            console.error("Unable to play selected track:", {
                songId: track.id,
                error
            });

            const errorName =
                error instanceof Error ? error.name : "";

            state.isPlaying = false;
            state.isLoading = false;

            state.errorMessage =
                errorName === "NotAllowedError"
                    ? "Playback was blocked by the browser. Press Play to try again."
                    : "Unable to play this track. Please try again.";

            return false;
        }
    }

    /**
     * Toggle playback for a selected song from a page.
     *
     * Public catalogue:
     * Pass the active collection as the second argument.
     *
     * Admin:
     * Do not pass a collection. Admin playback is intentionally
     * standalone and resets the queue to the selected song.
     *
     * @param {PlayerTrack} track
     * @param {PlayerTrack[] | undefined} [tracks]
     * @returns {Promise<boolean>}
     */
    async function toggleTrack(track, tracks) {
        if (!isPlayableTrack(track)) {
            return playTrack(track);
        }

        if (Array.isArray(tracks)) {
            // Public catalogue playback.
            prepareQueue(track, tracks);
        } else {
            // Admin playback is intentionally standalone.
            // It must not inherit a previous public queue.
            collectionQueue = [];
            manualQueue = [];

            prepareQueue(track, [track]);
        }

        const sameTrack =
            state.currentTrack !== null &&
            state.currentTrack.id === track.id &&
            state.currentTrack.audioUrl === track.audioUrl;

        if (
            sameTrack &&
            audioElement &&
            !audioElement.paused
        ) {
            pause();
            return false;
        }

        return playTrack(track);
    }

    /**
     * Toggle the currently selected song.
     *
     * This method deliberately preserves the existing queue.
     * It does not reset the active collection or manual additions.
     *
     * @returns {Promise<boolean>}
     */
    async function toggleCurrentTrack() {
        if (!state.currentTrack) {
            return false;
        }

        if (
            audioElement &&
            !audioElement.paused
        ) {
            pause();
            return false;
        }

        return playTrack(state.currentTrack);
    }

    /**
     * Play the next track in the queue.
     *
     * @returns {Promise<boolean>}
     */
    async function playNext() {
        const nextIndex = state.queueIndex + 1;
        const nextTrack = state.queue[nextIndex];

        if (!nextTrack) return false;

        return playTrack(nextTrack);
    }

    /**
     * Play the previous track in the queue.
     *
     * @returns {Promise<boolean>}
     */
    async function playPrevious() {
        const previousIndex = state.queueIndex - 1;
        const previousTrack = state.queue[previousIndex];

        if (!previousTrack) return false;

        return playTrack(previousTrack);
    }

    /**
     * Add a song manually to the end of the playback queue.
     *
     * Manually added songs are kept separately from the active
     * catalogue collection.
     *
     * A song already present in the queue is not duplicated.
     *
     * @param {PlayerTrack} track
     * @returns {boolean}
     */
    function addToQueue(track) {
        if (!isPlayableTrack(track)) {
            return false;
        }

        const alreadyExists = state.queue.some(
            (item) => item.id === track.id
        );

        if (alreadyExists) {
            return false;
        }

        manualQueue.push({ ...track });

        syncQueue();

        return true;
    }

    /**
     * Pause without clearing the selected song or queue.
     */
    function pause() {
        playAttemptId++;

        audioElement?.pause();

        state.isPlaying = false;
        state.isLoading = false;
    }

    /**
     * Stop playback and clear the current queue.
     *
     * Both the active collection and manually added queue
     * are cleared.
     */
    function stop() {
        playAttemptId++;

        if (audioElement) {
            audioElement.pause();
            audioElement.removeAttribute("src");
            audioElement.load();
        }

        // Clear the internal queue sources.
        collectionQueue = [];
        manualQueue = [];

        state.currentTrack = null;
        state.queue = [];
        state.queueIndex = -1;

        state.isPlaying = false;
        state.isLoading = false;

        state.currentTime = 0;
        state.duration = 0;

        state.errorMessage = "";
    }

    /**
     * Remove a song from the playback queue.
     *
     * If the song is currently playing, playback is stopped.
     *
     * Otherwise, the song is removed from both the active
     * collection and the manually added queue.
     *
     * @param {number} songId
     */
    /**
 * Remove a song from the playback queue.
 *
 * Removing the currently playing song stops its playback,
 * but preserves all other queued songs.
 *
 * @param {number} songId
 */
function removeTrack(songId) {
    const isCurrentTrack = state.currentTrack?.id === songId;

    // Remove the song from both internal queue sources.
    collectionQueue = collectionQueue.filter(
        (track) => track.id !== songId
    );

    manualQueue = manualQueue.filter(
        (track) => track.id !== songId
    );

    if (isCurrentTrack) {
        playAttemptId++;

        if (audioElement) {
            audioElement.pause();
            audioElement.removeAttribute("src");
            audioElement.load();
        }

        state.currentTrack = null;
        state.isPlaying = false;
        state.isLoading = false;

        state.currentTime = 0;
        state.duration = 0;

        state.errorMessage = "";

        // Keep the remaining queue.
        syncQueue(null);

        return;
    }

    // Preserve the current song and its queue position.
    syncQueue();
}

/**
 * Clear the entire queue and stop playback.
 */
function clearQueue() {
    stop();
}

    /**
     * Clear the player if the selected track matches the given ID.
     *
     * @param {number} songId
     */
    function clearTrack(songId) {
        if (state.currentTrack?.id !== songId) return;

        stop();
    }

    /**
     * Seek to a requested position.
     *
     * @param {number} time
     * @returns {boolean}
     */
    function seekTo(time) {
        if (
            !audioElement ||
            !Number.isFinite(time) ||
            !Number.isFinite(state.duration) ||
            state.duration <= 0
        ) {
            return false;
        }

        const targetTime = Math.max(
            0,
            Math.min(state.duration, time)
        );

        try {
            audioElement.currentTime = targetTime;
            state.currentTime = targetTime;

            return true;
        } catch (error) {
            console.error("Unable to seek audio:", error);
            return false;
        }
    }

    /**
     * Update the selected track or its queued metadata.
     *
     * Never silently replace the active audio source.
     *
     * @param {PlayerTrack} track
     */
    function updateTrackMetadata(track) {
        if (track.deletionPending) {
            removeTrack(track.id);
            return;
        }

        // Keep both internal queue sources synchronized.
        for (const list of [collectionQueue, manualQueue]) {
            const index = list.findIndex(
                (item) => item.id === track.id
            );

            if (index !== -1) {
                list[index] = { ...track };
            }
        }

        // Update the visible playback queue.
        const queueIndex = state.queue.findIndex(
            (item) => item.id === track.id
        );

        if (queueIndex !== -1) {
            const updatedQueue = [...state.queue];
            updatedQueue[queueIndex] = { ...track };
            state.queue = updatedQueue;
        }

        const current = state.currentTrack;

        if (!current || current.id !== track.id) {
            return;
        }

        // Do not silently switch the active audio source.
        if (current.audioUrl !== track.audioUrl) {
            return;
        }

        state.currentTrack = { ...track };
    }

    /**
     * Validate an audio event's source element.
     *
     * @param {Event} event
     * @returns {HTMLAudioElement | null}
     */
    function getEventAudio(event) {
        const element = event.currentTarget;

        if (
            !(element instanceof HTMLAudioElement) ||
            element !== audioElement
        ) {
            return null;
        }

        return element;
    }

    /**
     * Handle the media play event.
     *
     * @param {Event} event
     */
    function handlePlay(event) {
        const audio = getEventAudio(event);

        if (!audio || !state.currentTrack) return;

        state.isPlaying = !audio.paused;
        state.isLoading = false;
        state.errorMessage = "";
    }

    /**
     * Handle the media pause event.
     *
     * @param {Event} event
     */
    function handlePause(event) {
        const audio = getEventAudio(event);

        if (!audio) return;

        state.isPlaying = !audio.paused;

        if (audio.paused) {
            state.isLoading = false;
        }
    }

    /**
     * Handle buffering.
     *
     * @param {Event} event
     */
    function handleWaiting(event) {
        const audio = getEventAudio(event);

        if (!audio || audio.paused) return;

        state.isLoading = true;
    }

    /**
     * Handle playback resuming after buffering.
     *
     * @param {Event} event
     */
    function handlePlaying(event) {
        const audio = getEventAudio(event);

        if (!audio || !state.currentTrack) return;

        state.isPlaying = true;
        state.isLoading = false;
    }

    /**
     * Handle media becoming available for playback.
     *
     * @param {Event} event
     */
    function handleCanPlay(event) {
        const audio = getEventAudio(event);

        if (!audio) return;

        if (!audio.paused) {
            state.isLoading = false;
        }
    }

    /**
     * Update actual playback position.
     *
     * @param {Event} event
     */
    function handleTimeUpdate(event) {
        const audio = getEventAudio(event);

        if (!audio || !state.currentTrack) return;

        if (
            Number.isFinite(audio.currentTime) &&
            audio.currentTime >= 0
        ) {
            state.currentTime = audio.currentTime;
        }
    }

    /**
     * Update duration after audio metadata loads.
     *
     * @param {Event} event
     */
    function handleMetadata(event) {
        const audio = getEventAudio(event);

        if (!audio || !state.currentTrack) return;

        if (
            Number.isFinite(audio.duration) &&
            audio.duration >= 0
        ) {
            state.duration = audio.duration;
        }

        if (
            Number.isFinite(audio.currentTime) &&
            audio.currentTime >= 0
        ) {
            state.currentTime = audio.currentTime;
        }
    }

    /**
     * Handle playback completion.
     *
     * Automatically advance when another queued track exists.
     *
     * @param {Event} event
     */
    function handleEnded(event) {
        const audio = getEventAudio(event);

        if (!audio || !state.currentTrack) return;

        state.currentTime = audio.currentTime;
        state.isPlaying = false;
        state.isLoading = false;

        if (state.queueIndex < state.queue.length - 1) {
            void playNext();
        }
    }

    /**
     * Handle audio errors.
     *
     * @param {Event} event
     */
    function handleError(event) {
        const audio = getEventAudio(event);

        if (!audio || !state.currentTrack) return;

        console.error("Audio resource failed:", {
            songId: state.currentTrack.id,
            mediaErrorCode: audio.error?.code ?? null
        });

        state.isPlaying = false;
        state.isLoading = false;

        state.errorMessage =
            "Unable to play this track. Reload the page and try again.";
    }

    // =========================================================
    // VOLUME CONTROL
    // =========================================================

    /**
     * Set playback volume between 0 and 1.
     *
     * 0   = muted
     * 0.8 = 80% volume
     * 1   = 100% volume
     *
     * @param {number} value
     * @returns {boolean}
     */
    function setVolume(value) {
        if (!Number.isFinite(value)) return false;

        const nextVolume = Math.max(
            0,
            Math.min(1, value)
        );

        state.volume = nextVolume;
        state.isMuted = nextVolume === 0;

        // Remember the most recent non-zero volume.
        if (nextVolume > 0) {
            lastNonZeroVolume = nextVolume;
        }

        if (audioElement) {
            audioElement.volume = nextVolume;
            audioElement.muted = state.isMuted;
        }

        return true;
    }

    /**
     * Toggle mute while retaining the last selected volume.
     *
     * Muting does not destroy or reset the volume setting.
     * Unmuting restores the previous non-zero volume.
     */
    function toggleMute() {
        if (state.isMuted) {
            const restoredVolume =
                lastNonZeroVolume > 0
                    ? lastNonZeroVolume
                    : 0.8;

            state.volume = restoredVolume;
            state.isMuted = false;

            if (audioElement) {
                audioElement.volume = restoredVolume;
                audioElement.muted = false;
            }

            return;
        }

        if (state.volume > 0) {
            lastNonZeroVolume = state.volume;
        }

        state.isMuted = true;

        if (audioElement) {
            audioElement.muted = true;
        }
    }

    /**
     * Synchronize native media volume changes with reactive state.
     *
     * @param {Event} event
     */
    function handleVolumeChange(event) {
        const audio = getEventAudio(event);

        if (!audio) return;

        state.isMuted = audio.muted || audio.volume === 0;

        if (audio.volume > 0) {
            state.volume = audio.volume;
            lastNonZeroVolume = audio.volume;
        }
    }

    // =========================================================
    // CONTROLLER PUBLIC INTERFACE
    // =========================================================

    return {
        state,

        attachAudioElement,
        detachAudioElement,

        playTrack,
        toggleTrack,
        toggleCurrentTrack,

        playNext,
        playPrevious,
        addToQueue,

        pause,
        stop,
        clearTrack,
        removeTrack,
        clearQueue,

        seekTo,
        updateTrackMetadata,

        // Volume methods
        setVolume,
        toggleMute,

        // Audio event handlers
        handlePlay,
        handlePause,
        handleWaiting,
        handlePlaying,
        handleCanPlay,
        handleTimeUpdate,
        handleMetadata,
        handleEnded,
        handleError,
        handleVolumeChange
    };
}